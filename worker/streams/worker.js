// 방송 상태 Worker (Cloudflare Workers). KV 가 묶여 있으면 예약 실행 + KV, 없으면 예전처럼 캐시만 쓴다
//
// GET /streams.json → { at, ok, live: [...], videos: [...] }
//   - 채널 목록은 사이트가 빌드 때 내보내는 data/stream-channels.json 을 읽는다 (10분 캐시).
//   - 방송 중 확인: Twitch(Helix Get Streams), YouTube(채널 피드의 최근 영상 → videos.list), 치지직(채널 라이브 정보, 비공식)
//   - 최근 영상: YouTube 채널 공개 피드(키·할당량 없음)에서 최근 VIDEO_DAYS일
//   - 수집 결과는 KV 한 칸('blob' = { state, latest, at })에 두고, 사이트 요청은 그 값을 바로 돌려준다.
//   - 한 플랫폼이 실패하면 그 플랫폼만 ok=false 로 알리고 나머지는 정상 응답한다.
//
// KV 무료 한도(읽기 100,000 · 쓰기 1,000/일 · 같은 키 초당 1번)를 대회 중에도 넘지 않게:
//   쓰기 — 예약 실행은 2분마다 돌지만 KV 에는 아래 세 경우에만 적는다 (전에는 매번 적어 하루 720번 = 72%였고,
//          피드·쇼츠를 받은 때까지 state 에 적어 두어 내용이 같아도 매번 달라졌다).
//          ① 화면에 바로 보이는 게 바뀌었을 때 (방송 시작·종료·제목, 새 영상) — 바로 적는다
//          ② 방송 중일 때 3분에 한 번 (시청자 수가 계속 바뀌므로)
//          ③ 아무것도 없을 때 10분에 한 번 (사이트의 '마지막 확인' 시각이 너무 낡지 않게)
//          번역·플랫폼 상태 같은 곁다리 변화는 ②③ 의 간격에 맞춰 같이 적는다.
//          → 대회일 300~400번, 평일 150번 안팎.
//   읽기 — 사이트 요청마다 KV 를 읽지 않고 Cache API(같은 지역 캐시)를 먼저 본다.
//          지역마다 EDGE_TTL_SEC(30초)에 한 번만 KV 를 읽는다 → 방문자가 늘어도 KV 읽기는 그대로.
//
// 비밀 값(wrangler secret): TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, YOUTUBE_API_KEY
// 변수(wrangler.toml): SITE_URL, ALLOWED_ORIGIN, VIDEO_DAYS, LIVE_TTL,
//   LIVE_WRITE_SEC, IDLE_WRITE_SEC, MIN_WRITE_GAP_SEC, STALE_SEC, EDGE_TTL_SEC, CRON_MINUTES
import { collect } from './collect.js';

const BLOB = 'blob';
const reply = (body, status, headers) => new Response(typeof body === 'string' ? body : JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
});

// 하루 안에서 KV 를 얼마나 쓰고 읽을지 정하는 값 (wrangler.toml [vars] 에서 바꿀 수 있다)
const settings = (env) => ({
  liveWriteMs: Number(env.LIVE_WRITE_SEC || 180) * 1e3, // 방송 중일 때 KV 에 적는 간격 (시청자 수 갱신)
  idleWriteMs: Number(env.IDLE_WRITE_SEC || 600) * 1e3, // 아무것도 없을 때 KV 에 적는 간격
  staleMs: Number(env.STALE_SEC || 1200) * 1e3, // 예약 실행이 이만큼 못 돌면 요청이 대신 모은다
  edgeSec: Number(env.EDGE_TTL_SEC || 30), // 같은 지역 캐시가 응답을 들고 있는 시간
  minGapMs: Number(env.MIN_WRITE_GAP_SEC || 45) * 1e3, // 아무리 자주 바뀌어도 KV 에는 이 간격을 두고 적는다
});

