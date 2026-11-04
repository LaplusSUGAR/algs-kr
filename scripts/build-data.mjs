// raw/ 아래 출처별 원본을 우선순위 규칙으로 합쳐 site/data/algs-data.js 와 site/data/ver.json 을 만든다.
//
// 우선순위 (보고서 "데이터 출처와 우선순위")
//   - 순위·결과·로스터: Liquipedia(raw/lp) > 공식 API(raw/algs). 값이 다르면 Liquipedia 값을 쓰고 conflicts에 기록
//   - 챔피언십 포인트: 공식 API 값 표시 (Liquipedia는 공식 값을 옮겨 적는 데이터)
//   - 선수 국적(한국 판별): 공식 API country
//   - Challenger Circuit: Battlefy
//   - 수동 보정: config/overrides.json (팀 한글명, 색, 한국 판정 강제 등)
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, readJson, writeText, hash, normRegion, REGION_LABEL, nameKey } from './lib.mjs';
import { nk as logoKey } from './lp-teams-parse.mjs';

// 정적 파일 캐시 무효화: index.html의 링크에 파일 내용 해시를 붙인다 (GitHub Pages는 10분 캐시)
function stampAssets() {
  const idx = path.join(ROOT, 'site/index.html');
  let html = fs.readFileSync(idx, 'utf8');
  const before = html;
  for (const rel of ['assets/style.css', 'assets/app.js', 'assets/config.js', 'assets/i18n.js']) {
    const h = hash(fs.readFileSync(path.join(ROOT, 'site', rel), 'utf8'));
    html = html.replace(new RegExp(`${rel.replace('.', '\\.')}(\\?v=\\w+)?"`), `${rel}?v=${h}"`);
  }
  if (html !== before) { fs.writeFileSync(idx, html); console.log('[build] index.html 자산 버전 갱신'); }
}
stampAssets();

const algs = readJson('raw/algs/snapshot.json');
if (!algs) throw new Error('raw/algs/snapshot.json 이 없습니다. 먼저 npm run fetch:algs');
const lpPlacements = readJson('raw/lp/placements.json');
const bf = readJson('raw/battlefy/cc.json');
const ov = readJson('config/overrides.json', {});
const season = readJson('config/season.json');

const conflicts = [];
const evByIdEarly = Object.fromEntries(algs.events.map(([id, , , , start]) => [id, { start }]));
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

// 팀 로고: [어두운 배경용(흰 로고), 밝은 배경용(어두운 로고)]
// 1순위 scripts/logos.mjs가 만든 새 로고(raw/logos/index.json → 'logos/t/<해시>', 화면이 -64.webp·-160.webp를 붙여 씀:
//   운영자 파일 > Liquipedia(이름·선수 대조 통과) > 공식 API). 없으면 예전 128px PNG, 그것도 없으면 공식 원본 주소
const logoIndex = readJson('raw/logos/index.json', {});
const localLogo = (u) => (u && fs.existsSync(path.join(ROOT, 'site/logos', `${hash(u)}.png`)) ? `logos/${hash(u)}.png` : u || null);
const logoOf = (key, official) => {
  const e = logoIndex[key];
  if (e?.f && (e.f[0] || e.f[1])) return [e.f[0] || null, e.f[1] || null]; // 한쪽이 없으면 화면이 다른 쪽을 반대색 받침 위에 놓음
  return official ? [localLogo(official[0]), localLogo(official[1])] : null;
};
for (const t of Object.values(teams)) t.logo = logoOf(`id:${t.id}`, algs.logos?.[t.id]);

