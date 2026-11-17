// 방송 Worker 의 KV 사용량 규칙 시험 (의존성 없음: node worker/streams/test.mjs)
//
// 예약 실행을 시간을 옮겨 가며 여러 번 돌려, KV 쓰기·읽기가 정해진 규칙대로만 나가는지 센다.
//   - 내용이 그대로면 다시 쓰지 않는다 (전에는 2분마다 720번 = 무료 한도 1,000의 72%를 썼다)
//   - 방송이 시작·종료되면 바로 쓴다
//   - 방송 중에는 LIVE_WRITE_SEC(3분), 아무것도 없으면 IDLE_WRITE_SEC(10분) 간격으로만 쓴다
//   - 사이트 요청은 지역 캐시(Cache API)에 있으면 KV 를 읽지 않는다
// fetch·KV·캐시·시각을 가짜로 바꿔 끼우므로 바깥으로 나가는 요청은 없다.
import assert from 'node:assert/strict';
import worker from './worker.js';

const MIN = 60e3;
const realNow = Date.now;
let now = Date.UTC(2026, 10, 19, 9, 0, 0); // 2026-11-19 18:00 KST, 2분 간격의 첫 차례
Date.now = () => now;

// ── 가짜 KV ──
function makeKv() {
  const store = new Map();
  const ops = { get: 0, put: 0, fail: false };
  return {
    store, ops,
    async get(key, opt) {
      ops.get++;
      if (ops.fail) throw new Error('KV GET failed: 429 too many operations');
      const raw = store.get(key);
      if (raw == null) return null;
      const type = opt === 'json' || opt?.type === 'json' ? 'json' : 'text';
      return type === 'json' ? JSON.parse(raw) : raw;
    },
    async put(key, value) {
      ops.put++;
      if (ops.fail) throw new Error('KV PUT failed: 429 too many operations');
      store.set(key, value);
    },
  };
}

// ── 가짜 지역 캐시 (Cache API): 같은 지역에서만 보이는 캐시 ──
function makeCache() {
  const m = new Map();
  const keyOf = (k) => (typeof k === 'string' ? k : k.url);
  const ttlOf = (res) => Number((/max-age=(\d+)/.exec(res.headers.get('Cache-Control') || '') || [])[1] || 0);
  return {
    m,
    async match(key) {
      const e = m.get(keyOf(key));
      if (!e) return null;
      if (e.exp <= now) { m.delete(keyOf(key)); return null; }
      return new Response(e.body, { headers: e.headers });
    },
    async put(key, res) {
      const body = await res.clone().text();
      m.set(keyOf(key), { body, headers: Object.fromEntries(res.headers), exp: now + (ttlOf(res) || 3600) * 1000 });
    },
  };
}

// ── 가짜 바깥 서비스 ──
const YT_ID = `UC${'a'.repeat(22)}`;
const PUB1 = '2026-11-18T12:00:00.000Z', PUB2 = '2026-11-18T09:30:00.000Z', PUB3 = '2026-11-19T08:00:00.000Z';
const CHANNELS = {
  channels: [
    { key: 'o:en', who: '영어 공식 중계', kind: 'official', twitch: 'playapex', youtube: '@playapexesports' },
    { key: 'p:one', who: '테스트선수', kind: 'player', team: 'TST', twitch: 'tester', chzzk: 'a'.repeat(32) },
  ],
  intl: [], pov: [],
};
const feedXml = () => `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015"><author><name>테스트채널</name></author>
${newVideo ? `<entry><yt:videoId>vid002</yt:videoId><title>새로 올라온 영상</title><published>${PUB3}</published></entry>` : ''}
<entry><yt:videoId>vid001</yt:videoId><title>영상 하나</title><published>${PUB1}</published></entry>
<entry><yt:videoId>vid000</yt:videoId><title>영상 둘</title><published>${PUB2}</published></entry>
</feed>`;
const J = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
const T = (text, status = 200) => new Response(text, { status, headers: { 'Content-Type': 'application/xml' } });

