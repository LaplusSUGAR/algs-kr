// ALGS 공식 API(prod-api.algstools.com)에서 필요한 데이터를 받아 raw/algs/snapshot.json으로 저장한다.
// 공개 문서가 없는 내부 API다. 응답 형식이 바뀌면 이 스크립트는 실패하고, 빌드는 이전 스냅샷이나 Liquipedia 값으로 진행한다.
//
// snapshot.json 형식 (배열 = compact)
//   events : [eventId, slug, tournamentName, region, startISO, endISO, phases[[phaseId, name, method, qualificationThreshold]]]
//   cp     : [rank, teamId, teamName, short, region, totalCP, players[[name, cp]]]           (팀 CP = 상위 3인 합, 공식 계산값)
//   pl     : { "s1:apac-north": [[pos, short, name, teamId, cpPerPlayer, qualified, rsPoints, group, kills, seriesPlayed, krPlayers]] }
//   rosters: { teamId: "name|country|role|rep;..." }  role: p 선수, c 주장, k 코치, ? 불명 / rep: 대표 국가(countryOfRepresentation, 국적과 다를 때만)
//   lineups: { seriesId: [short...] }  (진행 중 국제전에서 아직 끝나지 않은 시리즈의 확정 출전 팀)
//   series : [seriesId, eventId, phaseName, seriesName, status, startsAtISO, regionName, isMatchPoint, matchCount, results[[pos, short, pts, kills]] | null]
//   poGroup: [pos, short, name, teamId, group, pts, kills, region]   (진행 중/최근 Playoffs 조별 리그 누적)
//   krStreams: [short, player, role, provider, channel]
//   poGroups: { eventId: [poGroup 행...] }  국제전마다 조별 리그 누적 (이전 결과 보기용, 끝난 대회도 보관)
//   lcq    : { eventId: { teams: [[teamId, short, name, seed]], lineups: { seriesId: [short...] } } }  LCQ 지역별 출전 팀·로비 배정
//
// 사용: node scripts/fetch-algs.mjs            (전체)
//       node scripts/fetch-algs.mjs --live-only (진행 중 시리즈 결과만 갱신; Worker와 같은 용도)
import { fetchJson, writeJson, readJson } from './lib.mjs';

const API = process.env.ALGS_API || 'https://prod-api.algstools.com/v1';
const SEASON_SLUG = process.env.ALGS_SEASON || 'year-6';
const KR = 'KR';
const roleCode = (r) => ({ player: 'p', captain: 'c', coach: 'k' }[r] || '?');
const get = (p) => fetchJson(API + p);