// 로스터와 한국 판별
// config/players.json: 선수별 수동 보정. role(coach/player)로 역할을 고치고, heritage: "KR"로 한국계(혼혈·이중국적 등)를 표시한다.
const playerCfg = readJson('config/players.json', { players: {} }).players || {};
const pcfg = (name) => Object.entries(playerCfg).find(([k]) => nameKey(k) === nameKey(name))?.[1] || {};
const ROLE_CODE = { player: 'p', captain: 'c', coach: 'k' };
for (const [id, s] of Object.entries(algs.rosters)) {
  const t = teams[id];
  if (!t) continue;
  t.roster = s.split(';').map((x) => {
    const [n, c, r, rep] = x.split('|');
    const o = pcfg(n);
    const p = { n, c, r: ROLE_CODE[o.role] || r };
    // 한국계: 국적·대표 국가 중 하나만 KR이거나, 운영자가 heritage로 지정한 경우
    const krRep = rep === 'KR';
    if (rep) p.rep = rep;
    if ((krRep && c !== 'KR') || (c === 'KR' && rep && rep !== 'KR') || o.heritage === 'KR') p.mix = 1;
    if (o.note) p.note = o.note;
    if (o.country) p.c = o.country; // 운영자가 국적을 적어 둔 경우
    return p;
  });
}
// 로스터 이동 (config/overrides.json rosterMoves): 공식 API에 반영되기 전의 이적을 팀 로스터에 먼저 반영한다.
//   out = 빠진 선수, in = 들어온 선수. 들어온 선수의 국적·역할은 다른 팀 공식 로스터에서 찾고, 없으면 players.json(country) 또는 미상
//   팀 CP(현재 로스터 상위 3인)는 화면이 cpRosterOut·cpRosterAdd로 다시 계산한다
const rosterMoves = (ov.rosterMoves || []).filter((m) => m.team);
const cpRosterOut = {}, cpRosterAdd = Object.fromEntries(Object.entries(ov.cpRosterAdd || {}).map(([k, v]) => [k, [...v]]));
{
  const known = new Map();
  for (const t of Object.values(teams)) for (const p of t.roster) if (!known.has(nameKey(p.n))) known.set(nameKey(p.n), p);
  for (const m of rosterMoves) {
    const t = Object.values(teams).find((x) => x.short === m.team && x.roster.length);
    if (!t) { console.log(`[build] 로스터 이동: ${m.team} 팀을 찾지 못함`); continue; }
    const outK = new Set((m.out || []).map(nameKey));
    t.roster = t.roster.filter((p) => !outK.has(nameKey(p.n)));
    for (const n of m.in || []) {
      if (t.roster.some((p) => nameKey(p.n) === nameKey(n))) continue;
      const k = known.get(nameKey(n)), o = pcfg(n);
      const p = { n: k?.n || n, c: o.country || k?.c || '', r: ROLE_CODE[o.role] || 'p', moved: m.date || 1 };
      if (k?.rep) p.rep = k.rep;
      if (k?.mix || o.heritage === 'KR') p.mix = 1;
      t.roster.push(p);
    }
    (cpRosterOut[m.team] ||= []).push(...(m.out || []));
    (cpRosterAdd[m.team] ||= []).push(...(m.in || []).filter((n) => !(cpRosterAdd[m.team] || []).includes(n)));
  }
}

// 한국 선수·코치 판정은 국적 KR만. 한국계(혼혈·이중국적, mix)는 표시만 하고 한국 관련 팀으로 묶지 않는다.
const isKrP = (p) => p.c === 'KR';
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
  else if (t.roster.length) t.krPlayers = t.roster.filter((p) => isKrP(p) && p.r !== 'k').map((p) => p.n);
  t.krCoaches = t.current ? t.roster.filter((p) => isKrP(p) && p.r === 'k').map((p) => p.n) : [];
  // 3인 라인업 기준: 한국 선수 2명 이상 = 한국 팀, 1명 = 한국 선수 소속 팀, 선수는 없고 한국 코치만 = 한국 코치 팀
  // kc: 한국 코치가 있는 팀 (화면에서 파란색으로 따로 구별)
  const kr = t.krPlayers.length;
  t.krLevel = kr >= 2 ? 'team' : kr === 1 ? 'member' : t.krCoaches.length ? 'coach' : 'none';
  t.kc = t.krCoaches.length > 0;
  const o = ov.teams?.[t.short];
  if (o) Object.assign(t, o);
}

