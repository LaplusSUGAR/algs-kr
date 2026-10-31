// ALGS 공식 API(prod-api.algstools.com)에서 필요한 데이터를 받아 raw/algs/snapshot.json으로 저장한다.
// 공개 문서가 없는 내부 API다. 응답 형식이 바뀌면 이 스크립트는 실패하고, 빌드는 이전 스냅샷이나 Liquipedia 값으로 진행한다.
//
// snapshot.json 형식 (배열 = compact)
//   events : [eventId, slug, tournamentName, region, startISO, endISO, phases[[phaseId, name, method, qualificationThreshold]]]
//   cp     : [rank, teamId, teamName, short, region, totalCP, players[[name, cp]]]           (팀 CP = 상위 3인 합, 공식 계산값)
//   pl     : { "s1:apac-north": [[pos, short, name, teamId, cpPerPlayer, qualified, rsPoints, group, kills, seriesPlayed, krPlayers]] }
//   rosters: { teamId: "name|country|role;..." }  role: p 선수, c 주장, k 코치, ? 불명
//   series : [seriesId, eventId, phaseName, seriesName, status, startsAtISO, regionName, isMatchPoint, matchCount, results[[pos, short, pts, kills]] | null]
//   poGroup: [pos, short, name, teamId, group, pts, kills, region]   (진행 중/최근 Playoffs 조별 리그 누적)
//   krStreams: [short, player, role, provider, channel]
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
      if (kr || region === 'apac-north') rosters[s.teamId] = players.map((x) => `${x.name.trim()}|${x.country || ''}|${roleCode(x.role)}`).join(';');
      return [s.position, q.shortName || '', s.name, s.teamId, s.points, s.qualified ? 1 : 0, q.points ?? null, q.group || '', q.kills ?? null, q.matchSeriesPlayed ?? null, kr];
    });
  }

  // 챔피언십 포인트 (공식 페이지와 같은 파라미터: 현재 Split Pro League 이벤트, 최소 12경기)
  const lastPl = plEvents.filter(({ e }) => e.slug.startsWith('split-2-')).map(({ e }) => e.id);
  const cpRes = await get(`/seasons/${season.id}/standings/teams?eventIds=${encodeURIComponent(lastPl.join(','))}&minAmountOfMatches=12`);
  const cp = cpRes.standings.map((s) => [s.rank, s.teamId, s.teamName, s.shortName, s.region, s.totalPoints, s.players.map((p) => [p.name.trim(), p.points])]);

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
      const st = await get(`/stats/series/${s.id}`);
      const intl = !(s.event?.slug || '').includes('pro-league');
      res = (st.teams || []).filter((t) => intl || t.position <= 3 || krShorts.has(t.shortName)).map((t) => [t.position, t.shortName, t.points, t.kills]);
    }
    series.push([s.id, s.event?.id, s.phase?.name, s.name, s.status, s.startsAt, s.region?.name || '', s.isMatchPointFormat ? 1 : 0, (s.matches || []).length, res]);
  }

  // 가장 최근 국제전(Playoffs/Championship)의 첫 단계 누적 순위
  const intlEvent = season.tournaments.flatMap((t) => t.events).filter((e) => /playoffs|champs/.test(e.slug) && e.phases.length)
    .sort((a, b) => b.startDate.localeCompare(a.startDate)).find((e) => new Date(e.startDate) <= new Date());
  let poGroup = [];
  if (intlEvent) {
    const gs = await get(`/stats/phases/${intlEvent.phases[0].id}/standings`);
    poGroup = (gs.standings || []).map((s) => [s.position, s.shortName, s.name, s.teamId, s.group, s.points, s.kills, s.region]);
  }

  // 한국 선수 방송 채널 (최근 APAC North Pro League 단계)
  const apn = plEvents.find(({ e }) => e.slug === 'split-2-pro-league-apac-north') || plEvents.at(-1);
  const teams = (await get(`/phases/${apn.e.phases[0].id}/teams`)).teams || [];
  const krStreams = teams.flatMap((tm) => tm.players.filter((p) => p.country === KR).map((p) => [tm.shortName, p.name.trim(), p.role, p.streamProvider, p.channelName]));

  const prev = readJson('raw/algs/snapshot.json', {});
  writeJson('raw/algs/snapshot.json', {
    fetchedAt: new Date().toISOString(), seasonId: season.id, events, cp, pl, rosters, series, poGroup, krStreams,
    officialStreams: prev.officialStreams || [['Main Broadcast', 'twitch', 'playapex']],
  });
  console.log(`[algs] events ${events.length}, cp ${cp.length}, pl ${Object.keys(pl).length}, series ${series.length}, poGroup ${poGroup.length}`);
}

main().catch((e) => {
  console.error('[algs] 실패:', e.message);
  console.error('[algs] 이전 스냅샷을 그대로 사용합니다.');
  process.exitCode = 0; // 빌드는 계속
});