// ── 같은 지역(데이터센터) 캐시 ──
// Cache API 는 지역마다 따로 있고(전 세계 공유 아님), 실패해도 KV 로 그대로 넘어가게 감싼다.
const edgeKey = (origin, name) => `${origin}/__streams/${name}`;
async function edgeGet(origin, name) {
  try { return await caches.default.match(edgeKey(origin, name)); } catch { return null; }
}
async function edgePut(origin, name, text, maxAge, type = 'application/json; charset=utf-8') {
  try {
    await caches.default.put(edgeKey(origin, name), new Response(text, {
      headers: { 'Content-Type': type, 'Cache-Control': `public, max-age=${Math.max(1, Math.floor(maxAge))}` },
    }));
  } catch { /* 캐시에 못 넣어도 응답은 그대로 나간다 */ }
}
const maxAgeOf = (res, fallback) => Number((/max-age=(\d+)/.exec(res.headers.get('Cache-Control') || '') || [])[1] || fallback);

// ── 수집 결과가 달라졌는지 ──
// 시청자 수와 수집 시각(at)은 뺀다: 방송 중에는 매번 바뀌므로 그것만으로 KV 에 쓰면 한도가 남지 않는다.
// 화면에 바로 보이는 것(방송 시작·종료·제목·새 영상)은 hard, 그 밖(번역·플랫폼 상태)은 soft 로 나누어
// hard 는 바로, soft 는 정해진 간격에만 적는다.
const hardSig = (latest) => (!latest ? '' : JSON.stringify([
  (latest.live || []).map((l) => [l.key, l.platform, l.who, l.team || '', l.title, l.started || '', l.url]),
  (latest.videos || []).map((v) => [v.id, v.who, v.title, v.published, v.short ? 1 : 0]),
]));
const softSig = (latest) => (!latest ? '' : JSON.stringify([
  (latest.live || []).map((l) => [l.tr?.ko || '', l.tr?.ja || '', l.tr?.en || '']),
  latest.ok || null, latest.err || null,
]));

// KV 에 적을지: 화면 내용이 바뀌었으면 바로, 아니면 방송 중 3분·아무것도 없을 때 10분에 한 번
function writeDecision({ env, blob, latest, stateChanged, now }) {
  const s = settings(env);
  const live = (latest.live || []).length > 0;
  const since = now - (blob.at || 0);
  const tick = () => since >= (live ? s.liveWriteMs : s.idleWriteMs);
  if (!blob.latest) return { write: true, why: 'first' };
  if (since < s.minGapMs) return { write: false, why: 'too-soon' };
  if (hardSig(latest) !== hardSig(blob.latest)) return { write: true, why: 'content' };
  if (stateChanged || softSig(latest) !== softSig(blob.latest)) return { write: tick(), why: tick() ? 'soft' : 'soft-wait' };
  return { write: tick(), why: live ? 'live-tick' : 'idle-tick' };
}

// 한 번 모아서 필요하면 KV 에 적는다. state 는 collect() 가 blob.state 를 그 자리에서 고치므로 앞뒤로 비교한다
async function runKv(env, blob) {
  const now = Date.now();
  const before = JSON.stringify(blob.state || {});
  const latest = await collect({
    env, fetch: (u, o) => fetch(u, o), now,
    store: { get: async () => blob.state || null, put: async (_k, v) => { blob.state = v; } },
  });
  const stateChanged = JSON.stringify(blob.state || {}) !== before;
  const { write, why } = writeDecision({ env, blob, latest, stateChanged, now });
  const next = { state: blob.state || null, latest, at: write ? now : blob.at || 0 };
  if (write) {
    try { await env.KV.put(BLOB, JSON.stringify(next)); }
    catch (e) {
      // 쓰기 한도를 넘겼거나 KV 가 잠깐 막힌 경우: 이번 결과는 이 요청에만 쓰고 다음 차례에 다시 적는다
      next.at = blob.at || 0;
      return { blob: next, write: false, why: `put-failed: ${String(e?.message || e).slice(0, 60)}` };
    }
  }
  return { blob: next, write, why };
}

