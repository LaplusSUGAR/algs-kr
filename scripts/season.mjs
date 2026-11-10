// 시즌 고르기 · 시즌에 묶인 값 · 지난 시즌 보관
//
// 사이트는 한 번에 한 시즌(메인 시즌)을 보여 준다. 메인 시즌은 공식 API의 시즌 목록에서 스스로 고른다.
//   - 프로리그 일정이 있는 시즌 가운데, 첫 프로리그가 시작하기 LEAD_DAYS일 전을 지난 가장 늦은 시즌이 메인이다.
//   - 새 시즌이 목록에 보여도 그날이 오기 전에는 지난 시즌이 메인으로 남고(챔피언십 최종 결과 화면), 새 시즌은 '다음 시즌' 예고로만 나간다.
//   - 메인 시즌이 바뀌는 순간 지난 시즌의 원본·설정·마지막 화면 데이터를 archive/<시즌>/ 과 site/data/seasons/<시즌>.js 에 얼려 둔다.
// 강제로 고르려면 환경 변수 ALGS_SEASON=year-6 (저장소 Actions 변수로도 가능).
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, readJson, writeJson } from './lib.mjs';

export const LEAD_DAYS = Number(process.env.ALGS_SEASON_LEAD_DAYS) || 14;
export const REGIONS = ['apac-n', 'apac-s', 'emea', 'americas'];
// 'year-6' 꼴만 리그 시즌 번호로 읽는다 (공식 목록에는 'enc-2026' 같은 별도 대회 묶음도 시즌으로 들어 있다)
export const yearNo = (slug) => { const m = /^year-(\d+)$/.exec(String(slug || '')); return m ? Number(m[1]) : null; };
// Liquipedia는 시즌을 시작 연도로 부른다 (Year 6 = 2026, 시즌 페이지는 ALGS/2026-27)
export const lpYear = (slug) => (yearNo(slug) ? 2020 + yearNo(slug) : null);
export const lpSeasonPage = (slug) => { const y = lpYear(slug); return y ? `ALGS/${y}-${String((y + 1) % 100).padStart(2, '0')}` : 'ALGS'; };
export const seasonName = (slug, apiName) => (yearNo(slug) ? `ALGS Year ${yearNo(slug)}` : apiName || slug || 'ALGS');

const eventsOf = (s) => (s.tournaments || []).flatMap((t) => (t.events || []).map((e) => ({ ...e, tournament: t.publicNameOverride || t.name })));
const minIso = (xs) => xs.filter(Boolean).sort()[0] || null;
const maxIso = (xs) => xs.filter(Boolean).sort().at(-1) || null;
export function seasonInfo(s) {
  const evs = eventsOf(s);
  const pl = evs.filter((e) => /^split-\d-pro-league-/.test(e.slug || ''));
  return { s, slug: s.slug, id: s.id, name: seasonName(s.slug, s.name), first: minIso(evs.map((e) => e.startDate)), last: maxIso(evs.map((e) => e.endDate)), plStart: minIso(pl.map((e) => e.startDate)), events: evs.length };
}

// 메인 시즌과 다음 시즌. prevSlug: 지난번에 메인이던 시즌 (뒤로 돌아가지 않게 하는 기준)
export function pickSeason(seasons, { now = Date.now(), force = null, prevSlug = null, leadDays = LEAD_DAYS } = {}) {
  const key = (x) => x.plStart || x.first || '';
  // 리그 시즌만 본다: 프로리그 일정이 있거나 slug가 year-N인 시즌. 프로리그가 없는 별도 대회 묶음(예: enc-2026 국가 대항전 예선)은 메인·다음 시즌 후보가 아니다
  const league = (x) => !!x.plStart || yearNo(x.slug) != null;
  const list = (seasons || []).map(seasonInfo).filter((x) => x.events && (league(x) || x.slug === force || x.slug === prevSlug)).sort((a, b) => key(a).localeCompare(key(b)));
  if (!list.length) return { cur: null, next: null, list, why: '시즌 목록이 비어 있음' };
  let cur = null, why = '';
  if (force) { cur = list.find((x) => x.slug === force) || null; why = cur ? `ALGS_SEASON=${force}` : ''; }
  if (!cur) {
    const open = list.filter((x) => x.plStart && now >= Date.parse(x.plStart) - leadDays * 864e5);
    const prev = list.find((x) => x.slug === prevSlug);
    cur = open.at(-1) || prev || list.at(-1);
    // 지난번 메인보다 앞선 시즌으로는 돌아가지 않는다 (목록이 잠깐 비거나 순서가 바뀌어도)
    if (prev && key(cur) < key(prev)) cur = prev;
    why = cur === open.at(-1) ? `프로리그 시작 ${leadDays}일 전을 지난 가장 늦은 시즌` : '프로리그가 열린 시즌이 없어 이전 메인 시즌 유지';
  }
  const next = list.find((x) => key(x) > key(cur)) || null;
  return { cur, next, list, why };
}

