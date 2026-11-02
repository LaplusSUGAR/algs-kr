// LCQ 지역별 출전 팀을 Liquipedia 대회 페이지에서 받는다 (공식 API가 명단을 공개하기 전까지의 출처).
// API 키가 필요 없는 MediaWiki API(action=query)로 네 지역 페이지의 위키 원문을 한 번에 받는다.
// 이용 규칙: 식별 가능한 User-Agent, 요청 간격 지키기. 5분 주기 빌드 중 매시 첫 회(LCQ 주간에는 15분마다)만 받는다.
// 결과(CC-BY-SA, 출처 표기): raw/lp/lcq.json
//   { fetchedAt, pages: { region: { title, rev, text } } }
import { UA, readJson, writeJson } from './lib.mjs';

const API = 'https://liquipedia.net/apexlegends/api.php';
const PAGES = {
  'apac-n': 'Apex_Legends_Global_Series/2026/Championship/Last_Chance_Qualifier/APAC_North',
  'apac-s': 'Apex_Legends_Global_Series/2026/Championship/Last_Chance_Qualifier/APAC_South',
  emea: 'Apex_Legends_Global_Series/2026/Championship/Last_Chance_Qualifier/EMEA',
  americas: 'Apex_Legends_Global_Series/2026/Championship/Last_Chance_Qualifier/Americas',
};
const LCQ_START = new Date('2026-11-20T00:00:00Z');
const LCQ_END = new Date('2026-11-23T00:00:00Z');

async function main() {
  const prev = readJson('raw/lp/lcq.json', null);
  const near = Date.now() > LCQ_START - 3 * 864e5 && Date.now() < LCQ_END;
  const m = new Date().getUTCMinutes();
  if (prev && !process.argv.includes('--force') && (near ? m % 15 : m) >= 5) { console.log('[lp-lcq] 이번 회차는 건너뜀'); return; }
  if (Date.now() > LCQ_END.getTime() + 7 * 864e5) { console.log('[lp-lcq] LCQ 종료 후 → 건너뜀'); return; }
  const qs = new URLSearchParams({ action: 'query', prop: 'revisions', rvprop: 'content|ids|timestamp', rvslots: 'main', format: 'json', formatversion: '2', titles: Object.values(PAGES).join('|') });
  const res = await fetch(`${API}?${qs}`, { headers: { 'User-Agent': UA, 'Accept-Encoding': 'gzip' } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const j = await res.json();
  const norm = Object.fromEntries((j.query?.normalized || []).map((n) => [n.to, n.from]));
  const pages = {};
  for (const p of j.query?.pages || []) {
    const title = norm[p.title] || p.title;
    const region = Object.entries(PAGES).find(([, t]) => t.replace(/_/g, ' ') === title.replace(/_/g, ' '))?.[0];
    const rev = p.revisions?.[0];
    if (region && rev) pages[region] = { title: p.title, rev: rev.revid, at: rev.timestamp, text: rev.slots?.main?.content || '' };
  }
  const same = prev && JSON.stringify(Object.fromEntries(Object.entries(prev.pages || {}).map(([k, v]) => [k, v.rev]))) === JSON.stringify(Object.fromEntries(Object.entries(pages).map(([k, v]) => [k, v.rev])));
  // 내용이 그대로면 받은 시각만 기억하고(파일은 그대로) 넘어간다 → 불필요한 커밋 방지
  if (same) { console.log('[lp-lcq] 변경 없음'); return; }
  writeJson('raw/lp/lcq.json', { fetchedAt: new Date().toISOString(), pages });
  console.log(`[lp-lcq] ${Object.keys(pages).length}개 지역 페이지 저장`);
}

main().catch((e) => { console.error('[lp-lcq] 실패:', e.message); process.exitCode = 0; });
