// raw/ 아래 출처별 원본을 우선순위 규칙으로 합쳐 site/data/algs-data.js 와 site/data/ver.json 을 만든다.
//
// 우선순위 (보고서 "데이터 출처와 우선순위")
//   - 순위·결과·로스터: Liquipedia(raw/lp) > 공식 API(raw/algs). 값이 다르면 Liquipedia 값을 쓰고 conflicts에 기록
//   - 챔피언십 포인트: 공식 API 값 표시 (Liquipedia는 공식 값을 옮겨 적는 데이터)
//   - 선수 국적(한국 판별): 공식 API country
//   - Challenger Circuit: Battlefy
//   - 수동 보정: config/overrides.json (팀 한글명, 색, 한국 판정 강제 등)
import { readJson, writeText, hash, normRegion, REGION_LABEL, nameKey } from './lib.mjs';

const algs = readJson('raw/algs/snapshot.json');
if (!algs) throw new Error('raw/algs/snapshot.json 이 없습니다. 먼저 npm run fetch:algs');
const lpPlacements = readJson('raw/lp/placements.json');
const bf = readJson('raw/battlefy/cc.json');
const ov = readJson('config/overrides.json', {});
const season = readJson('config/season.json');

const conflicts = [];
const CP_DIRECT = season.cpDirectSlots; // 32

// ---------- 팀 ----------
const teams = {}; // key: teamId
const shortToId = {};
const ensureTeam = (id, short, name, region) => {
  if (!id) return null;
  const t = (teams[id] ||= { id, short: short || '', name: name || '', region: normRegion(region), roster: [], krPlayers: [], krLevel: 'none' });
  if (short && !t.short) t.short = short;
  if (name && !t.name) t.name = name;
  if (region && !t.region) t.region = normRegion(region);
  if (short) shortToId[short] = id;
  return t;
};

// 최신 정보가 이름을 덮도록: CP(현재 이름) → poGroup → s2 → s1 순으로 등록
for (const [, id, name, short, region] of algs.cp) ensureTeam(id, short, name, region);
for (const [, short, name, id, , , , region] of algs.poGroup) ensureTeam(id, short, name, region);
for (const key of Object.keys(algs.pl).sort().reverse()) {
  const region = key.split(':')[1];
  for (const r of algs.pl[key]) ensureTeam(r[3], r[1], r[2], region);
}

// 로스터와 한국 판별
for (const [id, s] of Object.entries(algs.rosters)) {
  const t = teams[id];
  if (!t) continue;
  t.roster = s.split(';').map((x) => { const [n, c, r] = x.split('|'); return { n, c, r }; });
}
for (const key of Object.keys(algs.pl).sort()) { // s1 → s2 순서로 최신 값이 남게
  for (const r of algs.pl[key]) if (teams[r[3]] && r[10]) teams[r[3]].krPlayers = r[10].split(',');
}
// 현재 팀 = CP 순위표, 최신 Split Pro League, 최근 국제전에 있는 팀. 지난 Split에만 있던 로스터로 한국 판정을 하지 않는다.
const latestSplit = Object.keys(algs.pl).map((k) => k.split(':')[0]).sort().at(-1);
const currentIds = new Set([...algs.cp.map((r) => r[1]), ...algs.poGroup.map((r) => r[3]),
  ...Object.entries(algs.pl).filter(([k]) => k.startsWith(latestSplit + ':')).flatMap(([, rows]) => rows.map((r) => r[3]))]);
for (const t of Object.values(teams)) {
  t.current = currentIds.has(t.id);
  if (!t.current) { t.krPlayers = []; }
  else if (t.roster.length) t.krPlayers = t.roster.filter((p) => p.c === 'KR' && p.r !== 'k').map((p) => p.n);
  // 3인 라인업 기준: 한국 선수 2명 이상 = 한국 팀, 1명 = 한국 선수 소속 팀 (config/season.json에서 바꾸려면 여기 기준 수정)
  const kr = t.krPlayers.length;
  t.krLevel = kr >= 2 ? 'team' : kr === 1 ? 'member' : 'none';
  const o = ov.teams?.[t.short];
  if (o) Object.assign(t, o);
}

// ---------- 챔피언십 포인트 (공식 값) ----------
const cpRows = algs.cp.map(([rank, id, name, short, region, total, players]) => ({ rank, id, short, name, region: normRegion(region), total, players }));
const cp32 = cpRows.find((r) => r.rank === CP_DIRECT)?.total ?? 0;
const cp33 = cpRows.find((r) => r.rank === CP_DIRECT + 1)?.total ?? 0;
for (const r of cpRows) {
  r.status = r.rank <= CP_DIRECT ? 'direct' : 'lcq';
  r.gap = r.rank <= CP_DIRECT ? r.total - cp33 : cp32 - r.total; // 직행권: 33위와의 여유 / 밖: 32위까지 부족분
  if (teams[r.id]) teams[r.id].cp = { rank: r.rank, total: r.total };
  r.kr = teams[r.id]?.krLevel || 'none';
}