// ---------- 챔피언십 포인트 (공식 값) ----------
const cpRows = algs.cp.map(([rank, id, name, short, region, total, players]) => ({ rank, id, short, name, region: normRegion(region), total, players }));
// CP 동률 (공식 규정 부록 C7.3, 화면의 정산 순위와 같은 규칙):
//   (A) Split 2 플레이오프 최종 순위 (미출전은 뒤) → (B) 프로리그 Split 2 최종 순위
//   → C7.2(프로리그 Split 2 세부 기준)는 정규 시즌 포인트 → 킬 순으로 근사 → 마지막은 공식 순위
{
  const po = new Map(((algs.cpEvents || []).find(([, slug]) => slug === 'split-2-playoffs')?.[2] || []).filter((r) => r[2]).map((r) => [r[2], r[0]]));
  const pl2 = new Map(Object.entries(algs.pl).filter(([k]) => k.startsWith('s2:')).flatMap(([, rows]) => rows.map((r) => [r[3], { pos: r[0], rs: r[6] ?? 0, kills: r[8] ?? 0 }])));
  cpRows.sort((a, b) => b.total - a.total || (po.get(a.id) ?? 999) - (po.get(b.id) ?? 999)
    || (pl2.get(a.id)?.pos ?? 99) - (pl2.get(b.id)?.pos ?? 99) || (pl2.get(b.id)?.rs ?? 0) - (pl2.get(a.id)?.rs ?? 0) || (pl2.get(b.id)?.kills ?? 0) - (pl2.get(a.id)?.kills ?? 0) || a.rank - b.rank);
  cpRows.forEach((r, i) => (r.rank = i + 1));
}
const cp32 = cpRows.find((r) => r.rank === CP_DIRECT)?.total ?? 0;
const cp33 = cpRows.find((r) => r.rank === CP_DIRECT + 1)?.total ?? 0;
for (const r of cpRows) {
  r.status = r.rank <= CP_DIRECT ? 'direct' : 'lcq';
  r.gap = r.rank <= CP_DIRECT ? r.total - cp33 : cp32 - r.total; // 직행권: 33위와의 여유 / 밖: 32위까지 부족분
  if (teams[r.id]) teams[r.id].cp = { rank: r.rank, total: r.total };
  r.kr = teams[r.id]?.krLevel || 'none';
}

