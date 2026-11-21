// 라운드 결과·POI 드래프트 그래픽 자동 생성 (규격: docs/graphics-spec.md)
//   빌드가 만든 site/data/algs-data.js 를 읽어, 경기(시리즈) 하나가
//   ⓐ 끝나면 결과 그래픽(표는 좌 1~10위·우 11~20위), ⓑ 그 경기의 POI 드래프트가 끝나면 POI 그래픽을 graphics/ 에 PNG 로 만든다.
//   실제 데이터만 쓴다: 결과가 비었거나 드래프트 선택이 다 나오지 않았으면 만들지 않는다.
//   같은 데이터로 이미 만든 그림은 다시 만들지 않는다(graphics/index.json 에 데이터 지문을 적어 둠).
//   공식 데이터가 나중에 고쳐지면(벌점 등) 지문이 바뀌어 같은 파일 이름으로 다시 만든다.
//
//   node scripts/graphics.mjs           : 만들 것이 있으면 만든다 (pretendard·playwright-core 필요)
//   node scripts/graphics.mjs --plan    : 만들 것이 있으면 종료 코드 1 (Actions 가 그때만 도구를 설치)
//   node scripts/graphics.mjs --force   : 지문과 상관없이 모두 다시 만든다
//   node scripts/graphics.mjs --html    : PNG 대신 HTML 만 graphics/_html/ 에 (디자인 확인용, 도구 불필요)
//   --only <파일 이름 일부>             : 그 그림만
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT_DIR = path.join(ROOT, 'graphics');
const INDEX = path.join(OUT_DIR, 'index.json');
const SPEC_VER = 2; // 규격(디자인)을 바꾸면 올린다 → 모든 그림을 새 규격으로 다시 만든다
const args = process.argv.slice(2);
const PLAN = args.includes('--plan'), FORCE = args.includes('--force'), HTML_ONLY = args.includes('--html');
const ONLY = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;

// ───────── 데이터 읽기 ─────────
const readJson = (rel, fb = null) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')); } catch { return fb; } };
function loadData() {
  const src = fs.readFileSync(path.join(ROOT, 'site/data/algs-data.js'), 'utf8');
  return new Function('window', `${src};return window.ALGS;`)({});
}
const A = loadData();
const CFG = readJson('config/graphics.json', {});
const seasonSlug = A.meta?.rules?.season || A.season?.slug || 'year-6';
const RULES = (() => {
  const dir = path.join(ROOT, 'config/rules');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  const f = files.includes(`${seasonSlug}.json`) ? `${seasonSlug}.json` : files.at(-1);
  return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
})();
const REGION = { 'apac-n': 'APAC NORTH', 'apac-s': 'APAC SOUTH', emea: 'EMEA', americas: 'AMERICAS', global: 'GLOBAL' };
const KIND_BADGE = { lcq: 'LCQ', championship: 'CHAMPIONSHIP' };

// 팀: 약칭·ID 로 찾기 (1부 A.teams, 2부·그 밖 A.xteams, LCQ 명단)
const byShort = {}, byId = {};
for (const t of [...Object.values(A.xteams || {}), ...Object.values(A.teams || {})]) { byShort[t.short] = t; if (t.id) byId[t.id] = t; }
for (const l of A.lcq || []) for (const t of l.teams || []) { if (!byShort[t.short]) byShort[t.short] = t; if (t.id && !byId[t.id]) byId[t.id] = byShort[t.short]; }
for (const [id, s] of Object.entries(A.shortFix || {})) if (byShort[s]) byId[id] = byShort[s];
const KR = Object.fromEntries((A.kr || []).map((k) => [k.short, k]));
const krLevel = (short) => KR[short]?.level || A.teams?.[short]?.krLevel || 'none';
const isKr = (short) => krLevel(short) !== 'none';
const teamName = (short) => byShort[short]?.name || short;

// ───────── 시각 (한국 시간) ─────────
const WD = ['일', '월', '화', '수', '목', '금', '토'];
const kst = (iso) => { const d = new Date(Date.parse(iso) + 9 * 3600e3); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), w: WD[d.getUTCDay()], hh: String(d.getUTCHours()).padStart(2, '0'), mm: String(d.getUTCMinutes()).padStart(2, '0') }; };
const dLong = (iso) => { const k = kst(iso); return `${k.m}월 ${k.d}일(${k.w}) ${k.hh}:${k.mm}`; };
const dShort = (iso) => { const k = kst(iso); return `${k.m}.${k.d}(${k.w}) ${k.hh}:${k.mm}`; };
const dTime = (iso) => { const k = kst(iso); return `${k.hh}:${k.mm}`; };
const dFile = (iso) => { const k = kst(iso); return `${k.y}${String(k.m).padStart(2, '0')}${String(k.d).padStart(2, '0')}-${k.hh}${k.mm}`; };
const sameDay = (a, b) => { const x = kst(a), y = kst(b); return x.y === y.y && x.m === y.m && x.d === y.d; };

