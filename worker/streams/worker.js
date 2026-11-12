// 방송 상태 Worker (Cloudflare Workers, 저장소 없이 캐시만 사용)
//
// GET /streams.json → { at, ok, live: [...], videos: [...] }
//   - 채널 목록은 사이트가 빌드 때 내보내는 data/stream-channels.json 을 읽는다 (10분 캐시).
//   - 방송 중 확인: Twitch(Helix Get Streams), YouTube(채널 피드의 최근 영상 → videos.list), 치지직(채널 라이브 정보, 비공식)
//   - 최근 영상: YouTube 채널 공개 피드(키·할당량 없음)에서 최근 VIDEO_DAYS일
//   - 결과는 60초 동안 캐시한다. 요청이 없으면 아무것도 호출하지 않는다.
//   - 한 플랫폼이 실패하면 그 플랫폼만 ok=false 로 알리고 나머지는 정상 응답한다.
//
// 비밀 값(wrangler secret): TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, YOUTUBE_API_KEY
// 변수(wrangler.toml): SITE_URL, ALLOWED_ORIGIN, VIDEO_DAYS, LIVE_TTL
import { collect } from './collect.js';

const json = (body, status, headers) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers } });

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const cors = { 'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*', 'Vary': 'Origin' };
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (url.pathname !== '/streams.json') return json({ error: 'not found' }, 404, cors);
    const ttl = Number(env.LIVE_TTL || 60);
    const cache = caches.default, key = new Request(`${url.origin}/streams.json`);
    let hit = await cache.match(key);
    if (!hit) {
      const kv = cacheStore(cache, url.origin);
      const body = await collect({ env, fetch: (u, o) => fetch(u, o), store: kv, now: Date.now() });
      hit = json(body, 200, { 'Cache-Control': `public, max-age=${ttl}` });
      ctx.waitUntil(cache.put(key, hit.clone()));
    }
    const res = new Response(hit.body, hit);
    for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
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
