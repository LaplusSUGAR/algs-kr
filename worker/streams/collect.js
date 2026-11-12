// 방송 상태 수집 (Worker와 시험 코드가 함께 쓰는 순수 함수: fetch·저장소·시각을 밖에서 받는다)
const UA = 'algs-kr-fan-site-streams/1.0 (+https://github.com/LaplusSUGAR/algs-kr)';
const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const safe = async (fn) => { try { return [await fn(), null]; } catch (e) { return [null, String(e?.message || e)]; } };
const getJson = async (f, url, opt = {}) => { const r = await f(url, { ...opt, headers: { 'User-Agent': UA, Accept: 'application/json', ...(opt.headers || {}) } }); if (!r.ok) throw new Error(`${new URL(url).hostname} ${r.status}`); return r.json(); };
const decode = (s) => String(s || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

// 여러 게임을 다루는 채널(apexOnly)은 Apex 방송·영상만 내보낸다: Twitch는 게임 이름, YouTube는 제목·태그로 판단
const APEX = /apex|algs|エーペックス|エペ|에이펙스|에펙/i;
const isApex = (...texts) => texts.some((t) => APEX.test(String(t || '')));

// 호출 예산: Cloudflare 무료 요금제는 요청 하나에 외부 호출(fetch + 캐시 읽기·쓰기)이 50회까지다.
//   그래서 (1) 기억해 둘 값은 전부 저장소 항목 하나('state')에 담아 읽기 1회·쓰기 1회로 끝내고,
//   (2) 꼭 필요한 호출(방송 중 확인)을 먼저 셈한 뒤, 남는 횟수 안에서만 덜 급한 갱신(영상 피드 → 다시보기 → 쇼츠)을 오래된 것부터 한다.
//   이번에 못 한 갱신은 저장해 둔 값을 그대로 쓰고 다음 요청(약 1분 뒤)에서 이어서 한다.
export async function collect({ env, fetch: rawFetch, store, now }) {
  const BUDGET = Number(env.SUBREQ_BUDGET || 40); // Worker 본체의 응답 캐시 읽기·쓰기 몫을 남겨 둔 값
  let used = 0;
  const f = (u, o) => { used++; return rawFetch(u, o); };
  const out = { at: new Date(now).toISOString(), ok: { twitch: null, youtube: null, chzzk: null }, err: {}, live: [], videos: [] };
  used++;
  const S = (await safe(() => store.get('state')))[0] || {};
  for (const k of ['ytIds', 'feeds', 'uids', 'vods', 'shorts']) S[k] = S[k] || {};
  let dirty = false;
  const stale = (at, sec) => !at || now - at > sec * 1000;
  const finish = async () => {
    if (dirty) { used++; await safe(() => store.put('state', S, 7 * 86400)); }
    out.calls = used;
    if (!Object.keys(out.err).length) delete out.err;
    return out;
  };

  // 채널 목록 (사이트가 빌드 때 만든 파일, 10분마다 다시 읽는다. 못 읽으면 전에 읽은 목록)
  if (stale(S.channels?.at, 600)) {
    const [j, e] = await safe(() => getJson(f, `${String(env.SITE_URL || '').replace(/\/$/, '')}/data/stream-channels.json`));
    if (j) { S.channels = { at: now, list: (j.channels || []).slice(0, 120), intl: (j.intl || []).filter((x) => Array.isArray(x) && /^[A-Za-z0-9_]{2,30}$/.test(x[0] || '')).slice(0, 800) }; dirty = true; }
    else if (!S.channels) { out.err.channels = e; return finish(); }
  }
  const chs = S.channels.list;
  // intl: 한국 관련이 아닌 선수. 사이트는 응원 팀 선수 방송과 팀·선수 화면의 LIVE 표시에만 쓴다
  const meta = (c) => ({ key: c.key, who: c.who, team: c.team || null, kind: c.kind, ...(c.intl ? { intl: true } : {}) });
  const days = Number(env.VIDEO_DAYS || 21), since = now - days * 864e5;
  let ytVideos = [], twVideos = []; // 최근 영상: YouTube 업로드 + Twitch 지난 방송(다시보기)

  // 그 밖의 선수(전 팀)는 Twitch만, Apex 방송일 때만
  const tw = chs.filter((c) => c.twitch).concat(S.channels.intl.map(([login, who, team]) => ({ key: `p:${String(who).toLowerCase()}`, who, team, kind: 'player', intl: true, apexOnly: true, twitch: login })));
  const twOn = !!(tw.length && env.TWITCH_CLIENT_ID && env.TWITCH_CLIENT_SECRET);
  const byLogin = new Map(); for (const c of tw) { const k = c.twitch.toLowerCase(); if (!byLogin.has(k)) byLogin.set(k, c); } // 같은 채널이면 앞(한국 관련·공식)이 우선
  const vc = twOn ? chs.filter((c) => c.twitch && c.kind === 'player' && !c.intl) : []; // 다시보기를 모을 채널: 한국 관련 선수
  const yt = chs.filter((c) => c.youtube);
  const cz = chs.filter((c) => c.chzzk);
  const ytId = (c) => { const v = String(c.youtube); return /^UC[\w-]{22}$/.test(v) ? v : S.ytIds[v.replace(/^@/, '').toLowerCase()] || null; };

  // ── 호출 계획 ──
  const needToken = twOn && !(S.token?.token && S.token.exp > now + 60e3);
  let left = BUDGET - used - 1 /* 끝의 저장 */ - (needToken ? 1 : 0) - (twOn ? Math.ceil(byLogin.size / 100) : 0) - cz.length - (yt.length && env.YOUTUBE_API_KEY ? 1 : 0);
  const take = (n) => { const k = Math.max(0, Math.min(n, left)); left -= k; return k; };
  const oldest = (list, at) => list.slice().sort((a, b) => (at(a) || 0) - (at(b) || 0));
  const idTodo = env.YOUTUBE_API_KEY ? yt.filter((c) => !ytId(c)) : [];
  const idNow = idTodo.slice(0, take(idTodo.length));
  const feedStale = oldest(yt.filter((c) => idNow.includes(c) || (ytId(c) && stale(S.feeds[ytId(c)]?.at, 300))), (c) => S.feeds[ytId(c)]?.at);
  const feedNow = new Set(feedStale.slice(0, take(feedStale.length)));
  const uidTodo = vc.map((c) => c.twitch.toLowerCase()).filter((k) => !S.uids[k]);
  const uidNow = uidTodo.length ? take(1) === 1 : false;
  const vodStale = oldest(vc.filter((c) => (S.uids[c.twitch.toLowerCase()] || uidNow) && stale(S.vods[c.twitch.toLowerCase()]?.at, 600)), (c) => S.vods[c.twitch.toLowerCase()]?.at);
  const vodNow = vodStale.slice(0, take(vodStale.length));
  const shortStale = oldest(yt.filter((c) => ytId(c) && stale(S.shorts[ytId(c)]?.at, 1800)), (c) => S.shorts[ytId(c)]?.at);
  const shortNow = shortStale.slice(0, take(shortStale.length));
  const jobs = [];

  // ── Twitch ──
  if (twOn) jobs.push(safe(async () => {
    if (needToken) {
      const r = await f('https://id.twitch.tv/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `client_id=${encodeURIComponent(env.TWITCH_CLIENT_ID)}&client_secret=${encodeURIComponent(env.TWITCH_CLIENT_SECRET)}&grant_type=client_credentials` });
      if (!r.ok) throw new Error(`twitch token ${r.status}`);
      const j = await r.json();
      S.token = { token: j.access_token, exp: now + Math.max(60, (j.expires_in || 3600) - 86400) * 1000 }; dirty = true; // 만료 하루 전까지 쓴다
    }
    const H = { headers: { Authorization: `Bearer ${S.token.token}`, 'Client-Id': env.TWITCH_CLIENT_ID } };
    const liveStreamIds = new Set();
    await Promise.all(chunk([...byLogin.keys()], 100).map(async (part) => {
      const j = await getJson(f, `https://api.twitch.tv/helix/streams?first=100&${part.map((l) => `user_login=${encodeURIComponent(l)}`).join('&')}`, H);
      for (const s of j.data || []) {
        const c = byLogin.get(String(s.user_login).toLowerCase()); if (!c || s.type !== 'live') continue;
        liveStreamIds.add(String(s.id));
        if (c.apexOnly && !isApex(s.game_name)) continue;
        out.live.push({ ...meta(c), platform: 'twitch', title: s.title || '', game: s.game_name || '', viewers: s.viewer_count ?? null, started: s.started_at || null, thumb: String(s.thumbnail_url || '').replace('{width}', '640').replace('{height}', '360'), url: `https://www.twitch.tv/${s.user_login}`, embed: { type: 'twitch', channel: s.user_login } });
      }
    }));
    // 지난 방송(다시보기): 채널마다 10분에 한 번, 지금 방송 중인 회차는 뺀다
    const [, vodErr] = await safe(async () => {
      if (uidNow) {
        const j = await getJson(f, `https://api.twitch.tv/helix/users?${uidTodo.slice(0, 100).map((l) => `login=${encodeURIComponent(l)}`).join('&')}`, H);
        for (const u of j.data || []) S.uids[String(u.login).toLowerCase()] = u.id;
        dirty = true;
      }
      await Promise.all(vodNow.map(async (c) => {
        const k = c.twitch.toLowerCase(), uid = S.uids[k];
        if (!uid) { used++; return; } // 계획에 잡아 둔 한 번을 쓰지 않았지만 셈은 맞춘다(없는 채널)
        const [j] = await safe(() => getJson(f, `https://api.twitch.tv/helix/videos?user_id=${uid}&type=archive&first=8`, H));
        if (!j) return;
        S.vods[k] = { at: now, items: (j.data || []).map((v) => ({ id: String(v.id), title: v.title || '', published: v.published_at || v.created_at, thumb: String(v.thumbnail_url || '').replace('%{width}', '640').replace('%{height}', '360'), dur: v.duration || '', stream: v.stream_id || null })) };
        dirty = true;
      }));
    });
    if (vodErr) out.err.twitchVod = vodErr;
    for (const c of vc) for (const v of S.vods[c.twitch.toLowerCase()]?.items || []) if (v.published && Date.parse(v.published) >= since && !(v.stream && liveStreamIds.has(String(v.stream))))
      twVideos.push({ ...meta(c), platform: 'twitch', id: v.id, title: v.title, published: v.published, thumb: v.thumb || null, channel: c.who, dur: v.dur });
  }).then(([, e]) => { out.ok.twitch = !e; if (e) out.err.twitch = e; }));
  else if (tw.length) out.err.twitch = 'no key';

  // ── YouTube: 피드(무료) → 최근 영상 + 방송 중 후보, videos.list(1단위)로 방송 중 확정 ──
  if (yt.length) jobs.push(safe(async () => {
    // '@핸들' → 채널 ID (channels.list forHandle, 한 번 찾으면 계속 쓴다)
    await Promise.all(idNow.map(async (c) => {
      const handle = String(c.youtube).replace(/^@/, '');
      const [j] = await safe(() => getJson(f, `https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=${encodeURIComponent('@' + handle)}&key=${env.YOUTUBE_API_KEY}`));
      const id = j?.items?.[0]?.id; if (id) { S.ytIds[handle.toLowerCase()] = id; dirty = true; }
    }));
    // 채널 공개 피드 (최근 영상 약 15개, 5분마다)
    await Promise.all([...feedNow].map(async (c) => {
      const id = ytId(c); if (!id) return;
      const [items] = await safe(() => youtubeFeed({ id, f }));
      if (items) { S.feeds[id] = { at: now, items }; dirty = true; }
    }));
    // 쇼츠: 채널의 쇼츠 재생목록('UUSH' + 채널 ID 뒷부분) 피드에 있는 영상, 30분마다. 쇼츠가 없는 채널은 피드가 없어 빈 목록
    await Promise.all(shortNow.map(async (c) => {
      const id = ytId(c);
      const [r] = await safe(() => f(`https://www.youtube.com/feeds/videos.xml?playlist_id=UUSH${id.slice(2)}`, { headers: { 'User-Agent': UA } }));
      if (!r || !(r.ok || r.status === 404)) return;
      S.shorts[id] = { at: now, ids: r.ok ? [...(await r.text()).matchAll(/<yt:videoId>([^<]+)</g)].map((m) => m[1]) : [] }; dirty = true;
    }));
    const cand = [];
    let anyId = false;
    for (const c of yt) {
      const id = ytId(c); if (!id) continue;
      anyId = true;
      const items = S.feeds[id]?.items || [], shorts = new Set(S.shorts[id]?.ids || []);
      items.slice(0, 4).forEach((v) => cand.push({ c, v })); // 방송 중인 영상은 피드 맨 앞쪽에 온다
      for (const v of items) if (Date.parse(v.published) >= since && (!c.apexOnly || isApex(v.title)))
        ytVideos.push({ ...meta(c), platform: 'youtube', id: v.id, title: v.title, published: v.published, thumb: `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`, channel: v.channel, ...(shorts.has(v.id) || /#shorts?\b/i.test(v.title) ? { short: true } : {}) });
    }
    if (!anyId) throw new Error('no channel id');
    if (env.YOUTUBE_API_KEY && cand.length) {
      const byId = new Map(cand.map((x) => [x.v.id, x]));
      const liveIds = new Set(), upcoming = new Set();
      for (const part of chunk([...byId.keys()], 50).slice(0, 1 + take(9))) { // 계획에 잡은 1번 + 남는 만큼
        const j = await getJson(f, `https://www.googleapis.com/youtube/v3/videos?part=snippet,liveStreamingDetails&id=${part.join(',')}&key=${env.YOUTUBE_API_KEY}`);
        for (const it of j.items || []) {
          const st = it.snippet?.liveBroadcastContent, { c } = byId.get(it.id) || {};
          if (!c) continue;
          if (st === 'live') liveIds.add(it.id);
          if (st === 'live' && (!c.apexOnly || isApex(it.snippet.title, (it.snippet.tags || []).join(' ')))) { out.live.push({ ...meta(c), platform: 'youtube', title: it.snippet.title || '', viewers: it.liveStreamingDetails?.concurrentViewers != null ? Number(it.liveStreamingDetails.concurrentViewers) : null, started: it.liveStreamingDetails?.actualStartTime || null, thumb: `https://i.ytimg.com/vi/${it.id}/hqdefault.jpg`, url: `https://www.youtube.com/watch?v=${it.id}`, embed: { type: 'youtube', id: it.id } }); }
          if (st === 'upcoming') upcoming.add(it.id); // 예약만 된 방송은 최근 영상에서 뺀다
        }
      }
      ytVideos = ytVideos.filter((v) => !liveIds.has(v.id) && !upcoming.has(v.id));
    } else if (!env.YOUTUBE_API_KEY) out.err.youtubeLive = 'no key';
  }).then(([, e]) => { out.ok.youtube = !e; if (e) out.err.youtube = e; }));

  // ── 치지직 (공개 채널 라이브 정보. 공식 문서에 없는 주소라 응답이 바뀌면 조용히 건너뛴다) ──
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
  // 영상(긴 영상·다시보기)과 쇼츠를 따로 자른다: 쇼츠가 많은 채널이 목록을 밀어내지 않게
  const byNew = (a, b) => Date.parse(b.published) - Date.parse(a.published);
  const all = [...ytVideos, ...twVideos].sort(byNew);
  out.videos = [...all.filter((v) => !v.short).slice(0, 60), ...all.filter((v) => v.short).slice(0, 30)].sort(byNew);
  out.live.sort((a, b) => (b.viewers ?? 0) - (a.viewers ?? 0));
  // 지금 목록에 없는 채널의 기억은 지운다
  const keepYt = new Set(yt.map(ytId).filter(Boolean)), keepTw = new Set(vc.map((c) => c.twitch.toLowerCase()));
  for (const k of Object.keys(S.feeds)) if (!keepYt.has(k)) { delete S.feeds[k]; delete S.shorts[k]; dirty = true; }
  if (twOn) for (const k of Object.keys(S.vods)) if (!keepTw.has(k)) { delete S.vods[k]; dirty = true; }
  return finish();
}

// YouTube 채널 공개 피드 → [{ id, title, published, channel }]
async function youtubeFeed({ id, f }) {
  const r = await f(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`feed ${r.status}`);
  const xml = await r.text();
  const channel = decode((xml.match(/<author>\s*<name>([^<]*)<\/name>/) || [])[1] || '');
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, e]) => ({ id: (e.match(/<yt:videoId>([^<]+)</) || [])[1], title: decode((e.match(/<title>([^<]*)</) || [])[1]), published: (e.match(/<published>([^<]+)</) || [])[1], channel })).filter((x) => x.id && x.published);
}
