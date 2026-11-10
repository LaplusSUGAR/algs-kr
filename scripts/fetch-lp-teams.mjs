// Liquipedia 팀 정보 원본 수집: 팀 이름 · 선수 명단 · 로고 아이콘.
// 지역별 프로리그 Split 2 페이지와 챌린저 서킷 종합 순위 페이지의 '그려진 HTML'(action=parse)을 받는다.
// 위키 원문에는 팀 로고가 없고(팀 틀이 그림) 그려진 표에만 팀 · 선수 · 로고가 한 줄에 함께 있다.
// 이용 규칙: parse 요청은 30초 간격. 페이지마다 7일에 한 번만 다시 받는다.
// 결과(CC-BY-SA, 출처 표기): raw/lp/teams-src.json  { pages: { key: { title, at, teams: [{ name, page, players, icon: [어두운 배경용, 밝은 배경용] }] } } }
//   HTML은 저장하지 않고 뽑은 값만 둔다 (뽑는 방법은 lp-teams-parse.mjs)
import { UA, readJson, writeJson, sleep } from './lib.mjs';
import { plCards, ccRows, original } from './lp-teams-parse.mjs';
import { seasonCtx, REGION_PAGE } from './season.mjs';

const API = 'https://liquipedia.net/apexlegends/api.php';
// 메인 시즌의 가장 최근 Split 페이지 (Year 6 Split 2 = Apex_Legends_Global_Series/2026/Split_2)
const CTX = seasonCtx();
const BASE = `${CTX?.base}/Split_${CTX?.split}`;
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
  if (!CTX) { console.log('[lp-teams] 공식 스냅샷이 없어 건너뜀'); return; }
  let cur = readJson(OUT, { pages: {} });
  if (cur.season && cur.season !== CTX.slug) cur = { pages: {} }; // 지난 시즌 표는 쓰지 않는다
  cur.season = CTX.slug;
  // 예전 형식(HTML 통째)이면 뽑은 값으로 바꾼다
  let migrated = false;
  for (const [k, pg] of Object.entries(cur.pages)) if (pg.html) { pg.teams = k.startsWith('pl:') ? plCards(pg.html) : ccRows(pg.html); delete pg.html; migrated = true; }
  if (migrated) writeJson(OUT, cur);
  const force = process.argv.includes('--force') || !Object.keys(cur.pages).length; // 처음에는 전부
  const age = (k) => (cur.pages[k] && cur.pages[k].title === PAGES[k] ? Date.now() - Date.parse(cur.pages[k].at) : Infinity);
  const todo = Object.keys(PAGES).filter((k) => force || age(k) > WEEK).sort((a, b) => age(b) - age(a)).slice(0, force ? 99 : MAX_PER_RUN);
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
      const teams = k.startsWith('pl:') ? plCards(html) : ccRows(html);
      if (!teams.length) { console.error(`[lp-teams] ${k} 팀을 찾지 못함 (페이지 형식이 바뀌었을 수 있음) → 이전 값 유지`); continue; }
      cur.pages[k] = { title: PAGES[k], at: new Date().toISOString(), teams };
      n++;
      console.log(`[lp-teams] ${k} 팀 ${teams.length} · 로고 ${teams.filter((t) => t.icon[0] || t.icon[1]).length}`);
    } catch (e) { console.error(`[lp-teams] ${k} 실패`, e.message); }
  }
  if (n) writeJson(OUT, cur);
  if (!todo.length) console.log('[lp-teams] 표는 모두 최신 (7일 안)');
  await infoboxLogos(cur);
}

// 표의 로고가 Liquipedia 기본 그림인 팀: 팀 페이지 정보 상자(Infobox team)의 image·imagedark를 본다 (팀 페이지가 있을 때만, 7일에 1회)
// 원문(action=query) 한 번 + 그림 주소(imageinfo) 한 번, 50개씩 묶어서. 요청 사이 2초
async function infoboxLogos(cur) {
  cur.extra ||= {};
  const want = new Set();
  for (const [k, pg] of Object.entries(cur.pages)) (pg.teams || []).forEach((t, i) => {
    if (t.page && !t.icon[0] && !t.icon[1] && (k.startsWith('pl:') || i < 40)) want.add(t.page);
  });
  const todo = [...want].filter((p) => !cur.extra[p] || Date.now() - Date.parse(cur.extra[p].at) > WEEK).slice(0, 100);
  if (!todo.length) return;
  const api = async (params) => {
    await sleep(2000);
    const res = await fetch(`${API}?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`, { headers: { 'User-Agent': UA, 'Accept-Encoding': 'gzip' } });
    if (!res.ok) throw new Error(`${res.status}`);
    return res.json();
  };
  const files = {};
  for (let i = 0; i < todo.length; i += 50) {
    const part = todo.slice(i, i + 50);
    const j = await api({ action: 'query', prop: 'revisions', rvprop: 'content', rvslots: 'main', redirects: '1', titles: part.join('|') });
    const back = {};
    for (const r of j.query?.redirects || []) back[r.to] = r.from;
    for (const n of j.query?.normalized || []) back[n.to] = back[n.to] || n.from;
    for (const pg of j.query?.pages || []) {
      const title = back[pg.title] || pg.title;
      const page = part.find((p) => p.replace(/_/g, ' ') === String(title).replace(/_/g, ' ')) || title;
      const text = pg.revisions?.[0]?.slots?.main?.content || '';
      const box = /\{\{Infobox team([\s\S]*?)\n\}\}/.exec(text)?.[1] || '';
      const val = (k) => new RegExp(`\\|\\s*${k}\\s*=\\s*([^|\\n]+)`).exec(box)?.[1]?.trim() || null;
      files[page] = { light: val('image'), dark: val('imagedark') || val('imagedarkmode') };
    }
  }
  const names = [...new Set(Object.values(files).flatMap((f) => [f.light, f.dark]).filter(Boolean))];
  const url = {};
  for (let i = 0; i < names.length; i += 50) {
    const j = await api({ action: 'query', prop: 'imageinfo', iiprop: 'url', titles: names.slice(i, i + 50).map((x) => `File:${x}`).join('|') });
    const back = {};
    for (const n of j.query?.normalized || []) back[n.to] = n.from;
    for (const pg of j.query?.pages || []) { const u = pg.imageinfo?.[0]?.url; if (u) url[(back[pg.title] || pg.title).replace(/^File:/, '')] = original(u); }
  }
  let found = 0;
  for (const p of todo) {
    const f = files[p] || {};
    const light = (f.light && url[f.light]) || null, dark = (f.dark && url[f.dark]) || null;
    cur.extra[p] = { at: new Date().toISOString(), icon: [dark || light, light || dark] };
    if (light || dark) found++;
  }
  writeJson(OUT, cur);
  console.log(`[lp-teams] 팀 페이지 정보 상자 확인 ${todo.length}팀 · 로고 ${found}팀`);
}

main().catch((e) => { console.error('[lp-teams] 실패:', e.message); process.exitCode = 0; });