// ───────── 대진 규칙 ─────────
const kindOf = (s) => (/last-chance/.test(s.eventSlug || '') ? 'lcq' : /championship/.test(s.eventSlug || '') ? 'championship' : null);
const stagesOf = (kind) => RULES.brackets?.[kind]?.stages || [];
const feedsOf = (kind) => RULES.brackets?.[kind]?.feeds || {};
const stageOf = (kind, name) => stagesOf(kind).find((st) => st.name === name) || null;
const stageByTab = (kind, tab) => stagesOf(kind).find((st) => st.tab === tab) || null;
// 화면 글에 쓰는 단계 이름: '승자 2R', '패자부활 1R', '매치 포인트 결승' (로비 A·B 는 '승자 1R')
const koShort = (st) => (st ? st.ko.replace(/ 그룹 [A-Z]$/, '').replace(/라운드/, 'R') : '');
const koDest = (kind, label) => { const st = stageByTab(kind, label); return st ? koShort(st) : label; };
// 다음 단계 명단의 출처 꼬리표: 로비 A·B 는 'A3', 그 밖은 '승2R 11위'
const lobbyOf = (st) => (/Lobby ([A-Z])$/.exec(st?.name || '') || [])[1] || null;
const srcAbbr = (st) => st.tab.replace('승자 ', '승').replace('패자 ', '패');
const srcLabel = (st, pos) => (lobbyOf(st) ? `${lobbyOf(st)}${pos}` : `${srcAbbr(st)} ${pos}위`);
// 파일 이름의 단계: 승자 1R 로비 A·B 는 wr1a·wr1b, 그 밖은 규칙 파일의 단계 키
const stageKeySlug = (keys) => keys.map((k) => (k === 'a' || k === 'b' ? `wr1${k}` : k)).join('-');
const stageTitle = (st) => st.ko.replace(/ 그룹 ([A-Z])$/, ' 로비 $1');

// ───────── 경기 단위 (예전엔 같은 시작 시각을 묶었으나 11-21 부터 한 경기 = 한 장) ─────────
const allSeries = (A.series || []).filter((s) => kindOf(s) && stageOf(kindOf(s), s.name));
function eventSeries(s) { return allSeries.filter((x) => x.eventId === s.eventId && x.region === s.region); }
function seriesOfStage(s, key) { const k = kindOf(s); return eventSeries(s).find((x) => stageOf(k, x.name)?.key === key) || null; }
// 이 대회에서 그림을 만들 지역: config/graphics.json regions. "kr" = 한국 관련 팀이 출전한 지역 (기본)
function regionWanted(s) {
  const want = CFG.regions || ['kr'];
  if (want.includes('all') || want.includes(s.region)) return true;
  if (!want.includes('kr')) return false;
  return eventSeries(s).some((x) => (x.lineup || []).some(isKr) || (x.results || []).some((r) => isKr(r.short)));
}
function slots() {
  const m = new Map();
  for (const s of allSeries) {
    if (!regionWanted(s)) continue;
    const key = s.id; // 경기(시리즈) 하나당 그림 한 장 (11-21 운영자 요청)
    if (!m.has(key)) m.set(key, []);
    m.get(key).push(s);
  }
  return [...m.values()].map((list) => {
    const kind = kindOf(list[0]), order = stagesOf(kind).map((st) => st.key);
    list.sort((a, b) => order.indexOf(stageOf(kind, a.name).key) - order.indexOf(stageOf(kind, b.name).key));
    return { kind, region: list[0].region, start: list[0].start, eventSlug: list[0].eventSlug, list, stages: list.map((s) => stageOf(kind, s.name)) };
  });
}

// ───────── 한국 관련 표시 ─────────
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const KR_BADGE = '<span class="krb">KR</span>';
// 한글 조사(은/는): 약칭 마지막 글자를 한국어로 읽었을 때 받침이 있으면 '은'
const josa = (w) => (/[LMNR0136780]$/i.test(w) || /[가-힣]$/.test(w) && (w.charCodeAt(w.length - 1) - 0xac00) % 28 ? '은' : '는');
function krPeople(short) {
  const k = KR[short] || {}, t = A.teams?.[short] || {};
  const pl = k.krPlayers || t.krPlayers || [], co = k.krCoaches || t.krCoaches || [];
  return [pl.join(', '), co.length ? `코치 ${co.join(', ')}` : ''].filter(Boolean).join(' · ');
}

// ───────── 로고 ─────────
function logoFile(short) {
  const lg = byShort[short]?.logo;
  const p = lg && (lg[0] || lg[1]); // [0] = 어두운 배경용(흰 로고)
  if (!p) return null;
  const f = /^logos\/t\//.test(p) ? path.join(ROOT, 'site', `${p}-160.webp`) : path.join(ROOT, 'site', p);
  return fs.existsSync(f) ? pathToFileURL(f).href : null;
}
const logo = (short, cls = '') => {
  const f = logoFile(short);
  return f ? `<img class="lg ${cls}" src="${f}" alt="">` : `<span class="lg ph ${cls}">${esc(String(short).slice(0, 2))}</span>`;
};

// ───────── 공통 틀 ─────────
const FONT_DIR = (() => {
  const cands = [process.env.PRETENDARD_DIR, path.join(ROOT, 'node_modules/pretendard/dist/web/static/woff2')];
  try { cands.push(path.join(path.dirname(createRequire(path.join(ROOT, 'package.json')).resolve('pretendard/package.json')), 'dist/web/static/woff2')); } catch {}
  return cands.find((d) => d && fs.existsSync(path.join(d, 'Pretendard-Bold.woff2'))) || null;
})();
const fontFaces = () => (FONT_DIR ? [['Regular', 400], ['Medium', 500], ['SemiBold', 600], ['Bold', 700], ['ExtraBold', 800], ['Black', 900]]
  .map(([n, w]) => `@font-face{font-family:'Pretendard';font-weight:${w};src:url('${pathToFileURL(path.join(FONT_DIR, `Pretendard-${n}.woff2`)).href}') format('woff2')}`).join('\n') : '');