// 스냅샷에 넣는 '다음 시즌' 예고: 이름과 대회 일정만
export const nextTeaser = (info) => (info ? { slug: info.slug, name: info.name,
  events: eventsOf(info.s).map((e) => [e.id, e.slug, e.tournament, e.region?.slug || null, e.startDate, e.endDate]) } : null);

// 공식 대회 날짜는 태평양 시간 자정 기준으로 들어 있다 (11-20T08:00Z = 11월 20일). 일정표에는 그 날짜를 쓴다
export const ptDate = (iso) => (iso ? new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'America/Los_Angeles' }) : '');
// 대회 슬러그 → 일정표 칸: [key, 순서용 종류]
export function timelineKey(slug) {
  let m;
  if ((m = /^split-(\d)-pro-league-/.exec(slug))) return `s${m[1]}pl`;
  if ((m = /^split-(\d)-playoffs/.exec(slug))) return `s${m[1]}po`;
  if (/^last-chance-qualifier/.test(slug)) return 'lcq';
  if (/^champs/.test(slug)) return 'champs';
  return null; // 프로리그 예선 등은 일정표에 넣지 않는다
}
// 공식 대회 목록(스냅샷 events 행: [id, slug, 대회 이름, 지역, 시작, 끝])에서 시즌 일정표를 만든다. cfg: 설정 파일의 같은 key 줄(장소·링크·이름)이 덮어쓴다
export function buildTimeline(events, seasonSlug, cfg = []) {
  const rows = new Map();
  for (const [, slug, name, region, start, end] of events || []) {
    const key = timelineKey(slug || '');
    if (!key) continue;
    const r = rows.get(key) || { key, name, start: ptDate(start), end: ptDate(end), where: '', url: '', n: 0, slug };
    r.n++;
    if (ptDate(start) < r.start) r.start = ptDate(start);
    if (ptDate(end) > r.end) r.end = ptDate(end);
    if (region === 'apac-north') r.slug = slug; // 공식 페이지 링크는 APAC North 것을 대표로
    rows.set(key, r);
  }
  for (const r of rows.values()) {
    r.where = /pl$/.test(r.key) ? `온라인 · ${r.n}개 지역` : r.key === 'lcq' ? `온라인 · ${r.n}개 지역` : '';
    r.url = r.key === 'lcq' || r.key === 'champs' ? `https://liquipedia.net/apexlegends/${lpSeasonPage(seasonSlug)}` : `https://algs.ea.com/en/${seasonSlug}/${r.slug}`;
    delete r.n; delete r.slug;
  }
  const out = [...rows.values()];
  for (const c of cfg || []) {
    const r = out.find((x) => x.key === c.key);
    if (r) Object.assign(r, Object.fromEntries(Object.entries(c).filter(([, v]) => v !== '' && v != null)));
    else out.push({ ...c }); // 공식 목록에 없는 일정(Online Open 등)은 설정 파일 줄을 그대로
  }
  return out.sort((a, b) => a.start.localeCompare(b.start));
}