// ---------- 대회별 챔피언십 포인트 ----------
// 프로리그 4지역 × 2 Split + 플레이오프 2회. 순위가 아직 안 정해진 자리(진행 중 대회)는 id 없이 CP만 남긴다.
const cpEvents = (algs.cpEvents || []).map(([id, slug, rows]) => {
  const ev = evByIdEarly[id] || {};
  const m = /^split-(\d)-(pro-league-(.+)|playoffs.*)$/.exec(slug) || [];
  const split = Number(m[1]), isPl = !!m[3];
  const region = isPl ? normRegion(m[3]) : 'global';
  const short = isPl ? `S${split} PL ${({ 'apac-n': 'APAC-N', 'apac-s': 'APAC-S', emea: 'EMEA', americas: 'AMER' })[region] || ''}` : `S${split} PO`;
  return {
    id, slug, split, kind: isPl ? 'pl' : 'po', region, start: ev.start || '', short,
    label: isPl ? `Split ${split} 프로리그 · ${REGION_LABEL[region]}` : `Split ${split} 플레이오프`,
    rows: rows.map(([pos, cp, teamId, name, ps]) => ({ pos, cp, id: teamId, short: teamId ? teams[teamId]?.short || '' : '', name,
      players: ps ? ps.split(';').map((x) => x.split('|')) : [], kr: teamId ? teams[teamId]?.krLevel || 'none' : 'none' })),
  };
}).sort((a, b) => a.start.localeCompare(b.start) || a.slug.localeCompare(b.slug));

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
const lcqLineups = Object.assign({}, ...Object.values(algs.lcq || {}).map((x) => x.lineups || {}));
const evById = Object.fromEntries(algs.events.map(([id, slug, name, region, start, end]) => [id, { id, slug, name, region: normRegion(region), start, end }]));
const series = algs.series.map(([id, eventId, phase, name, status, start, regionName, mp, matches, res]) => {
  const ev = evById[eventId] || { name: '', slug: '' };
  const region = normRegion(regionName) || ev.region;
  const results = res ? res.map(([pos, short, pts, kills, m]) => ({ pos, short, pts, kills, kr: teams[shortToId[short]]?.krLevel || 'none', ...(m === 2 ? { won: true, mpe: true } : m === 1 ? { mpe: true } : {}) })).sort((a, b) => a.pos - b.pos) : null;
  const lineup = algs.lineups?.[id] || lcqLineups[id] || null;
  return { id, eventId, event: ev.name, eventSlug: ev.slug, phase, name, status, start, region, mp: !!mp, matches, results, lineup,
    kr: results ? results.filter((r) => r.kr !== 'none').map((r) => r.short) : [] };
});
// LCQ 시각 보정 (config/overrides.json lcqSchedule)
//   공식 API가 네 지역 LCQ의 같은 단계에 똑같은 시각을 넣어 둔 동안은 지역 구분 없는 임시값으로 본다
//   (공식 사이트는 태평양 시간 기준으로 입력: 토 01:00 UTC = 금 17:00 PT).
//   보정 시각이 있으면 그 시각, keep이면 공식 값 그대로, 둘 다 없으면 '시각 미정'(timeTbd).
//   공식 값이 지역마다 달라지면 보정 없이 공식 값을 쓴다.
{
  const lcqIds = new Set(Object.values(evById).filter((e) => e.slug.startsWith('last-chance-qualifier')).map((e) => e.id));
  const lcqS = series.filter((x) => lcqIds.has(x.eventId));
  const fix = ov.lcqSchedule || {};
  // 먼저 단계별로 임시값인지 판단 (보정하면서 시각이 바뀌기 전에)
  const temp = new Set([...new Set(lcqS.map((x) => x.name))].filter((n) => {
    const same = lcqS.filter((y) => y.name === n);
    return new Set(same.map((y) => y.region)).size >= 3 && new Set(same.map((y) => y.start)).size === 1;
  }));
  for (const x of lcqS) {
    if (!temp.has(x.name)) continue; // 지역별 공식 시각이 있음
    const f = fix[x.region] || {};
    x.startOfficial = x.start;
    if (f[x.name]) { x.start = new Date(f[x.name]).toISOString(); x.startFix = 'site'; }
    else if (f.keep) x.startFix = 'keep';
    else x.timeTbd = true;
    if (f.note) x.startNote = f.note;
  }
}
series.sort((a, b) => a.start.localeCompare(b.start));

// ---------- 진행 중 국제전 단계 순위 ----------
const intlEv = Object.values(evById).find((e) => /playoffs|champs/.test(e.slug) && algs.poGroup.length && new Date(e.start) <= new Date(algs.fetchedAt) && new Date(e.end) >= new Date(new Date(algs.fetchedAt) - 3 * 864e5));
const intl = intlEv && algs.poGroup.length ? {
  eventId: intlEv.id, name: intlEv.name, slug: intlEv.slug, start: intlEv.start, end: intlEv.end, phase: 'Group Stage', winnersCut: 20,
  rows: algs.poGroup.map(([pos, short, name, id, group, pts, kills, region]) => ({
    pos, short, name, id, group, pts, kills, region: normRegion(region), kr: teams[id]?.krLevel || 'none',
    next: pos <= 20 ? 'Winners Round' : 'Elimination Round 1',
  })),
} : null;