const CSS = () => `${fontFaces()}
:root{--bg:#0B0F15;--panel:#141B24;--tile:#1E2836;--line:#283547;--tx:#ECE9E4;--mut:#8A99AD;--red:#DA292A;--red2:#FF2A2A;--cyan:#00E5FF;--amber:#FFAE00;--kr:#3B82F6;--krrow:#19283F;--krtile:#1C2F4D}
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:var(--bg)}
body{width:1080px;color:var(--tx);font-family:Pretendard,Inter,'Noto Sans CJK KR','Noto Sans KR',sans-serif;-webkit-font-smoothing:antialiased;font-feature-settings:'tnum'}
.card{width:1080px;padding:40px 40px 32px;background:var(--bg)}
.hd{position:relative;padding-left:28px;margin-bottom:28px}
.hd:before{content:'';position:absolute;left:0;top:4px;bottom:4px;width:6px;background:var(--red)}
.badges{display:flex;gap:8px;margin-bottom:10px}
.bdg{font:800 15px/1 Inter,Pretendard,sans-serif;letter-spacing:.18em;padding:7px 12px;border-radius:4px}
.bdg.ev{background:var(--red);color:#fff}.bdg.rg{border:1px solid var(--line);color:var(--mut)}
h1{font-weight:900;font-size:60px;line-height:1.12;letter-spacing:-.02em}
.sub{margin-top:10px;color:var(--mut);font-size:19px;font-weight:500}
.brand{position:absolute;right:0;top:0;text-align:right;font:800 15px/1.4 Inter,Pretendard,sans-serif;letter-spacing:.2em;color:var(--mut)}
.brand b{display:block;color:var(--tx);font-size:22px;letter-spacing:.04em}
.kcards{display:grid;gap:14px;margin-bottom:24px}
.kc{display:flex;gap:16px;align-items:center;background:var(--panel);border:1px solid var(--line);border-left:4px solid var(--kr);border-radius:6px;padding:18px 18px 18px 16px;min-height:120px}
.kc .lg{width:60px;height:60px;flex:none}
.kc .nm{font-weight:800;font-size:22px}.kc .nm small{font-size:13px;color:var(--mut);font-weight:700;margin-left:6px}
.kc .ln{color:var(--mut);font-size:14.5px;margin-top:6px;line-height:1.4}
.kc .oc{margin-top:6px;font-weight:800;font-size:16px}
.oc.up{color:var(--cyan)}.oc.dn{color:var(--amber)}.oc.out{color:var(--red2)}.oc.champ{color:var(--amber)}.oc.end{color:var(--mut)}
.kc .maps{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}
.kc .mp{background:var(--tile);border-radius:4px;padding:8px 10px}
.kc .mp i{display:block;font:700 10px/1.2 Inter,sans-serif;letter-spacing:.14em;color:var(--mut);font-style:normal;text-transform:uppercase}
.kc .mp b{display:block;font-size:15px;margin-top:3px}.kc .mp em{display:block;font-style:normal;font-size:11.5px;color:var(--amber);margin-top:2px}
.kc.v{flex-direction:column;align-items:stretch}.kc.v .top{display:flex;gap:12px;align-items:center}.kc.v .lg{width:44px;height:44px}
.note{background:var(--panel);border:1px solid var(--line);border-left:4px solid var(--kr);border-radius:6px;padding:20px 24px;margin-bottom:24px}
.note p{font-size:22px;font-weight:700}.note p em{font-style:normal;color:var(--amber)}
.note small{display:block;margin-top:8px;font-size:15.5px;color:var(--mut)}.note small b{color:var(--tx)}
.cols{display:grid;gap:20px;margin-bottom:24px}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:20px 18px 12px}
.pt{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:12px}
.pt h2{font-weight:800;font-size:26px}.pt h2:before{content:'/';color:var(--red);margin-right:6px;font-weight:800}
.pt .cutl{font-size:16px}
.pt .when{color:var(--amber);font-weight:800;font-size:20px}
table{width:100%;border-collapse:collapse}
th{font-size:12.5px;font-weight:600;color:var(--mut);text-align:left;padding:4px 6px 8px;border-bottom:1px solid var(--line)}
th.r,td.r{text-align:right}
td{padding:0 6px;height:50px;border-bottom:1px solid #1A222D;vertical-align:middle}
td.pos{width:38px;font:800 20px/1 Inter,sans-serif;color:var(--cyan);text-align:center}
tr.lo td.pos{color:var(--mut)}
td.tm{display:flex;align-items:center;gap:10px;height:50px}
td.tm .lg{width:32px;height:32px;flex:none}
td.tm b{display:block;font-size:17px;font-weight:800;line-height:1.1}
td.tm span.full{display:block;font-size:12.5px;color:var(--mut);margin-top:2px;max-width:230px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
td.tm .krb{margin-left:auto}
td.k{width:46px;color:var(--mut);font-size:17px;font-weight:500}
td.p{width:52px;font:800 22px/1 Inter,sans-serif}
tr.kr td{background:var(--krrow)}tr.kr td:first-child{box-shadow:inset 4px 0 0 var(--kr)}
.krb{display:inline-block;background:var(--kr);color:#fff;font:800 11px/1 Inter,sans-serif;letter-spacing:.06em;padding:4px 6px;border-radius:4px;vertical-align:middle}
tr.cut td{height:30px;border:0;padding:0 2px}
.cutl{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:800;white-space:nowrap}
.cutl i{flex:1;border-top:2px dashed var(--red);opacity:.9}
.cutl .u{color:var(--cyan)}.cutl .d{color:var(--amber)}.cutl .x{color:var(--red2)}.cutl .c{color:var(--amber)}
.lg{display:inline-block;object-fit:contain}
.lg.ph{display:inline-flex;align-items:center;justify-content:center;background:var(--tile);color:var(--mut);font:800 11px/1 Inter,sans-serif;border-radius:4px}
.next .ttl{display:flex;justify-content:space-between;align-items:baseline}
.next h3{font-size:26px;font-weight:800}.next .when{color:var(--amber);font-weight:800;font-size:20px}
.next .nsub{color:var(--mut);font-size:15px;margin:6px 0 14px}.next .nsub em{font-style:normal;font-weight:800;color:var(--cyan)}.next .nsub em.x{color:var(--red2)}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:7px}
.tl{display:flex;align-items:center;gap:8px;background:var(--tile);border:1px solid transparent;border-radius:4px;padding:7px 8px;min-height:46px}
.tl .lg{width:28px;height:28px;flex:none}.tl .lg.ph{font-size:10px}
.tl b{display:block;font-size:14.5px;font-weight:800;line-height:1.1;white-space:nowrap}
.tl.tbd b{font-size:12.5px}.tl>div{min-width:0}.tl small{display:block;font-size:11px;color:var(--mut);margin-top:2px}
.tl.kr{background:var(--krtile);border-color:var(--kr)}
.tl.tbd .lg{background:#263244;color:var(--mut)}
.ft{display:flex;justify-content:space-between;gap:20px;border-top:1px solid var(--line);padding-top:16px;margin-top:8px;color:var(--mut);font-size:13.5px}
.maps2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.mapl{font:800 13px/1 Inter,sans-serif;letter-spacing:.2em;color:var(--mut);text-transform:uppercase;margin:4px 0 8px}
.mapbox{position:relative;width:100%;aspect-ratio:1;border:1px solid var(--line);border-radius:4px;overflow:hidden;background:#0d131b}
.mapbox>img.base{width:100%;height:100%;display:block}
.pin{position:absolute;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:2px}
.pin .c{width:30px;height:30px;border-radius:50%;background:#0B0F15;border:2px solid #ECE9E4;display:flex;align-items:center;justify-content:center;overflow:hidden}
.pin .c .lg{width:20px;height:20px}.pin .c .lg.ph{background:none;font-size:9.5px;color:var(--tx)}
.pin b{font:800 9.5px/1 Inter,Pretendard,sans-serif;color:#fff;text-shadow:0 0 3px #000,0 0 3px #000;padding:1px 2px}
.pin.kr{z-index:2}.pin.kr .c{width:38px;height:38px;border:3px solid var(--kr);box-shadow:0 0 0 2px #fff}.pin.kr .c .lg{width:26px;height:26px}
.pin.kr b{background:var(--kr);border-radius:3px;text-shadow:none;padding:2px 4px;font-size:10.5px}
.ptab{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:14px}
.ptab td{height:34px}.ptab td.tm{height:34px}.ptab td.tm .lg{width:22px;height:22px}.ptab td.tm b{font-size:14.5px}
.ptab td.pk{font-size:13.5px;white-space:nowrap}.ptab td.pk i{font-style:normal;color:var(--mut);font-size:11px;display:inline-block;width:20px}
.ptab th{font:700 11px/1 Inter,Pretendard,sans-serif;letter-spacing:.12em;text-transform:uppercase}
.sec{margin-bottom:24px}
`;