let live = false; // 방송 중인가 (Twitch 응답이 바뀐다)
let newVideo = false; // 새 영상이 올라온 차례
const calls = [];
const fakeFetch = async (input) => {
  const u = new URL(String(input));
  const host = u.hostname, p = u.pathname;
  calls.push(host + p);
  if (host === 'laplussugar.github.io') return J(CHANNELS);
  if (host === 'id.twitch.tv') return J({ access_token: 'tok', expires_in: 2592000 });
  if (host === 'api.twitch.tv') {
    return J({
      data: live ? [{
        id: 's1', user_login: 'playapex', type: 'live', game_name: 'Apex Legends',
        title: 'ALGS LCQ Day 1', viewer_count: 1000 + Math.floor(now / MIN) % 500,
        started_at: '2026-11-19T08:00:00Z', thumbnail_url: 'https://x/{width}x{height}.jpg',
      }] : [],
    });
  }
  if (host === 'www.googleapis.com' && p.endsWith('/channels')) return J({ items: [{ id: YT_ID }] });
  if (host === 'www.googleapis.com' && p.endsWith('/videos')) {
    const ids = (u.searchParams.get('id') || '').split(',').filter(Boolean);
    return J({ items: ids.map((id) => ({ id, snippet: { title: '영상', liveBroadcastContent: 'none', tags: [] } })) });
  }
  if (host === 'www.youtube.com') return T(u.searchParams.has('playlist_id') ? '<feed></feed>' : feedXml());
  if (host === 'api.chzzk.naver.com') return J({ code: 200, content: { status: 'CLOSE' } });
  throw new Error(`예상하지 못한 요청: ${input}`);
};

// ── 가짜 환경 ──
const kv = makeKv();
const cache = makeCache();
globalThis.fetch = fakeFetch;
globalThis.caches = { default: cache };
const env = {
  KV: kv,
  SITE_URL: 'https://laplussugar.github.io/algs-kr',
  ALLOWED_ORIGIN: 'https://laplussugar.github.io',
  VIDEO_DAYS: '21',
  TWITCH_CLIENT_ID: 'cid', TWITCH_CLIENT_SECRET: 'csecret', YOUTUBE_API_KEY: 'ykey',
  // 번역(AI)은 이 시험에서 끈다: 글자 그대로가 아니라 호출 횟수 규칙만 보면 된다
};
const ORIGIN = 'https://algs-kr-streams.example.workers.dev';

async function runScheduled(minutes = 0) {
  now += minutes * MIN;
  let job = null;
  await worker.scheduled({}, env, { waitUntil: (p) => { job = p; } });
  if (job) await job;
  return kv.store.get('blob') ? JSON.parse(kv.store.get('blob')) : null;
}

async function request(path = '/streams.json') {
  const res = await worker.fetch(new Request(ORIGIN + path), env, { waitUntil: () => {} });
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch { /* JSON 아님 */ }
  return { res, body };
}

const ok = (name) => console.log(`  ✓ ${name}`);

// ── 1. 첫 실행: 한 번 적는다 ──
let blob = await runScheduled(0);
assert.equal(kv.ops.put, 1, '첫 실행은 KV 에 한 번 적는다');
assert.ok(blob.latest.videos.length >= 2, '최근 영상이 담긴다');
assert.equal(blob.latest.live.length, 0, '방송 중인 채널이 없다');
assert.equal(blob.n?.count, 1, '오늘 적은 횟수를 센다(/debug/kv)');
ok(`첫 실행 → KV 쓰기 ${kv.ops.put}회`);

// ── 2. 2분 뒤, 내용이 같으면 쓰지 않는다 ──
blob = await runScheduled(2);
assert.equal(kv.ops.put, 1, '내용이 그대로면 KV 에 다시 쓰지 않는다');
ok('내용이 같은 다음 차례 → 쓰기 없음');

// ── 3. 방송이 시작되면 다음 차례에 바로 적는다 ──
live = true;
blob = await runScheduled(2);
assert.equal(kv.ops.put, 2, '방송이 시작되면 바로 적는다');
assert.equal(blob.latest.live.length, 1, '방송 중 목록에 들어간다');
ok(`방송 시작 → KV 쓰기 ${kv.ops.put}회 (바로)`);

// ── 4. 방송 중 2분 뒤: 시청자 수만 바뀌었으므로 아직 쓰지 않는다 ──
blob = await runScheduled(2);
assert.equal(kv.ops.put, 2, '방송 중에도 3분 간격을 지킨다');
ok('방송 중 2분 뒤 → 쓰기 없음(3분 간격)');

// ── 5. 방송 중 4분 뒤: 시청자 수 갱신을 위해 적는다 ──
blob = await runScheduled(2);
assert.equal(kv.ops.put, 3, '방송 중 3분이 지나면 적는다');
ok(`방송 중 3분 경과 → KV 쓰기 ${kv.ops.put}회`);

// ── 6. 방송이 끝나면 바로 적는다 ──
live = false;
blob = await runScheduled(2);
assert.equal(kv.ops.put, 4, '방송이 끝나면 바로 적는다');
assert.equal(blob.latest.live.length, 0);
ok('방송 종료 → 바로 적는다');