export default {
  async scheduled(_event, env, ctx) {
    if (!env.KV) return;
    ctx.waitUntil((async () => {
      const blob = (await env.KV.get(BLOB, 'json')) || {};
      await runKv(env, blob);
    })().catch(() => {}));
  },
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const cors = { 'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*', 'Vary': 'Origin' };
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    // 점검용: 치지직이 채널마다 무엇을 돌려주는지 요약해서 보여 준다 (공개 정보만, 배포 점검 워크플로가 읽는다)
    if (url.pathname === '/debug/chzzk') {
      const S = await readState(env, url.origin);
      const chs = (S.channels?.list || []).filter((c) => c.chzzk).slice(0, 12);
      const paths = ['service/v2/channels/ID/live-detail', 'service/v3/channels/ID/live-detail', 'polling/v2/channels/ID/live-status'];
      const out = await Promise.all(chs.map(async (c, i) => {
        const row = { who: c.who };
        for (const p of (i < 3 ? paths : paths.slice(0, 1))) {
          try {
            const r = await fetch(`https://api.chzzk.naver.com/${p.replace('ID', c.chzzk)}`, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; algs-kr-streams)' } });
            const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { /* JSON 아님 */ }
            const d = j?.content;
            row[p.split('/')[1] + ':' + p.split('/').pop()] = { http: r.status, code: j?.code ?? null, keys: d ? Object.keys(d).slice(0, 40).join(',') : null, status: d?.status ?? null, cat: d?.liveCategory ?? null, catValue: d?.liveCategoryValue ?? null, title: d?.liveTitle ? String(d.liveTitle).slice(0, 40) : null, raw: j ? undefined : t.slice(0, 120) };
          } catch (e) { row[p] = { error: String(e).slice(0, 80) }; }
        }
        return row;
      }));
      return reply(out, 200, cors);
    }
    // 점검용: Twitch 채널 찾기 (?q=검색어 여러 개는 쉼표로). 공개 정보만
    if (url.pathname === '/debug/twitch') {
      const S = await readState(env, url.origin);
      if (!S.token?.token) return reply({ error: 'no token yet' }, 200, cors);
      const H = { headers: { Authorization: `Bearer ${S.token.token}`, 'Client-Id': env.TWITCH_CLIENT_ID } };
      const out = {};
      for (const q of String(url.searchParams.get('q') || 'algs').split(',').slice(0, 8)) {
        try { const j = await (await fetch(`https://api.twitch.tv/helix/search/channels?first=40&query=${encodeURIComponent(q)}`, H)).json(); out[q] = (j.data || []).map((c) => `${c.broadcaster_login}${c.is_live ? '(LIVE)' : ''} | ${c.display_name} | ${c.game_name || '-'} | ${String(c.title || '').slice(0, 60)}`); } catch (e) { out[q] = String(e).slice(0, 80); }
      }
      return reply(out, 200, cors);
    }
    if (url.pathname !== '/streams.json') return reply({ error: 'not found' }, 404, cors);
    if (env.KV) {
      const { text, status, hit, maxAge } = await serveKv(env, url);
      return reply(text, status, { ...cors, 'Cache-Control': `public, max-age=${maxAge}`, 'X-Cache': hit ? 'hit' : 'miss' });
    }
    // KV 가 없을 때(배포 워크플로가 KV 저장소를 못 만든 경우): 예전처럼 요청이 왔을 때만 모아 캐시에 둔다
    const ttl = Number(env.LIVE_TTL || 60), keep = Number(env.STALE_TTL || 900);
    const cache = caches.default, key = new Request(`${url.origin}/streams.json`);
    // 모은 결과는 keep초 동안 두고, ttl초가 지나면 '낡은 것'으로 본다.
    // 낡았어도 있는 응답을 바로 돌려주고(사이트가 기다리지 않게) 뒤에서 새로 모은다. 아예 없을 때만 모으는 동안 기다린다.
    const build = async () => {
      const body = await collect({ env, fetch: (u, o) => fetch(u, o), store: cacheStore(cache, url.origin), now: Date.now() });
      const fresh = reply(body, 200, { 'Cache-Control': `public, max-age=${keep}`, 'X-At': String(Date.now()) });
      await cache.put(key, fresh.clone());
      return fresh;
    };
    let hit = await cache.match(key);
    if (!hit) hit = await build();
    else if (Date.now() - Number(hit.headers.get('X-At') || 0) > ttl * 1000) {
      // 여러 요청이 한꺼번에 새로 모으지 않게 20초짜리 표시를 둔다
      const lock = new Request(`${url.origin}/__refreshing`);
      if (!(await cache.match(lock))) {
        ctx.waitUntil((async () => { await cache.put(lock, new Response('1', { headers: { 'Cache-Control': 'public, max-age=20' } })); await build(); })().catch(() => {}));
      }
    }
    const res = new Response(hit.body, hit);
    for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
    res.headers.set('Cache-Control', 'no-store'); // 브라우저·중간 캐시는 두지 않는다(낡은 응답을 15분씩 붙들지 않게)
    return res;
  },
};

