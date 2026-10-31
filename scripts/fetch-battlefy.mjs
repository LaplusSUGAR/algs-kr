// Battlefy: Challenger Circuit 순위와 대회별 통과 팀 (아마추어 대회 전용 출처)
// 확인한 엔드포인트 (2026-11-01, battlefy.com/apex-legends-global-series-year-6 페이지가 호출)
//   {BASE}/team-leaderboards/{seasonId}?region=asia-pacific-north&offset=0&limit=15
//   {BASE}/qualified-teams/{seasonId}
import { fetchJson, writeJson } from './lib.mjs';

const BASE = process.env.BATTLEFY_ALGS || 'https://d3q4fnxloga6gz.cloudfront.net/algs/algs-season-6';
const SEASON_ID = process.env.BATTLEFY_SEASON_ID || '192';
const REGIONS = ['asia-pacific-north', 'asia-pacific-south', 'europe-middle-east-and-africa', 'americas'];

async function main() {
  const leaderboards = {};
  for (const region of REGIONS) {
    const r = await fetchJson(`${BASE}/team-leaderboards/${SEASON_ID}?region=${region}&offset=0&limit=30`);
    leaderboards[region] = (r.data || []).map((t) => [t.rank, t.name, t.score, (t.breakdown || []).map((p) => p.name)]);
  }
  const qualified = (await fetchJson(`${BASE}/qualified-teams/${SEASON_ID}`))
    .map((q) => [q.name, q.placement, q.event?.name, q.event?.region, q.event?.tournamentStartTime]);
  writeJson('raw/battlefy/cc.json', { fetchedAt: new Date().toISOString(), leaderboards, qualified });
  console.log(`[battlefy] leaderboards ${REGIONS.length}, qualified ${qualified.length}`);
}

main().catch((e) => {
  console.error('[battlefy] 실패:', e.message, '→ 이전 raw/battlefy 파일 유지');
  process.exitCode = 0;
});