async function main() {
  const structure = await get('/seasons/structure');
  const season = structure.seasons.find((s) => s.slug === SEASON_SLUG);
  if (!season) throw new Error(`시즌 ${SEASON_SLUG}을 찾지 못함`);

  const events = season.tournaments.flatMap((t) =>
    t.events.map((e) => [e.id, e.slug, t.publicNameOverride || t.name, e.region?.slug || null, e.startDate, e.endDate,
      e.phases.map((p) => [p.id, p.name, p.standingsCalculationMethod, p.qualificationThreshold])]));

  // Pro League 이벤트 (지역별)
  const plEvents = season.tournaments.flatMap((t) => t.events.map((e) => ({ t, e })))
    .filter(({ e }) => /^split-\d-pro-league-/.test(e.slug));

  const pl = {};
  const rosters = {};
  for (const { e } of plEvents) {
    const split = 's' + e.slug.match(/^split-(\d)/)[1];
    const region = e.slug.replace(/^split-\d-pro-league-/, '');
    const phase = e.phases[0];
    const [ev, ph] = await Promise.all([get(`/events/${e.id}/standings`), get(`/stats/phases/${phase.id}/standings`)]);
    const pm = Object.fromEntries((ph.standings || []).map((s) => [s.teamId, s]));
    pl[`${split}:${region}`] = (ev.standings || []).map((s) => {
      const q = pm[s.teamId] || {};
      const players = s.players || [];
      const kr = players.filter((x) => x.country === KR && x.role !== 'coach').map((x) => x.name.trim()).join(',');
      if (!rosters[s.teamId]) rosters[s.teamId] = players.map((x) => `${x.name.trim()}|${x.country || ''}|${roleCode(x.role)}`).join(';');
      return [s.position, q.shortName || '', s.name, s.teamId, s.points, s.qualified ? 1 : 0, q.points ?? null, q.group || '', q.kills ?? null, q.matchSeriesPlayed ?? null, kr];
    });
  }

  // 챔피언십 포인트 (공식 페이지와 같은 파라미터: 현재 Split Pro League 이벤트, 최소 12경기)
  const lastPl = plEvents.filter(({ e }) => e.slug.startsWith('split-2-')).map(({ e }) => e.id);
  const cpRes = await get(`/seasons/${season.id}/standings/teams?eventIds=${encodeURIComponent(lastPl.join(','))}&minAmountOfMatches=12`);
  const cp = cpRes.standings.map((s) => [s.rank, s.teamId, s.teamName, s.shortName, s.region, s.totalPoints, s.players.map((p) => [p.name.trim(), p.points, p.id])]);

  // 챔피언십 포인트를 주는 대회별 결과: 누가 어느 대회에서 몇 CP를 받았는지
  //   cpEvents: [[eventId, slug, rows[[순위, 1인당CP, teamId, 팀이름, "선수ID|이름;..."(코치 제외)]]]]  아직 정해지지 않은 순위는 teamId null
  const cpEvents = [];
  const logoSources = [];
  for (const e of season.tournaments.flatMap((t) => t.events).filter((x) => /^split-\d-(pro-league-|playoffs)/.test(x.slug))) {
    if (new Date(e.startDate) > new Date()) continue;
    try {
      const st = await get(`/events/${e.id}/standings`);
      logoSources.push(st.standings || []);
      const rows = (st.standings || []).filter((r) => r.points != null).map((r) => [r.position, r.points, r.teamId || null, r.name || null,
        (r.players || []).filter((p) => p.role !== 'coach').map((p) => `${p.id}|${p.name.trim()}`).join(';')]);
      if (rows.length) cpEvents.push([e.id, e.slug, rows]);
    } catch {}
  }

  // 시리즈: Playoffs, LCQ, 최근 APAC North Pro League
  const allSeries = (await get(`/series/seasons/${season.id}`)).series || [];
  const krShorts = new Set();
  for (const rows of Object.values(pl)) for (const r of rows) if (r[10]) krShorts.add(r[1]);
  const isWanted = (s) => /playoffs|last-chance|lcq|champs/i.test(s.event?.slug || '') || /Last Chance|Playoffs|Championship/.test(s.tournament?.name || '')
    || (s.event?.slug || '').startsWith('split-2-pro-league-apac-north');
  const series = [];
  for (const s of allSeries.filter(isWanted)) {
    let res = null;
    if (s.status === 'completed' || s.status === 'live') {
      let st = {};
      try { st = await get(`/stats/series/${s.id}`); } catch { /* 막 시작해 통계가 아직 없음 */ }
      const intl = !(s.event?.slug || '').includes('pro-league');
      // 5번째 값: 1 = 매치 포인트 도달, 2 = 매치 포인트 우승
      res = (st.teams || []).filter((t) => intl || t.position <= 3 || krShorts.has(t.shortName)).map((t) => [t.position, t.shortName, t.points, t.kills, t.wonMatchPoint ? 2 : t.matchPointEligible ? 1 : 0]);
    }
    series.push([s.id, s.event?.id, s.phase?.name, s.name, s.status, s.startsAt, s.region?.name || '', s.isMatchPointFormat ? 1 : 0, (s.matches || []).length, res]);
  }

  // 가장 최근 국제전(Playoffs/Championship)의 첫 단계 누적 순위
  const intlEvent = season.tournaments.flatMap((t) => t.events).filter((e) => /playoffs|champs/.test(e.slug) && e.phases.length)
    .sort((a, b) => b.startDate.localeCompare(a.startDate)).find((e) => new Date(e.startDate) <= new Date());
  const prev = readJson('raw/algs/snapshot.json', {});
  let poGroup = [];
  // 국제전 출전 로스터 (대체 선수 포함, 비자 문제 등으로 바뀐 실제 명단): { teamId: [[선수ID, 이름, 역할]] }
  const poRosters = {};
  if (intlEvent) {
    try {
      const pt = await get(`/phases/${intlEvent.phases[0].id}/teams`);
      for (const tm of pt.teams || []) poRosters[tm.teamId] = tm.players.map((p) => [p.id, p.name.trim(), roleCode(p.role)]);
    } catch {}
  }
  if (intlEvent) {
    const gs = await get(`/stats/phases/${intlEvent.phases[0].id}/standings`);
    poGroup = (gs.standings || []).map((s) => [s.position, s.shortName, s.name, s.teamId, s.group, s.points, s.kills, s.region]);
  }

  // 최신 Split Pro League 4개 지역 로스터 (전 팀). 대표 국가가 국적과 다르면 함께 저장 (한국계 선수 표시용)
  const latestSplit = Math.max(...plEvents.map(({ e }) => +e.slug.match(/^split-(\d)/)[1]));
  const latestPl = plEvents.filter(({ e }) => e.slug.startsWith(`split-${latestSplit}-`));
  const krStreams = [];
  const logos = {}; // teamId: [logoLight(흰 로고, 어두운 배경용), logoDark(어두운 로고, 밝은 배경용)] 공식 팀 로고 URL. 없는 쪽은 null
  const isKr = (p) => p.country === KR || p.countryOfRepresentation === KR;
  for (const { e } of latestPl) {
    const teams = (await get(`/phases/${e.phases[0].id}/teams`)).teams || [];
    for (const tm of teams) {
      if (tm.logoLight || tm.logoDark) logos[tm.teamId] = [tm.logoLight || null, tm.logoDark || null];
      rosters[tm.teamId] = tm.players.map((p) => {
        const rep = p.countryOfRepresentation && p.countryOfRepresentation !== p.country ? p.countryOfRepresentation : '';
        return `${p.name.trim()}|${p.country || ''}|${roleCode(p.role)}${rep ? '|' + rep : ''}`;
      }).join(';');
      for (const p of tm.players.filter(isKr)) krStreams.push([tm.shortName, p.name.trim(), p.role, p.streamProvider, p.channelName]);
    }
  }

  // 선수별 출전 경기 수 (챔피언십 포인트는 그 대회에서 12경기 이상 뛴 선수만 받음)
  //   raw/algs/matchcounts.json: { series: { seriesId: { e: eventId, c: { 선수ID: 경기 수 } } } }
  //   끝난 시리즈는 한 번만 받고, 진행 중 시리즈는 매번 다시 센다
  try {
    const mcFile = readJson('raw/algs/matchcounts.json', { series: {} });
    const cpEventIds = new Set(season.tournaments.flatMap((t) => t.events).filter((x) => /^split-\d-(pro-league-|playoffs)/.test(x.slug)).map((x) => x.id));
    const todo = allSeries.filter((x) => cpEventIds.has(x.event?.id) && (x.status === 'live' || (x.status === 'completed' && !mcFile.series[x.id])));
    const jobs = [];
    for (const x of todo) for (const m of (x.matches || []).filter((mm) => mm.status === 'completed')) jobs.push([x, m.matchNumber]);
    const acc = {};
    let i = 0;
    const worker = async () => {
      while (i < jobs.length) {
        const [x, n] = jobs[i++];
        try {
          const st = await fetchJson(`${API}/stats/series/${x.id}/match/number/${n}`, { retries: 1, delayMs: 150 });
          const c = (acc[x.id] ||= { e: x.event.id, c: {} }).c;
          for (const t of st.teams || []) for (const p of t.players || []) if (p.id) c[p.id] = (c[p.id] || 0) + 1;
        } catch {}
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
    let changed = false;
    for (const x of todo) if (acc[x.id]) { mcFile.series[x.id] = acc[x.id]; changed = true; }
    if (changed) writeJson('raw/algs/matchcounts.json', mcFile);
    console.log(`[algs] 출전 경기 수: 시리즈 ${todo.length}개, 게임 ${jobs.length}개 확인`);
  } catch (e) { console.error('[algs] 출전 경기 수 실패:', e.message); }

  // 진행 중 국제전의 남은 시리즈 출전 팀 (브래킷 표시용)
  const lineups = {};
  if (intlEvent) {
    for (const s of allSeries.filter((x) => x.event?.id === intlEvent.id && x.status !== 'completed')) {
      try {
        const r = await get(`/series/${s.id}/teams`);
        const shorts = (r.teams || []).map((t) => t.shortName).filter(Boolean);
        if (shorts.length) lineups[s.id] = shorts;
      } catch {}
    }
  }

  // 국제전별 조별 리그 누적: 이전 결과 보기용. 끝나고 이틀이 지난 대회는 보관된 값을 그대로 쓴다
  const poGroups = { ...(prev.poGroups || {}) };
  for (const e of season.tournaments.flatMap((t) => t.events).filter((x) => /playoffs|champs/.test(x.slug) && x.phases.length && new Date(x.startDate) <= new Date())) {
    if (poGroups[e.id]?.length && new Date(e.endDate) < Date.now() - 2 * 864e5) continue;
    try {
      const gs = await get(`/stats/phases/${e.phases[0].id}/standings`);
      const rows = (gs.standings || []).map((s) => [s.position, s.shortName, s.name, s.teamId, s.group, s.points, s.kills, s.region]);
      if (rows.length) poGroups[e.id] = rows;
    } catch {}
  }

  // LCQ (지역별 40팀): 공식 출전 명단과 시리즈별 출전 팀(승자 1R 로비 배정). 명단이 나오기 전에는 비어 있다
  const lcq = {};
  const lcqLogos = [];
  const nm = (t) => String(t.name || t.teamName || t.displayName || '').trim();
  const lcqProbe = {}; // 임시: 응답 필드 확인용
  for (const e of season.tournaments.flatMap((t) => t.events).filter((x) => /^last-chance-qualifier/.test(x.slug))) {
    const out = { teams: [], lineups: { ...(prev.lcq?.[e.id]?.lineups || {}) } };
    const seen = new Set();
    const add = (t, seed = null) => {
      if (!t.teamId || seen.has(t.teamId)) return;
      seen.add(t.teamId);
      out.teams.push([t.teamId, String(t.shortName || '').trim(), nm(t), seed]);
      lcqLogos.push([t.teamId, t.logoLight, t.logoDark]);
    };
    for (const ph of e.phases) {
      try { const pt = await get(`/phases/${ph.id}/teams`); lcqProbe[ph.id] = [Object.keys(pt).join(','), (pt.teams || []).length, Object.keys(pt.teams?.[0] || {}).join(',')]; for (const t of pt.teams || []) add(t, t.seed ?? t.seeding ?? null); } catch (er) { lcqProbe[ph.id] = String(er.message).slice(0, 80); }
    }
    if (new Date(e.startDate) - Date.now() < 21 * 864e5) {
      for (const s of allSeries.filter((x) => x.event?.id === e.id && x.status !== 'completed')) {
        try {
          const sr = await get(`/series/${s.id}/teams`);
          if (!lcqProbe.series) lcqProbe.series = [Object.keys(sr).join(','), (sr.teams || []).length, Object.keys(sr.teams?.[0] || {}).join(',')];
          const ts = (sr.teams || []).filter((t) => t.shortName);
          if (ts.length) { out.lineups[s.id] = ts.map((t) => t.shortName.trim()); for (const t of ts) add(t); }
        } catch {}
      }
    }
    lcq[e.id] = out;
  }

  // 공식 파트너 워치 파티 (경기가 있을 때만 /streams/live에 나오므로 이전 목록과 합쳐 유지)
  let partnerStreams = prev.partnerStreams || [];
  try {
    const live = await get('/streams/live');
    const found = (live.series || []).flatMap((s) => (s.streams || []).filter((x) => x.streamType === 'partner').map((x) => [x.name, x.streamProvider, x.channelName]));
    const seen = new Set(partnerStreams.map((p) => p[2].toLowerCase()));
    for (const p of found) if (!seen.has(p[2].toLowerCase())) { partnerStreams.push(p); seen.add(p[2].toLowerCase()); }
  } catch {}

  // 로고 보충: 프로리그 로스터에 로고가 없는 팀은 CP 순위표·대회 순위표·팀 버전 기록에서 찾는다
  const addLogo = (id, l, d) => { if (!id || (!l && !d)) return; const cur = logos[id] || [null, null]; logos[id] = [cur[0] || l || null, cur[1] || d || null]; };
  for (const t of cpRes.standings || []) addLogo(t.teamId, t.logoLight, t.logoDark);
  for (const st of logoSources) for (const r of st) addLogo(r.teamId, r.logoLight, r.logoDark);
  for (const [id, l, d] of lcqLogos) addLogo(id, l, d);
  const needIds = new Set([...cp.map((r) => r[1]), ...Object.values(pl).flat().map((r) => r[3])].filter((id) => !logos[id]));
  for (const id of needIds) {
    try { const tv = await get(`/teams/${id}`); for (const v of tv.versions || []) addLogo(id, v.logoLight, v.logoDark); } catch {}
  }

  const next = { seasonId: season.id, events, cp, cpEvents, poRosters, pl, rosters, logos, lineups, series, poGroup, poGroups, lcq, lcqProbe, krStreams, partnerStreams,
    officialStreams: prev.officialStreams || [['Main Broadcast', 'twitch', 'playapex']] };
  // 내용이 같으면 파일을 건드리지 않는다 (5분 주기 빌드에서 불필요한 커밋·배포 방지)
  const { fetchedAt: _f, _schema: _s, ...prevBody } = prev;
  if (JSON.stringify(prevBody) === JSON.stringify(next)) { console.log('[algs] 변경 없음'); return; }
  writeJson('raw/algs/snapshot.json', { fetchedAt: new Date().toISOString(), ...next });
  console.log(`[algs] events ${events.length}, cp ${cp.length}, pl ${Object.keys(pl).length}, series ${series.length}, poGroup ${poGroup.length}`);
}

main().catch((e) => {
  console.error('[algs] 실패:', e.message);
  console.error('[algs] 이전 스냅샷을 그대로 사용합니다.');
  process.exitCode = 0; // 빌드는 계속
});
