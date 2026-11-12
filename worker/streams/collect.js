// 방송 상태 수집 (Worker와 시험 코드가 함께 쓰는 순수 함수: fetch·저장소·시각을 밖에서 받는다)
const UA = 'algs-kr-fan-site-streams/1.0 (+https://github.com/LaplusSUGAR/algs-kr)';
const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const safe = async (fn) => { try { return [await fn(), null]; } catch (e) { return [null, String(e?.message || e)]; } };
const getJson = async (f, url, opt = {}) => { const r = await f(url, { ...opt, headers: { 'User-Agent': UA, Accept: 'application/json', ...(opt.headers || {}) } }); if (!r.ok) throw new Error(`${new URL(url).hostname} ${r.status}`); return r.json(); };
const decode = (s) => String(s || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

// 여러 게임을 다루는 채널(apexOnly)은 Apex 방송·영상만 내보낸다: Twitch는 게임 이름, YouTube는 제목·태그로 판단
const APEX = /apex|algs|エーペックス|エペ|에이펙스|에펙/i;
const isApex = (...texts) => texts.some((t) => APEX.test(String(t || '')));

export async function collect({ env, fetch: f, store, now }) {
  const out = { at: new Date(now).toISOString(), ok: { twitch: null, youtube: null, chzzk: null }, err: {}, live: [], videos: [] };
  const [chs, chErr] = await safe(() => channels({ env, f, store }));
  if (!chs) { out.err.channels = chErr; return out; }
  const meta = (c) => ({ key: c.key, who: c.who, team: c.team || null, kind: c.kind });
  const jobs = [];

  // ── Twitch ──
  const tw = chs.filter((c) => c.twitch);
  if (tw.length && env.TWITCH_CLIENT_ID && env.TWITCH_CLIENT_SECRET) jobs.push(safe(async () => {
    const token = await twitchToken({ env, f, store, now });
    const byLogin = new Map(tw.map((c) => [c.twitch.toLowerCase(), c]));
    for (const part of chunk([...byLogin.keys()], 100)) {
      const j = await getJson(f, `https://api.twitch.tv/helix/streams?first=100&${part.map((l) => `user_login=${encodeURIComponent(l)}`).join('&')}`, { headers: { Authorization: `Bearer ${token}`, 'Client-Id': env.TWITCH_CLIENT_ID } });
      for (const s of j.data || []) {
        const c = byLogin.get(String(s.user_login).toLowerCase()); if (!c || s.type !== 'live') continue;
        if (c.apexOnly && !isApex(s.game_name)) continue;
        out.live.push({ ...meta(c), platform: 'twitch', title: s.title || '', game: s.game_name || '', viewers: s.viewer_count ?? null, started: s.started_at || null, thumb: String(s.thumbnail_url || '').replace('{width}', '640').replace('{height}', '360'), url: `https://www.twitch.tv/${s.user_login}`, embed: { type: 'twitch', channel: s.user_login } });
      }
    }
  }).then(([, e]) => { out.ok.twitch = !e; if (e) out.err.twitch = e; }));
  else if (tw.length) out.err.twitch = 'no key';

  // ── YouTube: 피드(무료) → 최근 영상 + 방송 중 후보, videos.list(1단위)로 방송 중 확정 ──
  const yt = chs.filter((c) => c.youtube);
  if (yt.length) jobs.push(safe(async () => {
    const days = Number(env.VIDEO_DAYS || 21), since = now - days * 864e5;
    const feeds = await Promise.all(yt.map(async (c) => { const [id] = await safe(() => youtubeId({ c, env, f, store })); if (!id) return { c, items: [] }; const [items] = await safe(() => youtubeFeed({ id, f, store })); return { c, id, items: items || [] }; }));
    const cand = [];
    for (const { c, items } of feeds) {
      items.slice(0, 4).forEach((v) => cand.push({ c, v })); // 방송 중인 영상은 피드 맨 앞쪽에 온다
      for (const v of items) if (Date.parse(v.published) >= since && (!c.apexOnly || isApex(v.title))) out.videos.push({ ...meta(c), id: v.id, title: v.title, published: v.published, thumb: `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`, channel: v.channel });
    }
    if (!feeds.some((x) => x.id)) throw new Error('no channel id');
    if (env.YOUTUBE_API_KEY && cand.length) {
      const byId = new Map(cand.map((x) => [x.v.id, x]));
      const liveIds = new Set(), short = new Set();
      for (const part of chunk([...byId.keys()], 50)) {
        const j = await getJson(f, `https://www.googleapis.com/youtube/v3/videos?part=snippet,liveStreamingDetails&id=${part.join(',')}&key=${env.YOUTUBE_API_KEY}`);
        for (const it of j.items || []) {
          const st = it.snippet?.liveBroadcastContent, { c } = byId.get(it.id) || {};
          if (!c) continue;
          if (st === 'live') liveIds.add(it.id);
          if (st === 'live' && (!c.apexOnly || isApex(it.snippet.title, (it.snippet.tags || []).join(' ')))) { out.live.push({ ...meta(c), platform: 'youtube', title: it.snippet.title || '', viewers: it.liveStreamingDetails?.concurrentViewers != null ? Number(it.liveStreamingDetails.concurrentViewers) : null, started: it.liveStreamingDetails?.actualStartTime || null, thumb: `https://i.ytimg.com/vi/${it.id}/hqdefault.jpg`, url: `https://www.youtube.com/watch?v=${it.id}`, embed: { type: 'youtube', id: it.id } }); }
          if (st === 'upcoming') short.add(it.id); // 예약만 된 방송은 최근 영상에서 뺀다
        }
      }
      out.videos = out.videos.filter((v) => !liveIds.has(v.id) && !short.has(v.id));
    } else if (!env.YOUTUBE_API_KEY) out.err.youtubeLive = 'no key';
    out.videos.sort((a, b) => b.published.localeCompare(a.published));
    out.videos = out.videos.slice(0, 60);
  }).then(([, e]) => { out.ok.youtube = !e; if (e) out.err.youtube = e; }));

  // ── 치지직 (공개 채널 라이브 정보. 공식 문서에 없는 주소라 응답이 바뀌면 조용히 건너뛴다) ──
  const cz = chs.filter((c) => c.chzzk);
  if (cz.length) jobs.push(safe(async () => {
    let good = 0;
    await Promise.all(cz.map(async (c) => {
      const [j] = await safe(() => getJson(f, `https://api.chzzk.naver.com/service/v2/channels/${encodeURIComponent(c.chzzk)}/live-detail`));
      const d = j?.content; if (j?.code === 200 || d) good++;
      if (d?.status !== 'OPEN') return;
      out.live.push({ ...meta(c), platform: 'chzzk', title: d.liveTitle || '', game: d.liveCategoryValue || '', viewers: d.concurrentUserCount ?? null, started: d.openDate ? new Date(String(d.openDate).replace(' ', 'T') + '+09:00').toISOString() : null, thumb: d.liveImageUrl ? String(d.liveImageUrl).replace('{type}', '480') : null, url: `https://chzzk.naver.com/live/${c.chzzk}`, embed: null });
    }));
    if (!good) throw new Error('no response');
  }).then(([, e]) => { out.ok.chzzk = !e; if (e) out.err.chzzk = e; }));

  await Promise.all(jobs);
  out.live.sort((a, b) => (b.viewers ?? 0) - (a.viewers ?? 0));
  if (!Object.keys(out.err).length) delete out.err;
  return out;
}

// 채널 목록 (사이트가 빌드 때 만든 파일, 10분 캐시)
async function channels({ env, f, store }) {
  const hit = await store.get('channels'); if (hit) return hit;
  const j = await getJson(f, `${String(env.SITE_URL || '').replace(/\/$/, '')}/data/stream-channels.json`);
  const list = (j.channels || []).slice(0, 80);
  await store.put('channels', list, 600);
  return list;
}
// Twitch 앱 토큰 (client credentials). 만료 하루 전까지 캐시한다
async function twitchToken({ env, f, store, now }) {
  const hit = await store.get('twitch-token'); if (hit?.token && hit.exp > now + 60e3) return hit.token;
  const r = await f('https://id.twitch.tv/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `client_id=${encodeURIComponent(env.TWITCH_CLIENT_ID)}&client_secret=${encodeURIComponent(env.TWITCH_CLIENT_SECRET)}&grant_type=client_credentials` });
  if (!r.ok) throw new Error(`twitch token ${r.status}`);
  const j = await r.json(); if (!j.access_token) throw new Error('twitch token empty');
  const life = Math.min(Number(j.expires_in || 3600), 86400);
  await store.put('twitch-token', { token: j.access_token, exp: now + life * 1000 }, life - 120);
  return j.access_token;
}
// YouTube 채널 ID: 'UC…'면 그대로, '@핸들'이면 channels.list(forHandle)로 한 번 찾아 7일 캐시
async function youtubeId({ c, env, f, store }) {
  const v = String(c.youtube);
  if (/^UC[\w-]{22}$/.test(v)) return v;
  const handle = v.replace(/^@/, '');
  const hit = await store.get(`yt-id:${handle.toLowerCase()}`); if (hit) return hit;
  if (!env.YOUTUBE_API_KEY) throw new Error('no key for handle');
  const j = await getJson(f, `https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=${encodeURIComponent('@' + handle)}&key=${env.YOUTUBE_API_KEY}`);
  const id = j.items?.[0]?.id; if (!id) throw new Error(`no channel for @${handle}`);
  await store.put(`yt-id:${handle.toLowerCase()}`, id, 7 * 86400);
  return id;
}
// YouTube 채널 공개 피드 (최근 영상 약 15개, 5분 캐시)
async function youtubeFeed({ id, f, store }) {
  const hit = await store.get(`yt-feed:${id}`); if (hit) return hit;
  const r = await f(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`feed ${r.status}`);
  const xml = await r.text();
  const channel = decode((xml.match(/<author>\s*<name>([^<]*)<\/name>/) || [])[1] || '');
  const items = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, e]) => ({ id: (e.match(/<yt:videoId>([^<]+)</) || [])[1], title: decode((e.match(/<title>([^<]*)</) || [])[1]), published: (e.match(/<published>([^<]+)</) || [])[1], channel })).filter((x) => x.id && x.published);
  await store.put(`yt-feed:${id}`, items, 300);
  return items;
}