const page = (body) => `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>${CSS()}</style></head><body><div class="card" id="card">${body}</div></body></html>`;
const header = (slot, title, sub) => `<div class="hd">
  <div class="badges"><span class="bdg ev">${KIND_BADGE[slot.kind]}</span><span class="bdg rg">${REGION[slot.region] || esc(slot.region)}</span></div>
  <h1>${esc(title)}</h1><div class="sub">${esc(sub)}</div>
  <div class="brand">EASY ALGS<b>KR</b></div></div>`;
const footer = (left) => `<div class="ft"><span>${esc(left)}</span><span>laplussugar.github.io/algs-kr</span></div>`;

// ───────── 결과 그래픽 ─────────
// 한 팀의 결과가 다음에 어디로 가는지
function outcome(kind, st, pos) {
  if (st.cut) {
    if (pos <= st.cut) return { cls: 'up', text: `▲ ${koDest(kind, st.up)} 진출` };
    return st.down === '탈락' ? { cls: 'out', text: '✕ 탈락' } : { cls: 'dn', text: `▼ ${koDest(kind, st.down)}` };
  }
  if (st.top) return pos <= st.top ? { cls: 'champ', text: `★ ${st.up || '챔피언십'} 진출` } : { cls: 'end', text: `${pos}위로 마감` };
  return { cls: 'end', text: `${pos}위` };
}
const stageWord = (st) => (lobbyOf(st) ? `로비 ${lobbyOf(st)}` : koShort(st));