// ── /streams.json (KV 방식) ──
// 지역 캐시 → KV 순서로 본다. 예약 실행이 멈춰 KV 가 아주 낡았을 때만 이 요청이 대신 모은다(지역마다 1분에 한 번).
async function serveKv(env, url) {
  const s = settings(env);
  const hit = await edgeGet(url.origin, 'streams.json');
  if (hit) {
    const maxAge = maxAgeOf(hit, s.edgeSec);
    return { text: await hit.text(), status: 200, hit: true, maxAge };
  }
  let blob = {};
  try { blob = (await env.KV.get(BLOB, 'json')) || {}; }
  catch (e) {
    // KV 를 못 읽어도(한도 초과 등) 사이트는 지난 응답을 그대로 쓴다: 503 이면 사이트가 받아 둔 값을 유지한다
    return { text: { error: 'kv read failed', message: String(e?.message || e).slice(0, 120) }, status: 503, hit: false, maxAge: 10 };
  }
  if (!blob.latest || Date.now() - (blob.at || 0) > s.staleMs) {
    if (!(await edgeGet(url.origin, 'lock'))) {
      await edgePut(url.origin, 'lock', '1', 60, 'text/plain');
      const got = await runKv(env, blob).catch(() => null);
      if (got?.blob?.latest) blob = got.blob;
    }
  }
  const latest = blob.latest || { at: null, ok: {}, live: [], videos: [] };
  const text = JSON.stringify(latest);
  await edgePut(url.origin, 'streams.json', text, s.edgeSec);
  return { text, status: 200, hit: false, maxAge: s.edgeSec };
}

// 채널 목록·토큰처럼 collect() 가 기억해 두는 값 (점검 경로에서만 읽는다)
async function readState(env, origin) {
  if (env.KV) { try { return (await env.KV.get(BLOB, 'json'))?.state || {}; } catch { return {}; } }
  return (await cacheStore(caches.default, origin).get('state')) || {};
}

// 캐시를 작은 키-값 저장소처럼 쓴다 (토큰, 채널 ID, 피드): get(key) → 값|null, put(key, 값, 초)
function cacheStore(cache, origin) {
  const req = (k) => new Request(`${origin}/__kv/${encodeURIComponent(k)}`);
  return {
    async get(k) { const r = await cache.match(req(k)); return r ? r.json() : null; },
    async put(k, v, ttl) { await cache.put(req(k), new Response(JSON.stringify(v), { headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${Math.max(1, Math.floor(ttl))}` } })); },
  };
}