// ---------- Pro League 포인트 ----------
const phaseQ = {};
for (const ev of algs.events) {
  const m = /^split-(\d)-pro-league-(.+)$/.exec(ev[1]);
  if (m && ev[6][0]) phaseQ[`s${m[1]}:${m[2]}`] = ev[6][0][3];
}
// Liquipedia 최종 순위로 덮어쓰기 (있을 때)
const lpPlaceFor = (key) => {
  if (!lpPlacements) return null;
  const [s, region] = key.split(':');
  const regionPage = { 'apac-north': 'APAC_North', 'apac-south': 'APAC_South', emea: 'EMEA', americas: 'Americas' }[region];
  const page = Object.keys(lpPlacements.placements).find((p) => p.includes(`Split_${s.slice(1)}/Pro_League/${regionPage}`));
  if (!page) return null;
  return new Map(lpPlacements.placements[page].map((x) => [nameKey(x.name), x.place]));
};
const pl = {};
for (const [key, rows] of Object.entries(algs.pl)) {
  const [s, region] = key.split(':');
  const lp = lpPlaceFor(key);
  const out = rows.map(([pos, short, name, id, cpPP, qualified, rs, group, kills, sp]) => {
    let finalPos = pos, src = 'algs';
    const lpPos = lp?.get(nameKey(name)) ?? lp?.get(nameKey(teams[id]?.name));
    if (lpPos && lpPos !== pos) { conflicts.push({ what: `${key} 최종 순위`, team: name, lp: lpPos, algs: pos }); finalPos = lpPos; src = 'lp'; }
    else if (lpPos) src = 'lp+algs';
    return { pos: finalPos, short: teams[id]?.short || short, name, id, cpPP, cpTeam: cpPP * 3, qualified: !!qualified, rs, group, kills, sp, src, kr: teams[id]?.krLevel || 'none' };
  }).sort((a, b) => a.pos - b.pos);
  const nr = normRegion(region);
  pl[`${s}:${nr}`] = { split: Number(s.slice(1)), region: nr, label: `Split ${s.slice(1)} · ${REGION_LABEL[nr]}`, playoffsLine: phaseQ[key] ?? null, rfLine: 20, rows: out };
}

// ---------- 이벤트·시리즈 ----------
const evById = Object.fromEntries(algs.events.map(([id, slug, name, region, start, end]) => [id, { id, slug, name, region: normRegion(region), start, end }]));
const series = algs.series.map(([id, eventId, phase, name, status, start, regionName, mp, matches, res]) => {
  const ev = evById[eventId] || { name: '', slug: '' };
  const region = normRegion(regionName) || ev.region;
  const results = res ? res.map(([pos, short, pts, kills]) => ({ pos, short, pts, kills, kr: teams[shortToId[short]]?.krLevel || 'none' })).sort((a, b) => a.pos - b.pos) : null;
  return { id, eventId, event: ev.name, eventSlug: ev.slug, phase, name, status, start, region, mp: !!mp, matches, results,
    kr: results ? results.filter((r) => r.kr !== 'none').map((r) => r.short) : [] };
}).sort((a, b) => a.start.localeCompare(b.start));

// ---------- 진행 중 국제전 단계 순위 ----------
const intlEv = Object.values(evById).find((e) => /playoffs|champs/.test(e.slug) && algs.poGroup.length && new Date(e.start) <= new Date(algs.fetchedAt) && new Date(e.end) >= new Date(new Date(algs.fetchedAt) - 3 * 864e5));
const intl = algs.poGroup.length ? {
  eventId: intlEv?.id, name: intlEv?.name || 'Playoffs', phase: 'Group Stage', winnersCut: 20,
  rows: algs.poGroup.map(([pos, short, name, id, group, pts, kills, region]) => ({
    pos, short, name, id, group, pts, kills, region: normRegion(region), kr: teams[id]?.krLevel || 'none',
    next: pos <= 20 ? 'Winners Round' : 'Elimination Round 1',
  })),
} : null;