// ---------- 이전 결과: 시작한 국제전 전부 (최근 순). 조별 리그 누적은 대회별로 보관된 값 ----------
// format 'bracket' (Split 2·챔피언십): 조별 리그 → 승자 라운드/패자부활 1·2R → 결승
// format 'stages'  (Split 1 EWC): 조별 리그 상위 N팀 결승 직행, 다음 M팀 서바이벌 스테이지(상위 K팀 결승), 나머지 탈락
//   직행·서바이벌 인원은 실제 결과에서 계산하고, 결과가 없으면 공식 단계의 진출 기준(0부터 센 값)을 쓴다
const latestIntlId = Object.values(evById).filter((e) => /playoffs|champs/.test(e.slug) && new Date(e.start) <= new Date(algs.fetchedAt) && algs.events.find((x) => x[0] === e.id)?.[6]?.length)
  .sort((a, b) => b.start.localeCompare(a.start))[0]?.id;
const past = Object.values(evById).filter((e) => /playoffs|champs/.test(e.slug) && new Date(e.start) <= new Date(algs.fetchedAt))
  .sort((a, b) => b.start.localeCompare(a.start)).map((e) => {
    const ss = series.filter((x) => x.eventId === e.id);
    const bracketFmt = ss.some((x) => x.name === 'Winners Round');
    let stages = null;
    if (!bracketFmt) {
      const ph = algs.events.find((x) => x[0] === e.id)?.[6] || [];
      const mid = ss.find((x) => x.phase !== 'Group Stage' && x.phase !== 'Match Point Finals');
      const f = ss.find((x) => x.phase === 'Match Point Finals');
      const fT = new Set((f?.results || []).map((r) => r.short)), mT = new Set((mid?.results || []).map((r) => r.short));
      const th = (name) => ph.find((p) => p[1] === name)?.[3];
      const direct = fT.size && mT.size ? [...fT].filter((x) => !mT.has(x)).length : th('Group Stage') != null ? th('Group Stage') + 1 : null;
      const midTop = fT.size && mT.size ? [...mT].filter((x) => fT.has(x)).length : mid && th(mid.phase) != null ? th(mid.phase) + 1 : null;
      if (mid && direct) stages = { direct, midN: mid.results?.length || 20, midTop, midPhase: mid.phase };
    }
    const next = (pos) => (bracketFmt ? (pos <= 20 ? 'Winners Round' : 'Elimination Round 1') : stages ? (pos <= stages.direct ? 'Match Point Finals' : pos <= stages.direct + stages.midN ? stages.midPhase : 'Eliminated') : undefined);
    const raw = algs.poGroups?.[e.id] || (e.id === latestIntlId ? algs.poGroup : []);
    const rows = raw.map(([pos, short, name, id, group, pts, kills, region]) => ({ pos, short: teams[id]?.short || short, name, id, group, pts, kills, region: normRegion(region), kr: teams[id]?.krLevel || 'none', ...(next(pos) ? { next: next(pos) } : {}) }));
    return { eventId: e.id, slug: e.slug, name: e.name, start: e.start, end: e.end, format: bracketFmt ? 'bracket' : 'stages', winnersCut: bracketFmt ? 20 : null, stages, rows };
  }).filter((e) => e.rows.length || series.some((x) => x.eventId === e.eventId && x.results));

