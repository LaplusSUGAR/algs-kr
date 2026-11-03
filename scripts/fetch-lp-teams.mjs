// Liquipedia 팀 정보 원본 수집: 팀 이름 · 선수 명단 · 로고 아이콘.
// 지역별 프로리그 Split 2 페이지와 챌린저 서킷 종합 순위 페이지의 '그려진 HTML'(action=parse)을 받는다.
// 위키 원문에는 팀 로고가 없고(팀 틀이 그림) 그려진 표에만 팀 · 선수 · 로고가 한 줄에 함께 있다.
// 이용 규칙: parse 요청은 30초 간격. 페이지마다 7일에 한 번만 다시 받는다.
// 결과(CC-BY-SA, 출처 표기): raw/lp/teams-src.json  { pages: { key: { title, at, html } } }
import { UA, readJson, writeJson, sleep } from './lib.mjs';

const API = 'https://liquipedia.net/apexlegends/api.php';
const BASE = 'Apex_Legends_Global_Series/2026/Split_2';
const REGION_PAGE = { 'apac-n': 'APAC_North', 'apac-s': 'APAC_South', emea: 'EMEA', americas: 'Americas' };
export const PAGES = Object.fromEntries(Object.entries(REGION_PAGE).flatMap(([r, p]) => [
  [`pl:${r}`, `${BASE}/Pro_League/${p}`],
  [`cc:${r}`, `${BASE}/Challenger_Circuits/${p}`],
]));
const OUT = 'raw/lp/teams-src.json';
const WEEK = 7 * 864e5;
const MAX_PER_RUN = Number(process.env.LP_TEAMS_MAX || 2); // 한 번 빌드에서 받을 페이지 수 (30초 간격이라 빌드 시간을 늘리지 않게)

// 그려진 HTML에서 표시용 군더더기(스크립트·꾸밈 속성)를 덜어 낸다. 팀·선수·이미지 주소는 그대로 둔다
const slim = (html) => html
  .replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<!--[\s\S]*?-->/g, '')
  .replace(/\s(style|srcset|decoding|loading|data-[a-z-]+)="[^"]*"/g, '')
  .replace(/\n\s*\n/g, '\n');

async function main() {
  const cur = readJson(OUT, { pages: {} });
  const force = process.argv.includes('--force') || !Object.keys(cur.pages).length; // 처음에는 전부
  const age = (k) => (cur.pages[k] && cur.pages[k].title === PAGES[k] ? Date.now() - Date.parse(cur.pages[k].at) : Infinity);
  const todo = Object.keys(PAGES).filter((k) => force || age(k) > WEEK).sort((a, b) => age(b) - age(a)).slice(0, force ? 99 : MAX_PER_RUN);
  if (!todo.length) { console.log('[lp-teams] 모두 최신 (7일 안)'); return; }
  let n = 0;
  for (const [i, k] of todo.entries()) {
    if (i) await sleep(31000);
    const qs = new URLSearchParams({ action: 'parse', page: PAGES[k], prop: 'text', format: 'json', formatversion: '2', disablelimitreport: '1', disableeditsection: '1', redirects: '1' });
    try {
      const res = await fetch(`${API}?${qs}`, { headers: { 'User-Agent': UA, 'Accept-Encoding': 'gzip' } });
      if (!res.ok) { console.error(`[lp-teams] ${k} ${res.status}`); continue; }
      const j = await res.json();
      if (j.error) { console.error(`[lp-teams] ${k} ${j.error.code}: ${j.error.info}`); continue; }
      const html = slim(j.parse?.text || '');
      cur.pages[k] = { title: PAGES[k], at: new Date().toISOString(), html };
      n++;
      console.log(`[lp-teams] ${k} ${html.length}자`);
    } catch (e) { console.error(`[lp-teams] ${k} 실패`, e.message); }
  }
  if (n) writeJson(OUT, cur);
}

main().catch((e) => { console.error('[lp-teams] 실패:', e.message); process.exitCode = 0; });