function krCards(slot) {
  const rows = [];
  slot.list.forEach((s, i) => {
    const st = slot.stages[i];
    for (const r of s.results || []) {
      if (!isKr(r.short)) continue;
      const oc = outcome(slot.kind, st, r.pos);
      let gap = '';
      const at = (p) => (s.results || []).find((x) => x.pos === p);
      if (st.cut && r.pos === st.cut + 1 && at(st.cut)) gap = ` (${st.cut}위와 ${at(st.cut).pts - r.pts}점 차)`;
      if (st.cut && r.pos === st.cut && at(st.cut + 1)) gap = ` (${st.cut + 1}위와 ${r.pts - at(st.cut + 1).pts}점 차)`;
      rows.push({ r, st, i, oc, line: [`${stageWord(st)} ${r.pos}위 · ${r.pts}점 ${r.kills}킬${gap}`, krPeople(r.short)].filter(Boolean).join(' · ') });
    }
  });
  const rank = { champ: 0, up: 1, end: 2, dn: 3, out: 4 };
  rows.sort((a, b) => rank[a.oc.cls] - rank[b.oc.cls] || a.i - b.i || a.r.pos - b.r.pos);
  return rows;
}
function krCardsHtml(rows) {
  const cols = Math.min(3, rows.length);
  return `<div class="kcards" style="grid-template-columns:repeat(${cols},1fr)">${rows.map(({ r, oc, line }) => `<div class="kc">${logo(r.short)}<div>
    <div class="nm">${esc(r.short)}<small>${esc(teamName(r.short))}</small></div>
    <div class="ln">${esc(line)}</div><div class="oc ${oc.cls}">${esc(oc.text)}</div></div></div>`).join('')}</div>`;
}
// 한국 팀이 없는 라운드: 한국 팀들이 지금 어디에 있는지 한 줄로
function krWhereabouts(slot) {
  const ev = eventSeries(slot.list[0]);
  const order = stagesOf(slot.kind).map((st) => st.key);
  const last = {};
  for (const s of ev) {
    if (s.status !== 'completed') continue;
    const st = stageOf(slot.kind, s.name);
    for (const r of s.results || []) {
      if (!isKr(r.short)) continue;
      if (!last[r.short] || order.indexOf(st.key) > order.indexOf(last[r.short].st.key)) last[r.short] = { st, r };
    }
  }
  const groups = new Map();
  for (const [short, { st, r }] of Object.entries(last)) {
    const oc = outcome(slot.kind, st, r.pos);
    const verb = oc.cls === 'up' ? (st.up === '결승' ? '결승 직행' : `${koDest(slot.kind, st.up)} 진출`) : oc.cls === 'out' ? '탈락' : oc.cls === 'dn' ? `${koDest(slot.kind, st.down)}로` : oc.text;
    const txt = `${koShort(st)}에서 ${verb}`;
    if (!groups.has(txt)) groups.set(txt, []);
    groups.get(txt).push(short);
  }
  return [...groups].map(([txt, list]) => { const w = list.join('·'); return `<b>${esc(w)}</b>${josa(w)} ${esc(txt)}`; }).join(' · ');
}
function noKrNote(slot) {
  const st = slot.stages[0];
  const next = st.cut ? stageByTab(slot.kind, st.up) : null;
  const ns = next ? seriesOfStage(slot.list[0], next.key) : null;
  const head = st.cut ? `<em>상위 ${st.cut}팀</em>이 ${ns ? `${sameDay(ns.start, slot.start) ? '오늘' : dShort(ns.start).replace(/ \d+:\d+$/, '')} ${dTime(ns.start)} ` : ''}<em>${esc(koDest(slot.kind, st.up))}</em>에 진출해요` : '이번 라운드 결과';
  const where = krWhereabouts(slot);
  return `<div class="note"><p>${head}</p><small>이번 라운드에는 한국 팀이 없어요${where ? ` · ${where}` : ''}</small></div>`;
}

// 결과 표: 왼쪽 1~10위, 오른쪽 11~20위 (세로를 줄이려고 반씩 나눔, 11-21 운영자 요청)
//   진출선이 마침 가운데(10위)면 선 대신 두 판의 머리에 '▲ 승자 2R' / '▼ 패자부활 1R' 을 단다
function resultTables(slot, s, st) {
  const rows = (s.results || []).slice().sort((a, b) => a.pos - b.pos);
  const cut = st.cut || st.top || 0;
  const half = Math.ceil(Math.max(rows.length, st.n || 0) / 2);
  const atHalf = st.cut && st.cut === half;
  const upTxt = st.cut ? `▲ ${koDest(slot.kind, st.up)}` : `★ ${st.up || '챔피언십'}`;
  const downTag = st.cut ? (st.down === '탈락' ? `<span class="x">▼ 탈락</span>` : `<span class="d">▼ ${esc(koDest(slot.kind, st.down))}</span>`) : '';
  const cutRow = () => `<tr class="cut"><td colspan="4"><div class="cutl"><span class="${st.cut ? 'u' : 'c'}">${esc(upTxt)}</span><i></i>${downTag}</div></td></tr>`;
  const tr = (r) => `${cut && !atHalf && r.pos === cut + 1 && r.pos !== half + 1 ? cutRow() : ''}<tr class="${r.pos > cut && cut ? 'lo' : ''}${isKr(r.short) ? ' kr' : ''}">
    <td class="pos">${r.pos}</td>
    <td class="tm">${logo(r.short)}<div><b>${esc(r.short)}</b><span class="full">${esc(teamName(r.short))}</span></div>${isKr(r.short) ? KR_BADGE : ''}</td>
    <td class="k r">${r.kills}</td><td class="p r">${r.pts}</td></tr>`;
  const panel = (part, title, tag) => `<div class="panel"><div class="pt"><h2>${esc(title)}</h2>${tag ? `<span class="cutl">${tag}</span>` : ''}</div>
    <table><thead><tr><th>#</th><th>팀</th><th class="r">킬</th><th class="r">점수</th></tr></thead><tbody>${part.map(tr).join('')}</tbody></table></div>`;
  const left = rows.filter((r) => r.pos <= half), right = rows.filter((r) => r.pos > half);
  const lastPos = rows.length ? rows.at(-1).pos : st.n;
  return `<div class="cols" style="grid-template-columns:1fr 1fr">${panel(left, `1~${half}위`, atHalf ? `<span class="u">${esc(upTxt)}</span>` : '')}${panel(right, `${half + 1}~${Math.max(lastPos, half + 1)}위`, atHalf ? downTag : '')}</div>`;
}