// ---------- LCQ 챌린저 서킷 팀 (Liquipedia) ----------
// 공식 명단이 나오기 전 LCQ의 2부(챌린저 서킷) 자리를 채우는 순서: 서킷 우승팀(초록) → 종합 포인트 순.
// 지역마다 '40 − 직행권 밖 프로리그 팀 수'만큼 화면이 위에서부터 잘라 쓴다 (직행 수는 정산 순위에 따라 바뀌므로)
const lpLcq = readJson('raw/lp/lcq.json', null);
const nk = (x) => String(x || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const unent = (x) => String(x).replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#160;/g, ' ');
const lpTeamsSrc = readJson('raw/lp/teams-src.json', { pages: {} });
const ccOf = (region) => {
  const html = lpLcq?.cc?.[region]?.html || '';
  const rows = [...html.matchAll(/<tr><td class="([^"]*)">(\d+)<\/td><td[^>]*>[\s\S]*?team-template-text"><a[^>]*>([^<]+)<\/a>[\s\S]*?<\/td><td[^>]*><b>([\d,]+)<\/b>/g)]
    .map((m) => ({ cls: m[1], rank: +m[2], name: unent(m[3]).trim(), pts: +m[4].replace(/,/g, '') }));
  // LCQ 대회 페이지에서 서킷 몇 차 우승인지
  const won = {};
  for (const m of (lpLcq?.pages?.[region]?.text || '').matchAll(/\{\{Opponent\|([^\n|}]*)[\s\S]*?qualification=\{\{Qualification\|([^}]*)\}\}/g)) {
    const c = m[2].match(/Challenger_Circuit_(\d)/);
    if (c && !/Rankings/.test(m[2])) won[nk(m[1])] = +c[1];
  }
  const plNames = new Set(Object.values(teams).filter((t) => t.current && t.region === region).map((t) => nk(t.name)));
  // 팀 이름 변경: 서킷 순위표는 포인트를 딴 때의 이름이라, LCQ 참가 명단(Liquipedia)의 새 이름으로 바꾼다.
  //   1) config/overrides.json ccRenames { 옛 이름: 새 이름 }  2) 참가 명단에 같은 이름이 없고, 선수(서브 제외) 2명 이상이 같은 참가 팀이 하나뿐이면 그 이름
  const opps = [...(lpLcq?.pages?.[region]?.text || '').matchAll(/\{\{Opponent\|([^\n|}]*)\s*\|players=\{\{Persons([\s\S]*?)\n\s*\}\}/g)]
    .map((m) => {
      const ps = [...m[2].matchAll(/\{\{Person\|([^|}]+)([^}]*)\}\}/g)].map((p) => ({ n: p[1].trim(), c: (p[2].match(/flag=([a-z]{2})\b/i)?.[1] || '').toUpperCase(), sub: /status=sub|played=false/.test(p[2]) }));
      return { name: m[1].trim(), roster: ps, players: ps.filter((p) => !p.sub).map((p) => nk(p.n)) };
    });
  const oppNames = new Set(opps.map((o) => nk(o.name)));
  const ccSrc = new Map((lpTeamsSrc.pages?.[`cc:${region}`]?.teams || []).map((t) => [nk(t.name), t.players || []]));
  const ccPlayers = new Map([...ccSrc].map(([k, v]) => [k, v.map(nk)]));
  // 선수 명단: LCQ 참가 명단(국적·서브 포함) > 서킷 순위표 팀 카드. [이름, 국적, 서브면 1]
  const rosterOf = (name, was) => {
    const o = opps.find((x) => nk(x.name) === nk(name)) || (was && opps.find((x) => nk(x.name) === nk(was)));
    if (o?.roster.length) return o.roster.map((p) => [p.n, p.c, p.sub ? 1 : 0]);
    return (ccSrc.get(nk(was || name)) || ccSrc.get(nk(name)) || []).map((n) => [n, '', 0]);
  };
  const renameOf = (name) => {
    if (ov.ccRenames?.[name]) return ov.ccRenames[name];
    if (!opps.length || oppNames.has(nk(name))) return null;
    const ps = ccPlayers.get(nk(name)) || [];
    if (ps.length < 2) return null;
    const hit = opps.filter((o) => !plNames.has(nk(o.name)) && o.players.filter((p) => ps.includes(p)).length >= 2);
    return hit.length === 1 ? hit[0].name : null;
  };
  return rows.filter((r) => !plNames.has(nk(r.name))).slice(0, 32)
    .map((r) => { const to = renameOf(r.name); const name = to || r.name; return { name, ...(to ? { was: r.name } : {}), rank: r.rank, pts: r.pts, win: won[nk(name)] || won[nk(r.name)] || (/green/.test(r.cls) ? -1 : 0), players: rosterOf(name, to ? r.name : null) }; });
};

