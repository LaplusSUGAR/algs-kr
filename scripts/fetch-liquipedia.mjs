// Liquipedia (1순위 출처) 수집기.
// LPDB API v3를 사용한다. API 키가 필요하다: https://liquipedia.net/api 에서 신청 후 LIQUIPEDIA_API_KEY 환경 변수로 넣는다.
// 키가 없으면 아무것도 하지 않고 끝나며, 빌드는 공식 API 값으로 진행한다.
//
// 가져오는 것
//   placement : 대회별 최종 순위 (Pro League 지역별, Playoffs)  → raw/lp/placements.json
//   match2    : 시리즈(매치) 단위 결과                            → raw/lp/matches.json
//
// 주의: 엔드포인트·필드 이름과 대회 페이지 이름은 Liquipedia API 문서로 반드시 확인한다. (이 스크립트는 연결 확인 전 상태)
// 이용 규칙: 식별 가능한 User-Agent, gzip, 요청 간격 준수. 결과는 CC-BY-SA로 출처 표기.
import { fetchJson, writeJson, sleep } from './lib.mjs';

const KEY = process.env.LIQUIPEDIA_API_KEY;
const BASE = 'https://api.liquipedia.net/api/v3';
const WIKI = 'apexlegends';

// 수집 대상 대회 페이지 (Liquipedia 페이지 이름). 시즌이 바뀌면 여기만 고친다.
const PAGES = [
  'Apex_Legends_Global_Series/2026/Split_1/Pro_League/APAC_North',
  'Apex_Legends_Global_Series/2026/Split_2/Pro_League/APAC_North',
  'Apex_Legends_Global_Series/2026/Split_1/Pro_League/APAC_South',
  'Apex_Legends_Global_Series/2026/Split_2/Pro_League/APAC_South',
  'Apex_Legends_Global_Series/2026/Split_1/Pro_League/EMEA',
  'Apex_Legends_Global_Series/2026/Split_2/Pro_League/EMEA',
  'Apex_Legends_Global_Series/2026/Split_1/Pro_League/Americas',
  'Apex_Legends_Global_Series/2026/Split_2/Pro_League/Americas',
  'Apex_Legends_Global_Series/2026/Split_1/Playoffs',
  'Apex_Legends_Global_Series/2026/Split_2/Playoffs',
];

async function lpdb(table, params) {
  const qs = new URLSearchParams({ wiki: WIKI, limit: '500', ...params });
  const res = await fetchJson(`${BASE}/${table}?${qs}`, { headers: { Authorization: `Apikey ${KEY}`, 'Accept-Encoding': 'gzip' }, delayMs: 2100 });
  return res.result || [];
}

async function main() {
  if (!KEY) {
    console.log('[lp] LIQUIPEDIA_API_KEY 없음 → 건너뜀 (공식 API 값으로 빌드)');
    return;
  }
  const placements = {};
  const matches = {};
  for (const page of PAGES) {
    const cond = `[[parent::${page}]] OR [[pagename::${page}]]`;
    placements[page] = (await lpdb('placement', { conditions: cond, query: 'placement,opponentname,opponenttemplate,prizemoney,extradata,date' }))
      .map((r) => ({ place: Number(String(r.placement).split('-')[0]) || null, name: r.opponentname, template: r.opponenttemplate, prize: r.prizemoney, extra: r.extradata, date: r.date }));
    matches[page] = (await lpdb('match2', { conditions: cond, query: 'match2id,date,finished,match2opponents,match2games,extradata' }))
      .map((m) => ({ id: m.match2id, date: m.date, finished: m.finished, opponents: (m.match2opponents || []).map((o) => ({ name: o.name, place: o.placement, score: o.score })), games: (m.match2games || []).length }));
    await sleep(500);
  }
  writeJson('raw/lp/placements.json', { fetchedAt: new Date().toISOString(), placements });
  writeJson('raw/lp/matches.json', { fetchedAt: new Date().toISOString(), matches });
  console.log(`[lp] pages ${PAGES.length} 저장`);
}

main().catch((e) => {
  console.error('[lp] 실패:', e.message, '→ 이전 raw/lp 파일 유지');
  process.exitCode = 0;
});