// Liquipedia 수집기가 쓰는 시즌 값: 스냅샷에서 읽는다 (스냅샷이 아직 없으면 null)
export function seasonCtx() {
  const snap = readJson('raw/algs/snapshot.json', null);
  if (!snap) return null;
  const slug = snap.seasonSlug || 'year-6';
  // slug가 year-N 꼴이 아니면 첫 대회가 열린 해를 쓴다
  const y = lpYear(slug) || Number(String(minIso((snap.events || []).map((e) => e[4])) || '').slice(0, 4)) || new Date().getFullYear();
  const split = Math.max(0, ...Object.keys(snap.pl || {}).map((k) => Number(k.slice(1, 2)) || 0)) || 1;
  const lcqEv = (snap.events || []).filter((e) => /^last-chance-qualifier/.test(e[1]));
  return { slug, y, split, base: `Apex_Legends_Global_Series/${y}`,
    lcq: lcqEv.length ? { start: minIso(lcqEv.map((e) => e[4])), end: maxIso(lcqEv.map((e) => e[5])) } : null };
}
export const REGION_PAGE = { 'apac-n': 'APAC_North', 'apac-s': 'APAC_South', emea: 'EMEA', americas: 'Americas' };

// ---------- 지난 시즌 보관 ----------
// 메인 시즌이 바뀔 때 한 번 부른다. 지난 시즌의 원본·설정·기록을 archive/<시즌>/ 에 복사하고,
// 마지막으로 만든 화면 데이터를 site/data/seasons/<시즌>.js 로 얼린다(주소에 ?y=<시즌>을 붙이면 그 시즌 화면).
// 그리고 시즌에 묶인 작업 파일을 비워 새 시즌이 빈 상태에서 시작하게 한다.
const KEEP = ['raw/algs/snapshot.json', 'raw/algs/matchcounts.json', 'raw/lp/lcq.json', 'raw/lp/teams-src.json', 'raw/lp/squads.json', 'raw/rosters/state.json',
  'logs/roster-changes.json', 'logs/roster-changes.md', 'config/season.json', 'config/overrides.json', 'config/players.json'];
const RESET = ['raw/algs/matchcounts.json', 'raw/lp/lcq.json', 'raw/lp/teams-src.json', 'raw/lp/squads.json', 'raw/rosters/state.json', 'logs/roster-changes.json', 'logs/roster-changes.md'];
export function archiveSeason(prev, at = new Date().toISOString()) {
  const slug = prev.seasonSlug;
  if (!slug) return false;
  const p = (rel) => path.join(ROOT, rel);
  for (const rel of KEEP) {
    if (!fs.existsSync(p(rel))) continue;
    const dst = p(`archive/${slug}/${rel}`);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(p(rel), dst);
  }
  let file = null;
  if (fs.existsSync(p('site/data/algs-data.js'))) {
    file = `data/seasons/${slug}.js`;
    const body = fs.readFileSync(p('site/data/algs-data.js'), 'utf8').replace(/^\/\/ generated[^\n]*\n/, '');
    fs.mkdirSync(p('site/data/seasons'), { recursive: true });
    fs.writeFileSync(p(`site/${file}`), `// ${slug} 마지막 화면 데이터 (${at} 보관) - scripts/season.mjs\n${body}window.ALGS.archived = ${JSON.stringify({ slug, at })};\n`);
  }
  const idx = readJson('site/data/seasons/index.json', []).filter((x) => x.slug !== slug);
  const evs = prev.events || [];
  idx.push({ slug, name: prev.seasonName || seasonName(slug), from: ptDate(minIso(evs.map((e) => e[4]))), to: ptDate(maxIso(evs.map((e) => e[5]))), file, at });
  idx.sort((a, b) => (b.from || '').localeCompare(a.from || ''));
  writeJson('site/data/seasons/index.json', idx, true);
  for (const rel of RESET) if (fs.existsSync(p(rel))) fs.unlinkSync(p(rel));
  console.log(`[season] ${slug} 보관: archive/${slug}/ (원본 ${KEEP.length}종), site/${file || '(화면 데이터 없음)'}`);
  return true;
}