// ---------- 한국 팀 요약 ----------
const now = new Date(algs.fetchedAt);
const kr = Object.values(teams).filter((t) => t.krLevel !== 'none' && (t.cp || pl['s2:apac-n']?.rows.some((r) => r.id === t.id)))
  .map((t) => {
    const s2 = pl['s2:apac-n']?.rows.find((r) => r.id === t.id) || Object.values(pl).filter((p) => p.split === 2).flatMap((p) => p.rows).find((r) => r.id === t.id);
    const ir = intl?.rows.find((r) => r.id === t.id);
    const next = ir ? series.find((s) => s.eventId === intl.eventId && s.status !== 'completed' && s.name === ir.next) : null;
    const cpr = cpRows.find((r) => r.id === t.id);
    return {
      short: t.short, name: t.name, level: t.krLevel, krPlayers: t.krPlayers,
      cp: cpr ? { rank: cpr.rank, total: cpr.total, gap: cpr.gap, status: cpr.status } : null,
      pl: s2 ? { pos: s2.pos, rs: s2.rs, kills: s2.kills, qualified: s2.qualified } : null,
      intl: ir ? { pos: ir.pos, pts: ir.pts, of: intl.rows.length, next: ir.next } : null,
      nextSeries: next ? { id: next.id, name: next.name, start: next.start, event: next.event } : null,
    };
  })
  .sort((a, b) => (a.level === 'team' ? 0 : 1) - (b.level === 'team' ? 0 : 1) || (a.cp?.rank ?? 999) - (b.cp?.rank ?? 999));

// ---------- 방송 ----------
// 선수 채널 우선순위: 수동 입력(config/players.json) > Liquipedia 선수 링크 > 공식 API(선수당 1개)
const streamUrl = (provider, ch) => !ch ? null : provider === 'twitch' ? `https://www.twitch.tv/${ch}` : provider === 'youtube' ? `https://www.youtube.com/@${ch}` : provider === 'soop' ? `https://ch.sooplive.co.kr/${ch}` : provider === 'chzzk' ? `https://chzzk.naver.com/${ch}` : null;
const PLATFORMS = ['twitch', 'chzzk', 'youtube', 'soop'];
const lpPlayers = readJson('raw/lp/players.json');
const manualPlayers = readJson('config/players.json', { players: {} }).players || {};
const lpLinks = (name) => {
  const p = lpPlayers?.players.find((x) => nameKey(x.id) === nameKey(name));
  if (!p) return {};
  const L = p.links || {};
  const pick = (...keys) => keys.map((k) => L[k]).find(Boolean) || null;
  return { twitch: pick('twitch', 'twitch2'), youtube: pick('youtube', 'youtube2'), chzzk: pick('chzzk'), soop: pick('afreeca', 'soop', 'sooplive') };
};
const manual = (name) => Object.entries(manualPlayers).find(([k]) => nameKey(k) === nameKey(name))?.[1] || {};
const playerStreams = algs.krStreams.map(([team, name, role, provider, ch]) => {
  const links = Object.fromEntries(PLATFORMS.map((p) => [p, null]));
  if (provider && PLATFORMS.includes(provider)) links[provider] = streamUrl(provider, ch);
  for (const src of [lpLinks(name), manual(name)]) for (const p of PLATFORMS) if (src[p]) links[p] = src[p];
  return { team, name, role, links };
}).sort((a, b) => (a.role === 'coach') - (b.role === 'coach'));
const streams = {
  official: algs.officialStreams.map(([name, provider, ch]) => ({ name, provider, ch, url: streamUrl(provider, ch) })),
  broadcasts: season.broadcasts || [],
  partners: (algs.partnerStreams || []).map(([name, provider, ch]) => ({ name, provider, url: streamUrl(provider, ch) })),
  players: playerStreams.concat(ov.streams || []),
};

// ---------- Battlefy ----------
const cc = bf ? { fetchedAt: bf.fetchedAt, apacN: (bf.leaderboards['asia-pacific-north'] || []).slice(0, 15).map(([rank, name, score, players]) => ({ rank, name, score, players })) } : null;

const data = {
  generated: new Date().toISOString(),
  sources: { algs: algs.fetchedAt, lp: lpPlacements?.fetchedAt || null, battlefy: bf?.fetchedAt || null },
  seasonId: algs.seasonId,
  season,
  // 약칭은 시즌마다 겹칠 수 있어 현재 팀만 약칭 키로 내보낸다 (지난 팀은 이름으로만 표시)
  teams: Object.fromEntries(Object.values(teams).filter((t) => t.short && t.current).map((t) => [t.short, t])),
  cp: cpRows, pl, series, intl, kr, streams, cc, conflicts,
};

const v = hash(JSON.stringify({ ...data, generated: null }));
const prevVer = readJson('site/data/ver.json');
if (prevVer?.v === v && !process.argv.includes('--force')) { console.log(`[build] 변경 없음 (v=${v})`); process.exit(0); }
const body = JSON.stringify(data);
writeText('site/data/algs-data.js', `// generated by scripts/build-data.mjs - do not edit\nwindow.ALGS = ${body};\n`);
writeText('site/data/ver.json', JSON.stringify({ v, built: data.generated, sources: data.sources }));
console.log(`[build] v=${v} teams ${Object.keys(data.teams).length}, cp ${cpRows.length}, pl ${Object.keys(pl).length}, series ${series.length}, kr ${kr.length}, conflicts ${conflicts.length}, ${(body.length / 1024).toFixed(0)}KB`);