// ── 7. 새 영상이 올라오면 다음 차례에 바로 적는다 ──
newVideo = true;
const beforeVideo = kv.ops.put;
for (let i = 0; i < 3 && kv.ops.put === beforeVideo; i++) blob = await runScheduled(2); // 피드는 차례가 돌아와야 받는다
assert.equal(kv.ops.put, beforeVideo + 1, '새 영상은 바로 적는다');
assert.ok(blob.latest.videos.some((v) => v.id === 'vid002'), '새 영상이 목록에 들어간다');
ok('새 영상 → KV 쓰기 1회 (바로)');
newVideo = false;

// ── 8. 아무 방송도 없이 1시간: 10분 간격(6번)만 적는다 ──
const before = kv.ops.put;
for (let i = 0; i < 30; i++) blob = await runScheduled(2); // 60분
const idleWrites = kv.ops.put - before;
assert.ok(idleWrites >= 5 && idleWrites <= 8, `한 시간에 10분 간격이면 5~6번 (실제 ${idleWrites})`);
ok(`평소 1시간 → KV 쓰기 ${idleWrites}회 (전에는 30회)`);

// ── 9. 사이트 요청: 지역 캐시에 있으면 KV 를 읽지 않는다 ──
now += 30 * MIN; // 캐시가 비워진 시점
cache.m.clear();
const r1 = await request();
const gets1 = kv.ops.get;
assert.equal(r1.res.headers.get('X-Cache'), 'miss', '처음 요청은 캐시 miss');
assert.equal(r1.res.status, 200);
assert.ok(Array.isArray(r1.body.videos), '응답이 streams.json 모양이다');
const r2 = await request();
assert.equal(r2.res.headers.get('X-Cache'), 'hit', '곧바로 온 요청은 캐시 hit');
assert.equal(kv.ops.get, gets1, '캐시 hit 이면 KV 를 읽지 않는다');
ok(`요청 2번 → KV 읽기 ${gets1 - (r1.body ? 0 : 0)}회 중 1회만 (캐시 hit)`);

// ── 10. KV 를 못 읽어도 터지지 않는다 (한도 초과 등: 사이트는 받아 둔 값을 계속 쓴다) ──
cache.m.clear();
kv.ops.fail = true;
const bad = await request();
kv.ops.fail = false;
assert.equal(bad.res.status, 503, 'KV 를 못 읽으면 503');
assert.equal(bad.body.error, 'kv read failed');
ok('KV 장애 → 503 (Worker 는 죽지 않는다)');

// ── 11. 예약 실행이 멈춰 값이 아주 낡았을 때만 요청이 대신 모은다 ──
cache.m.clear();
now += 65 * MIN; // 예약 실행이 65분째 없다
const stale1 = await request();
const putsStale = kv.ops.put;
assert.equal(stale1.res.headers.get('X-Cache'), 'miss');
assert.ok(putsStale >= 1, '낡은 값을 만나면 한 번 모아서 적는다');
const stale2 = await request(); // 같은 지역에서 곧바로: 캐시 hit → 추가 수집 없음
assert.equal(stale2.res.headers.get('X-Cache'), 'hit');
assert.equal(kv.ops.put, putsStale, '같은 지역의 다음 요청은 다시 모으지 않는다');
ok('예약 실행이 멈춘 경우 → 요청이 한 번만 대신 모은다');

// ── 12. 예전 형식(state 에 받은 때(at)를 적어 둔 blob)이 남아 있어도 그대로 이어진다 ──
cache.m.clear();
const before13 = kv.ops.put;
kv.store.set('blob', JSON.stringify({
  state: {
    channels: { at: now - 600e3, list: CHANNELS.channels, intl: [], pov: [] },
    feeds: { [YT_ID]: { at: now - 300e3, items: [{ id: 'vid001', title: '영상 하나', published: PUB1, channel: '테스트채널' }] } },
    shorts: {}, ytIds: { playapexesports: YT_ID },
    token: { token: 'tok', exp: now + 86400e3 },
  },
  latest: { at: new Date(now - 60e3).toISOString(), ok: { twitch: true, youtube: true, chzzk: true }, live: [], videos: [] },
  at: now - 60e3,
}));
blob = await runScheduled(2);
assert.ok(kv.ops.put >= before13, '예전 형식 뒤에도 정상으로 돈다');
assert.ok(!('at' in (blob.state.feeds[YT_ID] || {})), '피드에는 이제 받은 때를 적지 않는다');
const migrated = await request();
assert.equal(migrated.res.status, 200);
assert.ok(migrated.body.videos.length >= 1, '영상 목록이 그대로 나온다');
ok('예전 형식 blob → 그대로 이어짐');

// ── 정리 ──
Date.now = realNow;
console.log('');
console.log(`전체 KV: 읽기 ${kv.ops.get}회 · 쓰기 ${kv.ops.put}회`);
console.log('KV 사용량 시험 통과');
