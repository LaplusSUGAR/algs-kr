// 방송 상태 Worker (Cloudflare Workers, 저장소 없이 캐시만 사용)
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

export default {
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
    if (url.pathname !== '/streams.json') return json({ error: 'not found' }, 404, cors);
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