// 이 묶음이 넘겨주는 다음 단계들의 명단 (아직 안 끝난 단계에서 올 자리는 '?')
function nextStages(slot) {
  const kind = slot.kind, feeds = feedsOf(kind), keys = slot.stages.map((st) => st.key);
  return stagesOf(kind).filter((st) => (feeds[st.key] || []).some(([src]) => keys.includes(src))).map((st) => {
    const fs_ = feeds[st.key];
    const lists = fs_.map(([src, from, to]) => {
      const sst = stagesOf(kind).find((x) => x.key === src);
      const ss = seriesOfStage(slot.list[0], src);
      const out = [];
      for (let p = from; p <= to; p++) {
        const r = ss?.status === 'completed' ? (ss.results || []).find((x) => x.pos === p) : null;
        if (ss?.status === 'completed' && !r) continue; // 끝난 단계에 그 순위가 없으면(팀이 빠진 로비) 자리도 없다
        out.push(r ? { short: r.short, label: srcLabel(sst, p) } : { tbd: true, short: `${srcAbbr(sst)} ${p}위`, label: ss ? `${dTime(ss.start)} 결정` : '결정 전' });
      }
      return out;
    });
    const lobbies = fs_.every(([src]) => lobbyOf(stagesOf(kind).find((x) => x.key === src)));
    const items = lobbies ? lists[0].flatMap((x, i) => lists.map((l) => l[i]).filter(Boolean)) : lists.flat();
    return { st, series: seriesOfStage(slot.list[0], st.key), items };
  });
}
function nextHtml(slot, n) {
  const st = n.st;
  let sub = '';
  if (st.cut) {
    const up = koDest(slot.kind, st.up), down = st.down === '탈락' ? '<em class="x">탈락</em>' : esc(koDest(slot.kind, st.down));
    sub = `상위 ${st.cut}팀 ${up === '매치 포인트 결승' ? `<em>${up}</em>` : esc(up)} · 하위 ${st.n - st.cut}팀 ${down}`;
  } else if (st.top) sub = `상위 ${st.top}팀 <em>${esc(st.up || '챔피언십')}</em> 진출`;
  const tiles = n.items.map((x) => x.tbd
    ? `<div class="tl tbd"><span class="lg ph">?</span><div><b>${esc(x.short)}</b><small>${esc(x.label)}</small></div></div>`
    : `<div class="tl${isKr(x.short) ? ' kr' : ''}">${logo(x.short)}<div><b>${esc(x.short)}</b><small>${esc(x.label)}</small></div></div>`).join('');
  return `<div class="panel next"><div class="ttl"><h3>${esc(st.ko)}</h3>${n.series ? `<span class="when">${esc(dShort(n.series.start))}</span>` : ''}</div>
    <div class="nsub">${sub}</div><div class="grid">${tiles}</div></div>`;
}

function resultsSpec(slot) {
  const { list, stages, kind } = slot;
  const s = list[0], st0 = stages[0];
  const title = `${stageTitle(st0)} 결과`;
  const parts = [dLong(slot.start), `${(s.results || []).length}팀`, `${s.matches}게임`];
  if (st0.cut) parts.push(`상위 ${st0.cut}팀 ${koDest(kind, st0.up)}, 하위 ${st0.n - st0.cut}팀 ${koDest(kind, st0.down)}`);
  else if (st0.top) parts.push(`상위 ${st0.top}팀 ${st0.up || '챔피언십'} 진출`);
  const kr = krCards(slot);
  const next = nextStages(slot);
  const asOf = A.sources?.algs || A.generated;
  const body = header(slot, title, parts.join(' · '))
    + (kr.length ? krCardsHtml(kr) : noKrNote(slot))
    + resultTables(slot, s, st0)
    + (next.length ? `<div class="cols" style="grid-template-columns:repeat(${Math.min(2, next.length)},1fr)">${next.map((n) => nextHtml(slot, n)).join('')}</div>` : '')
    + footer(`시각은 한국 시간 · 점수·킬·다음 경기 명단: ALGS 공식 데이터 (${dShort(asOf)} 기준)`);
  const fp = JSON.stringify(list.map((x) => [x.id, x.status, x.results]));
  return { kind: 'results', title, html: page(body), fp };
}