// ---------- LCQ (지역별) ----------
// 공식 출전 명단이 나오면 그 팀들, 아직이면 빈 목록 (화면이 CP 순위로 예상 명단을 만든다)
// 프로리그에 없는 팀(챌린저 서킷)은 xteams에 이름·로고만 둔다
const xteams = {};
const lcq = Object.values(evById).filter((e) => e.slug.startsWith('last-chance-qualifier')).map((e) => {
  const raw = algs.lcq?.[e.id] || { teams: [] };
  const ts = raw.teams.map(([id, short, name, seed]) => {
    const t = teams[id];
    if (!t?.current && short) {
      xteams[short] = { id, short, name: name || short, region: e.region, logo: logoOf(`id:${id}`, algs.logos?.[id]) || logoOf(`cc:${logoKey(name)}`), d2: 1 };
    }
    return { id, short: t?.current ? t.short : short, name: t?.current ? t.name : name || short, seed, pl: !!t?.current };
  });
  // 2부 팀 표시용: 이름을 그대로 키로 쓴다 (공식 약칭이 없으므로). 프로리그 약칭과 겹치면 뒤에 표시를 붙인다
  const cc = ccOf(e.region).map((c) => {
    let key = c.name;
    if (teams[shortToId[key]]?.current) key = `${c.name} (CC)`;
    if (!xteams[key]) xteams[key] = { id: null, short: key, name: c.name, region: e.region, logo: logoOf(`cc:${logoKey(c.name)}`), d2: 1 };
    return { ...c, short: key };
  });
  return { eventId: e.id, slug: e.slug, name: e.name, region: e.region, start: e.start, end: e.end, teams: ts, cc };
}).sort((a, b) => ['apac-n', 'apac-s', 'emea', 'americas'].indexOf(a.region) - ['apac-n', 'apac-s', 'emea', 'americas'].indexOf(b.region));

