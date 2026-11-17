// LCQ 대회일(24시간) 시뮬레이션: 예약 실행을 720번 돌려 KV 쓰기·읽기가 몇 번 나가는지 센다.
// 사용: node kv-sim.mjs [경로=worker/streams]
import worker from './worker.js';

const MIN = 60e3;
let now = Date.UTC(2026, 10, 20, 0, 0, 0); // 2026-11-20 09:00 KST (무료 한도 리셋 시각)
const realNow = Date.now;
Date.now = () => now;

function makeKv() {
  const store = new Map();
  const ops = { get: 0, put: 0 };
  return {
    store, ops,
    async get(key, opt) {
      ops.get++;
      const raw = store.get(key); if (raw == null) return null;
      return opt === 'json' || opt?.type === 'json' ? JSON.parse(raw) : raw;
    },
    async put(key, v) { ops.put++; store.set(key, v); },
  };
}
function makeCache() {
  const m = new Map();
  const keyOf = (k) => (typeof k === 'string' ? k : k.url);
  const ttlOf = (res) => Number((/max-age=(\d+)/.exec(res.headers.get('Cache-Control') || '') || [])[1] || 0);
  return {
    m,
    async match(k) {
      const e = m.get(keyOf(k)); if (!e || e.exp <= now) return null;
      return new Response(e.body, { headers: e.headers });
    },
    async put(k, res) { m.set(keyOf(k), { body: await res.clone().text(), headers: Object.fromEntries(res.headers), exp: now + (ttlOf(res) || 3600) * 1000 }); },
  };
}

const YT_ID = `UC${'a'.repeat(22)}`;
const PUB = '2026-11-20T07:00:00.000Z';
const CHANNELS = {
  channels: [
    { key: 'o:en', who: '영어 공식 중계', kind: 'official', twitch: 'playapex', youtube: '@playapexesports' },
    { key: 'o:ja', who: '일본어 공식 중계 (RAGE)', kind: 'official', apexOnly: true, twitch: 'esports_rage', youtube: '@esports_rage' },
    { key: 'p:one', who: '테스트선수', kind: 'player', team: 'TST', twitch: 'tester', chzzk: 'a'.repeat(32) },
  ],
  intl: Array.from({ length: 60 }, (_, i) => [`intl${i}`, `해외선수${i}`, 'INTL']),
  pov: Array.from({ length: 84 }, (_, i) => `algs${1 + (i % 4)}_team${1 + (i % 20)}`),
};
const feedXml = () => `<?xml version="1.0"?><feed xmlns:yt="http://www.youtube.com/xml/schemas/2015">
<author><name>테스트채널</name></author>
${Array.from({ length: 15 }, (_, i) => `<entry><yt:videoId>vid${String(i).padStart(3, '0')}</yt:videoId><title>영상 ${i}</title><published>${PUB}</published></entry>`).join('')}</feed>`;
const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } });
const T = (t, s = 200) => new Response(t, { status: s, headers: { 'Content-Type': 'application/xml' } });

// 대회일: APAC North 경기 17:00~01:00 KST(= 08:00~16:00 UTC) 사이에 공식 중계가 켜지고 시청자 수가 계속 바뀐다
const liveAt = (t) => { const h = new Date(t).getUTCHours(); return h >= 8 && h < 16; };
const fakeFetch = async (input) => {
  const u = new URL(String(input));
  const host = u.hostname, p = u.pathname;
  if (host === 'laplussugar.github.io') return J(CHANNELS);
  if (host === 'id.twitch.tv') return J({ access_token: 'tok', expires_in: 2592000 });
  if (host === 'api.twitch.tv') {
    if (!liveAt(now)) return J({ data: [] });
    const data = [{ id: 's1', user_login: 'playapex', type: 'live', game_name: 'Apex Legends', title: 'ALGS LCQ', viewer_count: 3000 + Math.floor(now / MIN) % 900, started_at: '2026-11-20T08:00:00Z', thumbnail_url: 'https://x/{width}x{height}.jpg' }];
    if (String(u.searchParams.toString()).includes('esports_rage')) data.push({ id: 's2', user_login: 'esports_rage', type: 'live', game_name: 'Apex Legends', title: 'ALGS LCQ JP', viewer_count: 1200 + Math.floor(now / MIN) % 300, started_at: '2026-11-20T08:00:00Z', thumbnail_url: 'https://x/{width}x{height}.jpg' });
    return J({ data });
  }
  if (host === 'www.googleapis.com' && p.endsWith('/channels')) return J({ items: [{ id: YT_ID }] });
  if (host === 'www.googleapis.com' && p.endsWith('/videos')) {
    const ids = (u.searchParams.get('id') || '').split(',').filter(Boolean);
    return J({ items: ids.map((id) => ({ id, snippet: { title: '영상', liveBroadcastContent: 'none', tags: [] } })) });
  }
  if (host === 'www.youtube.com') return T(u.searchParams.has('playlist_id') ? '<feed></feed>' : feedXml());
  if (host === 'api.chzzk.naver.com') return J({ code: 200, content: { status: 'CLOSE' } });
  throw new Error('unexpected ' + input);
};

const kv = makeKv();
globalThis.fetch = fakeFetch;
globalThis.caches = { default: makeCache() };
const env = { KV: kv, SITE_URL: 'https://laplussugar.github.io/algs-kr', ALLOWED_ORIGIN: 'https://laplussugar.github.io', VIDEO_DAYS: '21', TWITCH_CLIENT_ID: 'c', TWITCH_CLIENT_SECRET: 's', YOUTUBE_API_KEY: 'y' };

// 예약 실행 720번 = 24시간
for (let i = 0; i < 720; i++) {
  let job = null;
  await worker.scheduled({}, env, { waitUntil: (p) => { job = p; } });
  if (job) await job;
  now += 2 * MIN;
}
const blob = JSON.parse(kv.store.get('blob'));
const liveHours = 8;

// 사이트 방문: 대회 시간대에 동시 방문자 N명이 60초마다 요청한다고 보고 KV 읽기를 센다 (지역 캐시 30초)
async function visits(concurrent, minutes) {
  const before = kv.ops.get;
  for (let m = 0; m < minutes; m++) {
    for (let c = 0; c < concurrent; c++) {
      await worker.fetch(new Request('https://w.example.workers.dev/streams.json'), env, { waitUntil: () => {} });
      now += 1000; // 사람마다 1초씩 어긋나게
    }
    now += 60e3 - Math.min(60, concurrent) * 1000;
  }
  return kv.ops.get - before;
}
const readDuringEvent = await visits(40, 60); // 40명 × 60분
console.log('');
console.log(`LCQ 대회일 시뮬레이션 (24시간, 방송 ${liveHours}시간)`);
console.log(`  KV 쓰기: ${kv.ops.put}회 / 무료 한도 1,000 (${(kv.ops.put / 10).toFixed(1)}%)   ← 전에는 720회`);
console.log(`  KV 읽기(예약 실행 포함): ${kv.ops.get}회`);
console.log(`  대회 1시간·동시 40명 방문 시 KV 읽기: ${readDuringEvent}회 (캐시 없던 전에는 약 ${40 * 60}회)`);
console.log(`  KV 값 크기: ${(kv.store.get('blob').length / 1024).toFixed(0)} KB`);
Date.now = realNow;