// ───────── POI 드래프트 그래픽 ─────────
function poiOf(s) { return A.poi?.[s.id] || null; }
function poiReady(slot) {
  return slot.list.every((s) => {
    const p = poiOf(s);
    // 공식 드래프트가 끝났다고 표시(done)되고 지도마다 선택이 있어야 한다 (팀이 빠져 19팀만 고른 로비도 있음)
    return p && p.done && (p.maps || []).length && p.maps.every((m) => (m.picks || []).length > 0);
  });
}
// 공식 데이터의 지점 이름이 지도에 따라 전부 대문자로 오기도 해서(WORLD'S EDGE) 첫 글자만 대문자로 맞춘다
const poiName = (s) => (/[a-z]/.test(s || '') ? s : String(s || '').toLowerCase().replace(/(^|[\s-])([a-z])/g, (m, a, b) => a + b.toUpperCase()));
const pickShort = (pk) => byId[pk[1]]?.short || A.shortFix?.[pk[1]] || pk[2];
const mapImg = (m) => { const f = path.join(ROOT, 'site', m.base || ''); return m.base && fs.existsSync(f) ? pathToFileURL(f).href : null; };

function poiSection(slot, s, st) {
  const p = poiOf(s);
  const maps = p.maps;
  const mapsHtml = maps.map((m) => {
    const img = mapImg(m);
    const pins = m.picks.filter((pk) => pk[4] != null && pk[5] != null).map((pk) => {
      const sh = pickShort(pk);
      return `<div class="pin${isKr(sh) ? ' kr' : ''}" style="left:${pk[4]}%;top:${pk[5]}%"><span class="c">${logo(sh)}</span><b>${esc(sh)}</b></div>`;
    }).join('');
    return `<div><div class="mapl">${esc(m.map)}</div><div class="mapbox">${img ? `<img class="base" src="${img}" alt="">` : ''}${pins}</div></div>`;
  }).join('');
  // 표: 팀마다 지도별 선택. 팀 순서 = 그 팀의 가장 이른 선택 순서 (드래프트 시드 순)
  const teams = new Map();
  maps.forEach((m, mi) => m.picks.forEach((pk) => {
    const sh = pickShort(pk);
    if (!teams.has(sh)) teams.set(sh, { sh, first: Infinity, picks: [] });
    const t = teams.get(sh); t.picks[mi] = pk; t.first = Math.min(t.first, pk[0]);
  }));
  const rows = [...teams.values()].sort((a, b) => a.first - b.first);
  const half = Math.ceil(rows.length / 2);
  const tbl = (part) => `<table><thead><tr><th>팀</th>${maps.map((m) => `<th>${esc(m.map)}</th>`).join('')}</tr></thead><tbody>${part.map((t) => `<tr class="${isKr(t.sh) ? 'kr' : ''}">
    <td class="tm">${logo(t.sh)}<b>${esc(t.sh)}</b>${isKr(t.sh) ? KR_BADGE : ''}</td>
    ${maps.map((_, mi) => { const pk = t.picks[mi]; return `<td class="pk">${pk ? `<i>${pk[0]}</i>${esc(poiName(pk[3]))}` : '–'}</td>`; }).join('')}</tr>`).join('')}</tbody></table>`;
  return `<div class="panel sec"><div class="pt"><h2>${esc(stageTitle(st))}</h2><span class="when">${esc(dShort(s.start))}</span></div>
    <div class="maps2">${mapsHtml}</div><div class="ptab">${tbl(rows.slice(0, half))}${tbl(rows.slice(half))}</div></div>`;
}
function poiKrCards(slot) {
  const out = [];
  slot.list.forEach((s, i) => {
    const p = poiOf(s), st = slot.stages[i];
    const shorts = new Set();
    p.maps.forEach((m) => m.picks.forEach((pk) => shorts.add(pickShort(pk))));
    for (const sh of shorts) {
      if (!isKr(sh)) continue;
      const mp = p.maps.map((m) => { const pk = m.picks.find((x) => pickShort(x) === sh); return `<div class="mp"><i>${esc(m.map)}</i><b>${esc(pk ? poiName(pk[3]) : '–')}</b>${pk ? `<em>${pk[0]}번째 선택</em>` : ''}</div>`; }).join('');
      out.push(`<div class="kc v"><div class="top">${logo(sh)}<div><div class="nm">${esc(sh)}<small>${esc(teamName(sh))}</small></div><div class="oc up" style="margin-top:2px;font-size:14px">${esc(koShort(st))}${lobbyOf(st) ? ` 로비 ${lobbyOf(st)}` : ''}</div></div></div><div class="maps">${mp}</div></div>`);
    }
  });
  return out;
}
function poiSpec(slot) {
  const { list, stages } = slot;
  const maps = [...new Set(list.flatMap((s) => poiOf(s).maps.map((m) => m.map)))];
  const what = stages.map(stageTitle).join(' · ');
  const n = list[0].lineup?.length || stages[0].n;
  const sub = [what, dLong(slot.start), ...maps, `${list.length > 1 ? '각 ' : ''}${n}팀`].join(' · ');
  const cards = poiKrCards(slot);
  const body = header(slot, 'POI 드래프트', sub)
    + (cards.length ? `<div class="kcards" style="grid-template-columns:repeat(${Math.min(3, cards.length)},1fr)">${cards.join('')}</div>` : noKrNote(slot))
    + list.map((s, i) => poiSection(slot, s, stages[i])).join('')
    + footer('지도의 핀은 팀별 낙하 지점 · 표의 작은 숫자는 드래프트 선택 순서 · 출처: ALGS 공식 POI 드래프트');
  const fp = JSON.stringify(list.map((s) => [s.id, poiOf(s).maps.map((m) => [m.map, m.picks.map((pk) => pk.slice(0, 4))])]));
  return { kind: 'poi', title: 'POI 드래프트', html: page(body), fp };
}