// ---------- 한국 팀 요약 ----------
const now = new Date(algs.fetchedAt);
const kr = Object.values(teams).filter((t) => t.krLevel !== 'none' && (t.cp || pl['s2:apac-n']?.rows.some((r) => r.id === t.id)))
  .map((t) => {
    const s2 = pl['s2:apac-n']?.rows.find((r) => r.id === t.id) || Object.values(pl).filter((p) => p.split === 2).flatMap((p) => p.rows).find((r) => r.id === t.id);
    const ir = intl?.rows.find((r) => r.id === t.id);
    const next = ir ? series.find((s) => s.eventId === intl.eventId && s.status !== 'completed' && s.name === ir.next) : null;
    const cpr = cpRows.find((r) => r.id === t.id);
    return {
      short: t.short, name: t.name, level: t.krLevel, kc: t.kc, krPlayers: t.krPlayers, krCoaches: t.krCoaches,
      cp: cpr ? { rank: cpr.rank, total: cpr.total, gap: cpr.gap, status: cpr.status } : null,
      pl: s2 ? { pos: s2.pos, rs: s2.rs, kills: s2.kills, qualified: s2.qualified } : null,
      intl: ir ? { pos: ir.pos, pts: ir.pts, of: intl.rows.length, next: ir.next } : null,
      nextSeries: next ? { id: next.id, name: next.name, start: next.start, event: next.event } : null,
    };
  })
  .sort((a, b) => ({ team: 0, member: 1, coach: 2 }[a.level] - { team: 0, member: 1, coach: 2 }[b.level]) || (a.cp?.rank ?? 999) - (b.cp?.rank ?? 999));

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
  if (ROLE_CODE[pcfg(name).role]) role = pcfg(name).role;
  const rp = teams[shortToId[team]]?.roster?.find((p) => p.n === name);
  const links = Object.fromEntries(PLATFORMS.map((p) => [p, null]));
  if (provider && PLATFORMS.includes(provider)) links[provider] = streamUrl(provider, ch);
  for (const src of [lpLinks(name), manual(name)]) for (const p of PLATFORMS) if (src[p]) links[p] = src[p];
  return { team, name, role, links, mix: rp?.mix ? 1 : 0 };
}).filter((p) => teams[shortToId[p.team]]?.current !== false).sort((a, b) => (a.role === 'coach') - (b.role === 'coach'));
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
  sources: { algs: algs.fetchedAt, lp: lpPlacements?.fetchedAt || null, battlefy: bf?.fetchedAt || null, lpLcq: lpLcq?.fetchedAt || null },
  seasonId: algs.seasonId,
  season,
  // 약칭은 시즌마다 겹칠 수 있어 현재 팀만 약칭 키로 내보낸다 (지난 팀은 이름으로만 표시)
  teams: Object.fromEntries(Object.values(teams).filter((t) => t.short && t.current).map((t) => [t.short, t])),
  cp: cpRows, cpEvents, pl,
  // 국제전 실제 출전 로스터(팀 약칭 → [[선수ID, 이름, 역할]])와 운영자가 확인한 대체 출전
  poRosters: Object.fromEntries(Object.entries(algs.poRosters || {}).map(([id, ps]) => [teams[id]?.short || id, ps])),
  cpSubs: ov.cpSubs || {},
  cpRosterAdd, cpRosterOut,
  rosterMoves: rosterMoves.map((m) => ({ team: m.team, out: m.out || [], in: m.in || [], date: m.date || null })),
  // 대회별 선수 출전 경기 수 { eventId: { 선수ID: 경기 수 } } — 12경기 이상이어야 그 대회 CP를 받음
  mc: (() => { const m = {}; for (const { e, c } of Object.values(readJson('raw/algs/matchcounts.json', { series: {} }).series)) { const t = (m[e] ||= {}); for (const [pid, n] of Object.entries(c)) t[pid] = (t[pid] || 0) + n; } return m; })(), series, intl, past, lcq, xteams, kr, streams, cc, conflicts,
  // 브라우저가 공식 API에서 확정값을 직접 다시 받을 때 쓰는 값
  api: {
    cpEventIds: algs.events.filter((e) => /^split-\d-pro-league-/.test(e[1])).map((e) => [e[1], e[0]]).filter(([sl]) => sl.startsWith(`split-${latestSplit.slice(1)}-`)).map(([, id]) => id),
    intlEventId: intlEv?.id || null,
    groupPhaseId: intlEv ? algs.events.find((e) => e[0] === intlEv.id)?.[6]?.[0]?.[0] || null : null,
  },
};

const v = hash(JSON.stringify({ ...data, generated: null }));
const prevVer = readJson('site/data/ver.json');
if (prevVer?.v === v && !process.argv.includes('--force')) { console.log(`[build] 변경 없음 (v=${v})`); process.exit(0); }
const body = JSON.stringify(data);
writeText('site/data/algs-data.js', `// generated by scripts/build-data.mjs - do not edit\nwindow.ALGS = ${body};\n`);
{ const idx = path.join(ROOT, 'site/index.html'); const html = fs.readFileSync(idx, 'utf8').replace(/data\/algs-data\.js(\?v=\w+)?"/, `data/algs-data.js?v=${v}"`); fs.writeFileSync(idx, html); }
writeText('site/data/ver.json', JSON.stringify({ v, built: data.generated, sources: data.sources }));
console.log(`[build] v=${v} teams ${Object.keys(data.teams).length}, cp ${cpRows.length}, pl ${Object.keys(pl).length}, series ${series.length}, kr ${kr.length}, conflicts ${conflicts.length}, ${(body.length / 1024).toFixed(0)}KB`);
