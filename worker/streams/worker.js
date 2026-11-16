// 방송 상태 Worker (Cloudflare Workers). KV 가 묶여 있으면 예약 실행 + KV, 없으면 예전처럼 캐시만 쓴다
//
// GET /streams.json → { at, ok, live: [...], videos: [...] }
//   - 채널 목록은 사이트가 빌드 때 내보내는 data/stream-channels.json 을 읽는다 (10분 캐시).
//   - 방송 중 확인: Twitch(Helix Get Streams), YouTube(채널 피드의 최근 영상 → videos.list), 치지직(채널 라이브 정보, 비공식)
//   - 최근 영상: YouTube 채널 공개 피드(키·할당량 없음)에서 최근 VIDEO_DAYS일
//   - 결과는 60초 동안 새것으로 본다. 그 뒤 요청에는 있던 결과를 바로 돌려주고 뒤에서 새로 모은다(최대 15분 보관). 요청이 없으면 아무것도 호출하지 않는다.
//   - 한 플랫폼이 실패하면 그 플랫폼만 ok=false 로 알리고 나머지는 정상 응답한다.
//
// 비밀 값(wrangler secret): TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, YOUTUBE_API_KEY
// 변수(wrangler.toml): SITE_URL, ALLOWED_ORIGIN, VIDEO_DAYS, LIVE_TTL
import { collect } from './collect.js';

const json = (body, status, headers) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers } });

// ── KV 방식(권장): 2분마다 예약 실행이 방송 상태를 모아 KV 한 칸('blob' = { state, latest, at })에 적어 두고,
//    사이트 요청에는 그 값을 읽어 바로 돌려준다. 캐시 방식과 달리 어느 지역에서 열어도, 한동안 아무도 안 열었어도 기다리지 않는다.
//    (KV 무료 한도: 쓰기 하루 1,000번 → 2분 간격이면 720번)
const BLOB = 'blob';
async function runKv(env) {
  const blob = (await env.KV.get(BLOB, 'json')) || {};
  const store = { get: async () => blob.state || null, put: async (_k, v) => { blob.state = v; } };
  blob.latest = await collect({ env, fetch: (u, o) => fetch(u, o), store, now: Date.now() });
  blob.at = Date.now();
  await env.KV.put(BLOB, JSON.stringify(blob));
  return blob;
}

export default {
  async scheduled(_event, env, ctx) { if (env.KV) ctx.waitUntil(runKv(env).catch(() => {})); },
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const cors = { 'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*', 'Vary': 'Origin' };
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    // 점검용: 치지직이 채널마다 무엇을 돌려주는지 요약해서 보여 준다 (공개 정보만, 배포 점검 워크플로가 읽는다)
    if (url.pathname === '/debug/chzzk') {
      const S = (await cacheStore(caches.default, url.origin).get('state')) || {};
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
      return json(out, 200, cors);
    }
    // 점검용: Twitch 채널 찾기 (?q=검색어 여러 개는 쉼표로). 공개 정보만
    if (url.pathname === '/debug/twitch') {
      const S = (env.KV ? (await env.KV.get(BLOB, 'json'))?.state : await cacheStore(caches.default, url.origin).get('state')) || {};
      if (!S.token?.token) return json({ error: 'no token yet' }, 200, cors);
      const H = { headers: { Authorization: `Bearer ${S.token.token}`, 'Client-Id': env.TWITCH_CLIENT_ID } };
      const out = {};
      for (const q of String(url.searchParams.get('q') || 'algs').split(',').slice(0, 8)) {
        try { const j = await (await fetch(`https://api.twitch.tv/helix/search/channels?first=40&query=${encodeURIComponent(q)}`, H)).json(); out[q] = (j.data || []).map((c) => `${c.broadcaster_login}${c.is_live ? '(LIVE)' : ''} | ${c.display_name} | ${c.game_name || '-'} | ${String(c.title || '').slice(0, 60)}`); } catch (e) { out[q] = String(e).slice(0, 80); }
      }
      return json(out, 200, cors);
    }
    if (url.pathname !== '/streams.json') return json({ error: 'not found' }, 404, cors);
    if (env.KV) {
      let blob = await env.KV.get(BLOB, 'json');
      if (!blob?.latest || Date.now() - (blob.at || 0) > 10 * 60e3) blob = await runKv(env); // 예약 실행이 아직 안 돌았거나 멈췄을 때만 직접 모은다
      return json(blob.latest, 200, { ...cors, 'Cache-Control': 'public, max-age=20' });
    }
    const ttl = Number(env.LIVE_TTL || 60), keep = Number(env.STALE_TTL || 900);
    const cache = caches.default, key = new Request(`${url.origin}/streams.json`);
    // 모은 결과는 keep초 동안 두고, ttl초가 지나면 '낡은 것'으로 본다.
    // 낡았어도 있는 응답을 바로 돌려주고(사이트가 기다리지 않게) 뒤에서 새로 모은다. 아예 없을 때만 모으는 동안 기다린다.
    const build = async () => {
      const body = await collect({ env, fetch: (u, o) => fetch(u, o), store: cacheStore(cache, url.origin), now: Date.now() });
      const fresh = json(body, 200, { 'Cache-Control': `public, max-age=${keep}`, 'X-At': String(Date.now()) });
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

// 캐시를 작은 키-값 저장소처럼 쓴다 (토큰, 채널 ID, 피드): get(key) → 값|null, put(key, 값, 초)
function cacheStore(cache, origin) {
  const req = (k) => new Request(`${origin}/__kv/${encodeURIComponent(k)}`);
  return {
    async get(k) { const r = await cache.match(req(k)); return r ? r.json() : null; },
    async put(k, v, ttl) { await cache.put(req(k), new Response(JSON.stringify(v), { headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${Math.max(1, Math.floor(ttl))}` } })); },
  };
}