// ───────── 할 일 정하기 ─────────
function jobs() {
  const out = [];
  for (const slot of slots()) {
    const keys = stageKeySlug(slot.stages.map((st) => st.key));
    const dir = path.join(seasonSlug, slot.kind, slot.region);
    const base = `${dFile(slot.start)}-${keys}`;
    const done = slot.list.every((s) => s.status === 'completed' && (s.results || []).length > 0);
    if (done) out.push({ slot, file: path.join(dir, `${base}-results.png`), make: () => resultsSpec(slot) });
    if (poiReady(slot)) out.push({ slot, file: path.join(dir, `${base}-poi.png`), make: () => poiSpec(slot) });
  }
  return ONLY ? out.filter((j) => j.file.includes(ONLY)) : out;
}

const index = (() => { try { return JSON.parse(fs.readFileSync(INDEX, 'utf8')); } catch { return { ver: 1, items: {} }; } })();
const fpHash = (s) => crypto.createHash('sha1').update(`${SPEC_VER}|${s}`).digest('hex').slice(0, 12);
const todo = [];
for (const j of jobs()) {
  const spec = j.make();
  const h = fpHash(spec.fp);
  const cur = index.items[j.file];
  if (!FORCE && !HTML_ONLY && cur && cur.hash === h && fs.existsSync(path.join(OUT_DIR, j.file))) continue;
  todo.push({ ...j, spec, hash: h });
}
if (PLAN) {
  if (todo.length) { console.log(`[graphics] 만들 그림 ${todo.length}장: ${todo.map((t) => t.file).join(', ')}`); process.exit(1); }
  console.log('[graphics] 새로 만들 그림 없음'); process.exit(0);
}
if (!todo.length) { console.log('[graphics] 새로 만들 그림 없음'); process.exit(0); }

if (HTML_ONLY) {
  for (const t of todo) {
    const f = path.join(OUT_DIR, '_html', t.file.replace(/\.png$/, '.html'));
    fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t.spec.html);
    console.log(`[graphics] HTML ${path.relative(ROOT, f)}`);
  }
  process.exit(0);
}

// ───────── 그리기 (Chrome) ─────────
if (!FONT_DIR) console.warn('[graphics] 경고: Pretendard 글꼴을 찾지 못해 시스템 글꼴로 그립니다 (npm i --no-save pretendard@1.3.9)');
let pw;
for (const m of ['playwright-core', 'playwright']) { try { pw = await import(m); break; } catch {} }
if (!pw) { try { pw = createRequire(path.join(os.homedir(), 'x.js'))('playwright'); } catch {} }
if (!pw) { console.error('[graphics] playwright-core 가 없습니다 (npm i --no-save playwright-core@1.47.2)'); process.exit(2); }
let sharp = null;
try { sharp = (await import('sharp')).default; } catch {}
const chromium = pw.chromium || pw.default?.chromium;
const exe = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/opt/pw-browsers/chromium'].find((p) => p && fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--allow-file-access-from-files'] });
const ctx = await browser.newContext({ viewport: { width: 1080, height: 1200 }, deviceScaleFactor: 2 });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'algs-gfx-'));
let made = 0;
try {
  for (const t of todo) {
    const html = path.join(tmp, 'g.html');
    fs.writeFileSync(html, t.spec.html);
    const pg = await ctx.newPage();
    await pg.goto(pathToFileURL(html).href, { waitUntil: 'load' });
    await pg.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map((i) => (i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; })))); });
    const broken = await pg.evaluate(() => [...document.images].filter((i) => !i.naturalWidth).map((i) => i.src));
    if (broken.length) console.warn(`[graphics] 경고: 그림을 못 읽음 ${broken.join(', ')}`);
    const out = path.join(OUT_DIR, t.file);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    let png = await (await pg.$('#card')).screenshot({ type: 'png' });
    // sharp 가 있으면 256색 PNG 로 줄인다 (지도 그림이 든 POI 는 5MB → 2MB 안팎, 글자·로고는 눈으로 차이 없음)
    if (sharp) png = await sharp(png).png({ palette: true, quality: 90, effort: 8, compressionLevel: 9 }).toBuffer();
    fs.writeFileSync(out, png);
    await pg.close();
    index.items[t.file] = { kind: t.spec.kind, region: t.slot.region, event: t.slot.eventSlug, start: t.slot.start, title: t.spec.title, hash: t.hash, made: new Date().toISOString(), series: t.slot.list.map((s) => s.id) };
    made++;
    console.log(`[graphics] ${index.items[t.file].made.slice(0, 16)}Z 만듦: graphics/${t.file} (${Math.round(fs.statSync(out).size / 1024)}KB)`);
  }
} finally {
  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  if (made) {
    const items = Object.fromEntries(Object.entries(index.items).sort(([a], [b]) => a.localeCompare(b)));
    fs.writeFileSync(INDEX, JSON.stringify({ ver: 1, spec: 'docs/graphics-spec.md', items }, null, 1) + '\n');
  }
}
