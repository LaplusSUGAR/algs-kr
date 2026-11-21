// EASY ALGS KR — 화면 렌더링 (빌드 도구 없이 동작하는 ES 모듈)
// 빌드가 용량을 줄이려고 공식 ID를 표(_u)의 순번 '~번호'로 바꿔 보낸다. 읽자마자 원래 ID로 되돌려, 아래 코드는 원래 값만 본다
function unpack(d) {
  const U = d?._u;
  if (!U) return d;
  const id = (x) => (x.charCodeAt(0) === 126 && /^~[0-9a-z]+$/.test(x) ? U[parseInt(x.slice(1), 36)] : x);
  const dec = (v) => (typeof v === 'string' ? id(v) : Array.isArray(v) ? v.map(dec) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [id(k), dec(x)])) : v);
  const { _u, ...rest } = d;
  return dec(rest);
}
// 지난 시즌 보기: 주소에 ?y=year-6 처럼 시즌이 있으면 얼려 둔 그 시즌의 화면 데이터(data/seasons/<시즌>.js)를 대신 읽는다.
// 목록(seasons)에 없는 값이거나 파일을 못 읽으면 현재 시즌 그대로 연다
{
  const y = new URLSearchParams(location.search).get('y'), cur = window.ALGS;
  if (y && (cur?.seasons || []).some((x) => x.slug === y)) {
    const ok = await new Promise((res) => { const el = document.createElement('script'); el.src = `data/seasons/${y}.js`; el.onload = () => res(true); el.onerror = () => res(false); document.head.appendChild(el); });
    if (!ok || !window.ALGS?.archived) window.ALGS = cur;
  }
}
let A = unpack(window.ALGS);
// 대진 구조(단계·진출 규칙·진행 그림)는 규칙 파일(config/rules/<시즌>.json 의 brackets)에서 온다. 진행 방식이 바뀌면 그 파일만 고친다
//   LCQ_STAGES·CH_BK: 단계 표 / LCQ_FLOW·CH_FLOW: 단계 ← [앞 단계, 몇 위부터, 몇 위까지] (다음 경기 점수표 칸) / *_FLOW_L: 진행 그림 / CH_GS: 조별 리그 대진 / PO_FLOW_L: 플레이오프 그림
let LCQ_STAGES, LCQ_FLOW, LCQ_FLOW_L, CH_GS, CH_BK, CH_FLOW, CH_FLOW_L, PO_FLOW_L;
function loadBrackets() {
  const K = A.season?.brackets || {}, L = K.lcq || {}, H = K.championship || {};
  LCQ_STAGES = L.stages || []; LCQ_FLOW = L.feeds || {}; LCQ_FLOW_L = L.flow || { h: 0, nodes: {}, edges: [] };
  CH_GS = H.groupMatches || []; CH_BK = H.stages || []; CH_FLOW = H.feeds || {}; CH_FLOW_L = H.flow || { h: 0, nodes: {}, edges: [] };
  PO_FLOW_L = K.playoffs?.flow || { nodes: {}, edges: [] };
}
loadBrackets();
const FROZEN = !!A.archived; // 지난 시즌 기록: 새 데이터 확인·실시간 조회를 하지 않는다
// 시즌 값: 빌드가 meta로 넣어 준다 (가장 최근 Split, CP 동률을 가르는 플레이오프, Liquipedia 시즌 주소)
const lastSplit = () => A.meta?.lastSplit || Math.max(1, ...Object.values(A.pl || {}).map((p) => p.split || 1));
const tieSlug = () => (A.meta ? A.meta.tieSlug : 'split-2-playoffs');
const tieN = () => Number(/split-(\d)/.exec(tieSlug() || '')?.[1]) || lastSplit();
const seasonSlug = () => A.meta?.slug || 'year-6';
const yearLabel = () => String(A.season?.name || 'ALGS').replace(/^ALGS\s+/, '');
const C = window.ALGS_CONFIG || {};
const app = document.getElementById('app');

/* ---------- 설정 (브라우저별 저장, 실패해도 동작) ---------- */
const mem = {};
const store = {
  get(k, d) { try { const v = localStorage.getItem('algskr.' + k); return v === null ? d : JSON.parse(v); } catch { return k in mem ? mem[k] : d; } },
  set(k, v) { mem[k] = v; try { localStorage.setItem('algskr.' + k, JSON.stringify(v)); } catch {} },
};
// 언어 (assets/i18n.js): 화면은 한국어로 그리고, 다른 언어면 그린 뒤 문구를 바꾼다
const I = window.I18N || { lang: 'ko', info: { tz: 'KST' }, t: (x) => x, tree() {}, chrome() {}, setLang() {} };
const TZL = I.info.tz;
const opt = { spoiler: store.get('spoiler', false), krOnly: store.get('krOnly', false), mode: store.get('mode', 'kr'), fav: store.get('fav', []), main: store.get('main', null) };

/* ---------- 보기 모드: 한국 팀 · 지역(APAC North · APAC South · EMEA · Americas) · 내 응원 팀 ----------
   모드마다 '관심 팀'이 달라지고, 홈 카드·표 강조·필터·진출 구조 칩이 모두 관심 팀 기준으로 바뀐다 */
// 지역 보기: 그 지역 팀이 관심 팀. region 이 있으면 지역 보기다 (APAC North · APAC South · EMEA · Americas)
const regionMode = (region, label, tag) => ({ label, tag, region, group: label, strip: `${label} 팀`, title: `${label} 팀`, only: `${label} 경기만`, none: `${label} 팀 없음` });
const MODES = {
  kr: { label: '한국 팀', tag: '한국', group: '한국 관련', strip: '한국 선수·코치 팀', title: '한국 관련 팀', only: '한국 팀 경기만', none: '한국 관련 팀 없음' },
  apn: regionMode('apac-n', 'APAC North', 'APN'),
  aps: regionMode('apac-s', 'APAC South', 'APS'),
  emea: regionMode('emea', 'EMEA', 'EMEA'),
  amer: regionMode('americas', 'Americas', 'AMER'),
  custom: { label: '내 응원 팀', tag: '응원', group: '내 응원 팀', strip: '내 응원 팀', title: '내 응원 팀', only: '응원 팀 경기만', none: '응원 팀 없음' },
};
const ML = () => MODES[opt.mode] || MODES.kr;
function setMode(m) { opt.mode = MODES[m] ? m : 'kr'; store.set('mode', opt.mode); FOCUS = null; animNext = 'soft'; render(); }
// 대표 응원 팀: 응원 팀 중 하나를 홈 맨 위 큰 카드와 표 맨 앞 강조로
// 대표 응원 팀은 어느 보기(한국 팀·APAC North·내 응원 팀)에서도 관심 팀으로 치고 가장 먼저 보여 준다
const mainId = () => (opt.main && opt.fav.includes(opt.main) ? opt.main : null);
// 보기 기준에 안 맞는데 대표 팀이라서 끼어든 팀이면, 어느 지역 팀인지 따로 알려 준다 (한국 팀 보기에서 한국 관련이 아니면, APAC North 보기에서 다른 지역이면)
function outsider(short) {
  const t = A.teams?.[short];
  if (!t || !mainId() || t.id !== mainId()) return false;
  return opt.mode === 'kr' ? !t.krLevel || t.krLevel === 'none' : ML().region ? t.region !== ML().region : false;
}
const outTag = (short) => (outsider(short) ? `<span class="oreg" title="${esc(opt.mode === 'kr' ? '한국 관련 팀이 아닙니다' : `${ML().label} 팀이 아닙니다`)}">${esc(REGION[A.teams[short].region] || '')}</span>` : '');
function setMain(id) { opt.main = opt.main === id ? null : id; if (opt.main && !opt.fav.includes(id)) { opt.fav = [...opt.fav, id]; store.set('fav', opt.fav); } store.set('main', opt.main); FOCUS = null; animNext = 'soft'; render(); }
// 대표 응원 팀: 팀 로고에서 뽑은 색(A.teams[].color)으로 사이트 강조색을 바꾸고, 헤더에 팀 칩을 단다. 색이 없는 팀은 기본 빨강
const mainTeam = () => (opt.main && opt.fav.includes(opt.main) ? Object.values(A.teams).find((x) => x.id === opt.main && x.current) || null : null);
const TEAM_VARS = ['--apex', '--apex-hot', '--ring', '--ring-soft'];
function applyTeamTheme() {
  const t = mainTeam(), c = t?.color, st = document.documentElement.style;
  if (c) {
    const n = parseInt(c.slice(1), 16), up = (v) => Math.min(255, Math.round(v + (255 - v) * 0.22));
    const hot = `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => up(v).toString(16).padStart(2, '0')).join('')}`;
    st.setProperty('--apex', c); st.setProperty('--apex-hot', hot); st.setProperty('--ring', hot); st.setProperty('--ring-soft', `${c}26`);
  } else TEAM_VARS.forEach((k) => st.removeProperty(k));
  const brand = document.querySelector('.brand'); if (!brand) return;
  let chip = document.getElementById('brandTeam');
  if (!t) { chip?.remove(); return; }
  if (!chip) { chip = document.createElement('a'); chip.id = 'brandTeam'; chip.className = 'brand-team'; brand.after(chip); }
  const html = `${logo(t.short, '', true)}<b>${esc(t.short)}</b>`;
  if (chip.dataset.k !== t.short + document.documentElement.dataset.theme) { const nu = chip.dataset.t !== t.short; chip.dataset.k = t.short + document.documentElement.dataset.theme; chip.dataset.t = t.short; chip.href = `#/teams/${encodeURIComponent(t.short)}`; chip.title = `대표 응원 팀: ${t.name}`; chip.innerHTML = html; if (nu) pulseCls(chip, 'pop', 300); } // 새 팀을 고르면 칩이 톡 나타난다
}
function toggleFav(id) { const s = new Set(opt.fav); s.has(id) ? s.delete(id) : s.add(id); opt.fav = [...s]; store.set('fav', opt.fav); FOCUS = null; animNext = 'soft'; render(); }
// 관심 팀 단계: kr 모드는 한국 팀/한국 선수 소속/한국 코치 팀, 다른 모드는 관심 팀이면 'team'
function lvlOf(short) {
  const t = A.teams?.[short];
  if (!t) return 'none';
  const base = ML().region ? (t.region === ML().region ? 'team' : 'none') : opt.mode === 'custom' ? (opt.fav.includes(t.id) ? 'team' : 'none') : t.krLevel || 'none';
  return base === 'none' && t.id === mainId() ? 'team' : base;
}
const isF = (short) => lvlOf(short) !== 'none';
// 관심 팀 카드 목록 (kr 모드는 빌드가 만든 A.kr, 다른 모드는 화면에서 만듦)
let FOCUS = null;
function focusList() {
  const mid = mainId();
  if (FOCUS && FOCUS.a === A && FOCUS.b === BOARD && FOCUS.m === opt.mode && FOCUS.mid === mid && FOCUS.kr === A.kr) return FOCUS.list;
  const bd = typeof board === 'function' ? board() : null;
  const pl2 = Object.values(A.pl).filter((p) => p.split === Math.max(...Object.values(A.pl).map((x) => x.split))).flatMap((p) => p.rows);
  const mk = (t) => {
    const b = bd?.rows.find((r) => r.id === t.id), c = A.cp.find((r) => r.id === t.id), s2 = pl2.find((r) => r.id === t.id), ir = A.intl?.rows.find((r) => r.id === t.id);
    return { short: t.short, name: t.name, level: 'team', kc: false, krPlayers: (t.roster || []).filter((p) => p.r !== 'k').map((p) => p.n), krCoaches: [],
      cp: b ? { rank: b.prank, total: b.min, gap: b.pgap, status: b.pstatus } : c ? { rank: c.rank, total: c.total, gap: c.gap, status: c.status } : t.cp ? { rank: t.cp.rank, total: t.cp.total } : null,
      pl: s2 ? { pos: s2.pos, rs: s2.rs, kills: s2.kills, qualified: s2.qualified } : null,
      intl: ir ? { pos: ir.pos, pts: ir.pts, of: A.intl.rows.length, next: ir.next } : null, nextSeries: null };
  };
  let list = opt.mode === 'kr' ? [...(A.kr || [])] : Object.values(A.teams).filter((t) => isF(t.short)).map(mk).sort((a, b) => (a.cp?.rank ?? 999) - (b.cp?.rank ?? 999));
  const mt = mid && Object.values(A.teams).find((t) => t.id === mid);
  if (mt && !list.some((k) => k.short === mt.short)) list.push(mk(mt)); // 한국 팀 보기에 한국 관련이 아닌 대표 팀이 끼어든다
  if (mid) list.sort((a, b) => (team(b.short)?.id === mid) - (team(a.short)?.id === mid)); // 대표 팀을 맨 앞에 (나머지 순서는 그대로)
  FOCUS = { a: A, b: BOARD, m: opt.mode, list, mid, kr: A.kr };
  return list;
}

/* ---------- 스포일러 방지: 점수·순위·진출 결과를 가리고 대회 단위로 공개 ---------- */
const revealed = new Set(store.get('revealed', []));
// 가릴 대상 열쇠: 진행 중(또는 막 끝난) 국제전, 최근 7일 안의 시리즈가 속한 대회
const intlKey = () => (A.intl?.eventId ? `ev:${A.intl.eventId}` : null);
const seriesKey = (s) => (Date.now() - new Date(s.start) < 7 * 864e5 ? `ev:${s.eventId}` : null);
function spoil(html, key, label = '결과') {
  if (!opt.spoiler || !key || revealed.has(key)) return html;
  return `<div class="spoil-box"><button type="button" class="spoil-btn" data-reveal="${esc(key)}"><b>${esc(label)} 가림</b><span>스포일러 방지 중 · 눌러서 이 대회 결과 보기</span></button><div class="spoil-hidden" inert aria-hidden="true">${html}</div></div>`;
}
function reveal(key, btn) {
  revealed.add(key); store.set('revealed', [...revealed].slice(-50));
  // 가림이 걷히는 모습을 먼저 보여 주고 다시 그린다 (흐림은 이 상자 하나에만, 한 번)
  const box = btn?.closest('.spoil-box');
  if (box && motionOK()) { box.classList.add('opening'); setTimeout(() => { animNext = 'soft'; render(); }, 300); } else render();
}

/* ---------- 문의·피드백 ---------- */
function feedbackUrl(kind, ctx = '') {
  const page = location.href;
  if (!C.feedback || C.feedback === 'github') {
    const body = `## 내용\n\n(여기에 적어 주세요)\n\n---\n- 종류: ${kind}\n- 보던 화면: ${page}\n- 화면 크기: ${innerWidth}×${innerHeight}${ctx ? `\n- 대상: ${ctx}` : ''}`;
    return `https://github.com/${C.feedbackRepo || 'LaplusSUGAR/algs-kr'}/issues/new?title=${encodeURIComponent(`[${kind}] ${ctx}`.trim())}&body=${encodeURIComponent(body)}`;
  }
  // 구글 폼: 종류는 폼의 선택지 글자와 똑같아야 미리 선택된다(feedbackKinds 로 바꿔 넣음)
  const u = new URL(C.feedback), F = C.feedbackFormFields || {};
  u.searchParams.set('usp', 'pp_url');
  if (F.kind) u.searchParams.set(F.kind, C.feedbackKinds?.[kind] || kind);
  if (F.page) u.searchParams.set(F.page, page);
  if (F.body && ctx) u.searchParams.set(F.body, ctx);
  if (F.lang && C.feedbackLangs?.[I.lang]) u.searchParams.set(F.lang, C.feedbackLangs[I.lang]);
  return u.toString();
}
let fbCtx = '';
function openFeedback(kind, ctx = '') {
  fbCtx = ctx;
  if (kind && kind !== '기타') { window.open(feedbackUrl(kind, ctx), '_blank', 'noopener'); return; }
  document.getElementById('feedback')?.showModal();
}
const fbLink = (kind, ctx, label) => `<button type="button" class="link-btn fb-link" data-feedback="${esc(kind)}" data-ctx="${esc(ctx)}">${esc(label)}</button>`;

/* ---------- 유틸 ---------- */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TZ = 'Asia/Seoul';
// 날짜·시각·숫자 표기는 화면을 그릴 때마다 수천 번 불린다. 포매터를 한 번만 만들고, 같은 시각 문자열은 계산해 둔 값을 다시 쓴다
const DF_DAY = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ }), DF_HM = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }), NF = new Intl.NumberFormat('ko-KR');
const memoStr = (f) => { const m = new Map(); return (k) => { if (typeof k !== 'string') return f(k); let v = m.get(k); if (v === undefined) { if (m.size > 4000) m.clear(); v = f(k); m.set(k, v); } return v; }; };
const dayKey = memoStr((iso) => DF_DAY.format(new Date(iso)));
// 시각은 언제나 24시간제 HH:mm (sv-SE 형식은 오전/오후 없이 00~23시로 나온다. 기기의 12시간제 설정과 상관없음)
const hhmm = memoStr((iso) => DF_HM.format(new Date(iso)));
const WD = { ja: ['日', '月', '火', '水', '木', '金', '土'], en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] }[I.lang] || ['일', '월', '화', '수', '목', '금', '토'];
const dayLabel = (key) => { const [y, m, d] = key.split('-').map(Number); const wd = WD[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]; return `${String(m).padStart(2, '0')}.${String(d).padStart(2, '0')} (${wd})`; };
const dateTime = (iso) => `${dayLabel(dayKey(iso))} ${hhmm(iso)}`;
// 시리즈 시각 표시: 공식 시각이 지역 구분 없는 임시값이면 '시각 미정'
const sTime = (s) => (s.timeTbd ? '시각 미정' : hhmm(s.start));
const fmt = (n) => (typeof n === 'number' ? NF.format(n) : (n ?? '–').toLocaleString('ko-KR'));
// 점수 표기 (모든 점수표 공통): 순위 / 킬 / 종합 (= 순위 점수 / 킬 점수 / 종합 점수)
//   ALGS는 킬 1개 = 1점이라 킬 점수 = 킬 수, 순위 점수 = 종합 점수 − 킬 점수
//   새 점수표를 만들 때도 PTS_TH(머리글 3칸)·ptsTd(칸 3개)·ptsLine(문장)을 쓴다
//   표의 등수 칸은 '#'로 적어 '순위'(순위 점수) 칸과 헷갈리지 않게 한다
const ptsOf = (pts, kills) => ({ pp: pts != null && kills != null ? pts - kills : null, kp: kills ?? null, tp: pts ?? null });
// data-tr: 번역 사전 키 (메뉴의 '순위'(Standings)와 구분)
//   칸마다 pp(순위 점수)·kp(킬 점수)·tp(종합) 클래스
const PTS_TH = '<th class="r pts-h pp" title="순위 점수" data-tr="순위 점수 칸">순위</th><th class="r pts-h kp" title="킬 점수" data-tr="킬 점수 칸">킬</th><th class="r pts-h tp" title="종합 점수" data-tr="종합 점수 칸">종합</th>';
// place: 한 게임(매치)의 결과 표일 때 그 게임 순위. 1·2·3위의 종합 점수는 금·은·동 글자색(.m1 .m2 .m3)
const ptsTd = (pts, kills, place) => { const p = ptsOf(pts, kills); return `<td class="r num pp">${p.pp ?? '–'}</td><td class="r num kp">${p.kp ?? '–'}</td><td class="r num tp"><b${place >= 1 && place <= 3 ? ` class="m${place}"` : ''}>${p.tp ?? '–'}</b></td>`; };
const ptsLine = (pts, kills) => { const p = ptsOf(pts, kills); return p.pp == null ? `종합 ${p.tp ?? '–'}점` : `순위 ${p.pp} / 킬 ${p.kp} / 종합 ${p.tp}점`; };
// 게임별 점수 열 (G1, G2, …): 시리즈(단계)의 게임마다 팀의 그 게임 점수와 그 게임 순위·킬. 머리글은 게임 번호 + 지도 약자(누르면 그 게임 다시보기).
//   표가 충분히 넓으면(CSS 컨테이너 쿼리 .gview 720px 이상) 종합 점수 옆에 열로 늘 보인다.
//   팀 줄을 누르면 그 아래에 선수 명단(선수·코치)이 펼쳐지고, 좁으면(휴대폰) 열 대신 그 팀의 G1~G6 카드(지도·점수·순위·킬)도 함께 펼쳐진다(GOPEN, 다시 그려도 유지).
//   데이터는 공식 API 게임 통계(/stats/series/{id}/match/number/{n}: 팀별 points·kills·placement)를 그 시리즈를 보고 있을 때만, 넓은 화면이거나 팀 줄을 펼쳤을 때만 받는다.
//   끝난 게임은 다시 받지 않고, 끝난 시리즈는 브라우저에 저장해 둔다. 진행 중인 시리즈는 실시간 주기(livePollMs)로 새 게임·진행 중 게임을 받는다.
//   그 게임 1·2·3위 팀의 점수는 금·은·동 글자색. 열: 일반 경기는 g1~g6 고정(시리즈의 게임 수), 결승(Match Point Finals)은 게임이 진행될 때마다 g1부터 하나씩 생긴다.
const GAMES = {}; // 시리즈 ID → { by: { 게임 번호: { st, map, t: { 팀 ID: [점수, 킬, 순위, 순위 점수] } } }, settled, loading }
const GWATCH = new Map(); // 지금 화면에 있는 시리즈 ID → 시리즈
const gamesWide = () => window.matchMedia('(min-width: 800px)').matches;
const GOPEN = new Set(); // 휴대폰에서 펼친 팀 줄: '시리즈 ID|약칭'
const gamesWant = (x) => gamesWide() || [...GOPEN].some((k) => k.startsWith(x.id + '|'));
const GM_KEEP = 40; // 브라우저에 저장해 두는 끝난 시리즈 수
function gamesStored(id) { const v = store.get('gm:' + id, null); if (v?.by) GAMES[id] = { by: v.by, settled: true }; return !!GAMES[id]; }
async function loadGames(x) {
  const g = (GAMES[x.id] ||= { by: {}, settled: false });
  if (g.settled || g.loading) return;
  g.loading = true;
  try {
    const get = (u) => fetch(LIVE.api + u, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const m = await get(`/series/${x.id}/matches`);
    if (!m) return;
    const started = (m.matches || []).filter((y) => y.status === 'completed' || y.status === 'live' || y.inGameStatus === 'postmatch');
    const before = JSON.stringify(g.by);
    await Promise.all(started.filter((y) => g.by[y.matchNumber]?.st !== 'completed').map(async (y) => {
      const j = await get(`/stats/series/${x.id}/match/number/${y.matchNumber}`);
      if (!j?.teams?.length) return;
      g.by[y.matchNumber] = { st: y.status === 'completed' ? 'completed' : 'live', map: j.map?.name || y.map?.name || '', t: Object.fromEntries(j.teams.map((tm) => [tm.id, [tm.points ?? 0, tm.kills ?? 0, tm.placement ?? 0, tm.placementPoints ?? 0]])) };
    }));
    // 끝난 시리즈에서 시작한 게임이 모두 끝나 있으면 더 받지 않는다 (브라우저에 저장)
    if ((x.status === 'completed' && !x.live) && started.length && started.every((y) => g.by[y.matchNumber]?.st === 'completed')) {
      g.settled = true;
      const keys = store.get('gmKeys', []).filter((k) => k !== x.id); keys.push(x.id);
      while (keys.length > GM_KEEP) { try { localStorage.removeItem('algskr.gm:' + keys.shift()); } catch { keys.shift(); } }
      store.set('gmKeys', keys); store.set('gm:' + x.id, { by: g.by });
    }
    g.at = Date.now();
    if (before !== JSON.stringify(g.by) || g.settled) render();
  } finally { g.loading = false; }
}
(function gamesLoop() { setTimeout(() => { Promise.all([...GWATCH.values()].map((x) => (GAMES[x.id]?.settled ? null : loadGames(x)))).catch(() => {}).finally(gamesLoop); }, (C.livePollMs || 10000) + Math.random() * 3000); })();
// x: 시리즈, final: 결승이면 true. 열 정의 { n, th, td(short) } 또는 null(좁은 화면·아직 받지 못함·시작 전)
function gameCols(x, final) {
  if (!x?.id || FROZEN || !gamesOk(x) || !gamesWant(x)) return null;
  GWATCH.set(x.id, x);
  if (!GAMES[x.id] && !gamesStored(x.id)) { GAMES[x.id] = { by: {}, settled: false }; setTimeout(() => loadGames(x).catch(() => {}), 50); } // 처음 보면 바로 한 번 받는다
  const by = GAMES[x.id].by, nums = Object.keys(by).map(Number).sort((a, b) => a - b);
  if (!nums.length) return null;
  const N = final ? nums.at(-1) : Math.min(12, Math.max(x.matches || 6, nums.at(-1)));
  const idOf = (sh) => team(sh)?.id || A.xteams?.[sh]?.id || null;
  const th = Array.from({ length: N }, (_, i) => {
    const d = by[i + 1], lab = `G${i + 1}${d?.map ? `<small>${esc(poiInit(d.map))}</small>` : ''}`;
    return `<th class="c gc${d?.st === 'live' ? ' glive' : ''}"${d?.map ? ` title="G${i + 1} · ${esc(d.map)}"` : ''}>${d ? `<a href="${qsLink('/schedule/replay', new URLSearchParams(), { s: x.id, g: i + 1 })}">${lab}</a>` : lab}</th>`;
  }).join('');
  // 칸: 그 게임 점수(굵게) + 아래 작은 줄 'N위 K킬'. 1·2·3위는 금·은·동 바탕. 진행 중 게임은 순위 없이 지금까지의 킬 점수만
  const td = (sh) => { const id = idOf(sh); return Array.from({ length: N }, (_, i) => {
    const v = id && by[i + 1]?.t[id], live = by[i + 1]?.st === 'live';
    if (!v) return `<td class="c num gc muted${live ? ' glive' : ''}">–</td>`;
    const pl = v[2] >= 1 ? v[2] : 0;
    return `<td class="c num gc${pl && pl <= 3 && !live ? ' m' + pl : ''}${live ? ' glive' : ''}" title="${pl ? `${pl}위 · ` : ''}킬 ${v[1]} · 순위 점수 ${v[3]}"><b>${v[0]}</b><small>${pl && !live ? `${pl}위 ` : ''}${v[1]}킬</small></td>`;
  }).join(''); };
  // 휴대폰 펼침: 그 팀의 게임 카드 (지도 · 점수 · 순위 · 킬). 시작 안 한 게임은 흐리게
  const det = (sh) => { const id = idOf(sh); return `<div class="gx-grid">${Array.from({ length: N }, (_, i) => {
    const d = by[i + 1], v = id && d?.t[id], live = d?.st === 'live', pl = v && v[2] >= 1 ? v[2] : 0;
    const head = `<span class="gx-h">${live ? '<i class="gx-dot" aria-label="LIVE"></i>' : ''}G${i + 1}${d?.map ? ` <small>${esc(d.map)}</small>` : ''}</span>`;
    if (!v) return `<span class="gx-c none">${head}<b>–</b><small>${d ? '기록 없음' : '시작 전'}</small></span>`;
    return `<a class="gx-c${pl && pl <= 3 && !live ? ' m' + pl : ''}${live ? ' glive' : ''}" href="${qsLink('/schedule/replay', new URLSearchParams(), { s: x.id, g: i + 1 })}">${head}<b>${v[0]}<small>점</small></b><small>${pl && !live ? `${pl}위 ` : live ? '진행 중 ' : ''}${v[1]}킬</small></a>`;
  }).join('')}</div>`; };
  return { n: N, th, td, det };
}
window.matchMedia('(min-width: 800px)').addEventListener?.('change', () => render()); // 화면 폭이 넓어지면 게임별 점수를 받아 보여 준다
// 게임별 점수를 보여 줄 수 있는 시리즈인가 (시작했거나 끝남)
const gamesOk = (x) => !!(x?.id && !FROZEN && (x.results?.length || x.live || x.status === 'live' || x.status === 'completed'));
// 점수표를 감싸는 틀(.gview, 컨테이너): 게임 1·2·3위 범례 + 표. 좁으면 팀 줄을 눌러 게임별 카드를 펼친다는 안내
function gview(x, G, table) {
  if (!gamesOk(x)) return table;
  const key = '<span class="gv-key"><i class="m1"></i><i class="m2"></i><i class="m3"></i> 게임 1·2·3위</span><span class="gv-key">게임 점수 = 순위 점수 + 킬(1킬 1점)</span>';
  return `<div class="gview${G ? ' has-g' : ''}"><div class="gv-bar"><span class="gv-tip n">팀을 누르면 선수·게임별 점수</span><span class="gv-tip w">팀을 누르면 선수 명단</span>${G ? key : ''}</div>${table}</div>`;
}
// 게임별 펼침 줄: 팀 줄 바로 아래. 넓은 화면에서는 CSS가 숨긴다. G가 없으면(아직 받는 중) 안내
//   선수 명단: LCQ는 조 편성과 같은 자료(rosterLine: 프로리그는 공식 로스터, 2부는 Liquipedia 참가 명단), 그 밖은 프로리그 공식 로스터. 없으면 없다고 적는다
const gxRoster = (B, sh) => { const t = B?.E?.list?.find((y) => y.short === sh) || { pl: !!team(sh), short: sh }; return rosterLine(t, B?.ev || {}) || '<small class="lcq-roster muted">선수 명단 정보가 없습니다.</small>'; };
//   cls: 팀 줄과 같은 강조(한국 팀·응원 팀 바탕·왼쪽 막대)와 컷 줄. 펼치면 컷 선이 팀 줄과 내역 사이가 아니라 내역 아래에 온다
const gxRow = (B, x, G, sh, open, cls = '') => `<tr class="gdet ${cls}"${open ? '' : ' hidden'}><td colspan="99"><div class="gx-ros">${open ? gxRoster(B, sh) : ''}</div><div class="gx-games">${G ? G.det(sh) : '<p class="gx-wait">게임별 점수를 받는 중…</p>'}</div></td></tr>`;
const gxAttr = (x, sh) => (gamesOk(x) && sh ? ` data-gx="${x.id}|${esc(sh)}" tabindex="0" aria-expanded="${GOPEN.has(x.id + '|' + sh)}"` : '');
const gxOpen = (x, sh) => !!(x?.id && GOPEN.has(x.id + '|' + sh));
// 키보드: 팀 줄에서 Enter·Space로 펼치기
document.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('tr[data-gx]')) { e.preventDefault(); e.target.click(); } });
document.addEventListener('click', (e) => {
  const tr = e.target.closest?.('tr[data-gx]');
  if (!tr || e.target.closest('a, button')) return;
  const k = tr.dataset.gx;
  if (GOPEN.has(k)) GOPEN.delete(k); else GOPEN.add(k);
  const det = tr.nextElementSibling;
  if (det?.classList.contains('gdet')) { det.hidden = !GOPEN.has(k); tr.setAttribute('aria-expanded', String(GOPEN.has(k))); if (!det.hidden) pulseCls(det, 'anim-open', 400); }
  render(); // 처음 펼치면 게임 기록을 받기 시작한다 (받은 뒤 다시 그려 채운다)
});
const REGION = { 'apac-n': 'APAC North', 'apac-s': 'APAC South', emea: 'EMEA', americas: 'Americas', global: '국제전' };
const PHASE_KO = {
  'Group Stage': '조별 리그', 'Bracket Stage': '브래킷', 'Match Point Finals': '매치 포인트 결승', 'Survival Stage': '서바이벌 스테이지',
  'Winners Round': '승자 라운드', 'Elimination Round 1': '패자부활 1라운드', Eliminated: '탈락', 'Elimination Round 2': '패자부활 2라운드',
  'Winners Round 1 Lobby A': '승자 1라운드 그룹 A', 'Winners Round 1 Lobby B': '승자 1라운드 그룹 B', 'Winners Round 2': '승자 2라운드',
  'Regional Finals': '리전 결승', 'Split 2 Pro League': '정규 시즌', 'Split 1 Pro League': '정규 시즌',
};
const EVENT_KO = { 'Split 2 Playoffs': 'Split 2 플레이오프', 'Split 1 Playoffs at EWC': 'Split 1 플레이오프', 'Split 2 Pro League': 'Split 2 프로리그', 'Split 1 Pro League': 'Split 1 프로리그', 'Last Chance Qualifier': 'LCQ', Championship: '챔피언십' };
// 사전에 없는 이름은 규칙으로: 'Split N Pro League'(단계 이름이면 정규 시즌), 'Split N Playoffs …'
const ko = (s, map) => {
  s = s || '';
  if (map[s]) return map[s];
  if (map === PHASE_KO && /^Split \d Pro League$/.test(s)) return '정규 시즌';
  if (map === EVENT_KO) s = s.replace(/^Split (\d) Playoffs.*$/, 'Split $1 플레이오프').replace(/^Split (\d) Pro League$/, 'Split $1 프로리그');
  return s.replace(/^Group ([A-D]) vs ([A-D])$/, '$1조 vs $2조');
};
const team = (short) => A.teams[short];
// 공식 API 응답의 팀 → 사이트 약칭. 2부 팀 가운데 약칭이 프로리그 팀과 겹쳐 빌드가 바꾼 팀(GROW·BURG·FIH·VE·AURA2 등, A.shortFix: 팀 ID → 약칭)은
//   브라우저가 공식 API를 직접 받을 때(실시간 점수·명단·다시보기)도 같은 약칭을 써야 다른 팀으로 보이지 않는다
const apiShort = (t) => (t && (A.shortFix?.[t.teamId] || A.shortFix?.[t.id])) || t?.shortName || '';
// 프로리그 밖 팀(LCQ 챌린저 서킷 팀): 이름·로고만 있고 팀 페이지는 없다
const xteam = (short) => A.teams[short] || A.xteams?.[short];
const krOf = (short) => lvlOf(short);
const KR_LABEL = { team: '한국 팀', member: '한국 선수 소속', coach: '한국 코치 팀' };
// 색 구분: 빨강 = 한국 팀(한국 선수 2명 이상), 주황 = 한국 선수 소속(1명), 파랑 = 한국 코치 팀(선수 없이 코치만)
// 한국 선수와 한국 코치가 모두 있는 팀은 한국 선수 기준(빨강·주황)으로만 표시한다.
const CAT = { team: 'k-team', member: 'k-member', coach: 'k-coach' };
const krDot = (lvl0, short) => {
  const lvl = short ? lvlOf(short) : lvl0;
  if (!lvl || lvl === 'none') return '';
  return `<span class="krdot ${CAT[lvl]}" title="${short && outsider(short) ? '대표 응원 팀' : opt.mode === 'kr' ? KR_LABEL[lvl] : ML().label}"></span>`;
};
const rowCls = (r) => { const l = r.short ? lvlOf(r.short) : r.kr; return l && l !== 'none' ? `kr ${CAT[l]}${mainId() && A.teams[r.short]?.id === mainId() ? ' main' : ''}` : ''; };
const coachBadge = () => '';
const LP_SEASON = () => A.meta?.lpSeason || 'https://liquipedia.net/apexlegends/ALGS';
// 공식 경기 페이지가 있는 이벤트(슬러그가 사람이 읽는 이름)는 algs.ea.com, 없으면(LCQ 등) Liquipedia 시즌 페이지
const officialUrl = (s) => (/^[a-z][a-z0-9-]+$/.test(s.eventSlug || '') && s.eventSlug !== 'last-chance-qualifier' ? `https://algs.ea.com/en/${seasonSlug()}/${s.eventSlug}/match/${s.id}` : LP_SEASON());
const olink = (url, label) => `<a class="olink" href="${esc(url)}" target="_blank" rel="noopener">${label}</a>`;
// 팀 로고 (없으면 약칭 상자). dark: 어두운 배경 위에 놓일 때
// LOGO_PX: 크기별 화면 표시 너비(CSS px). 큰 로고(xl)는 큰 화면 확대(zoom)까지 생각해 넉넉히
const LOGO_PX = { '': 18, lg: 30, xl: 100 };
// 같은 로고를 쓰는 팀(RIDDLEORDER ZERO·ONE, 본 팀과 아카데미)은 화면에 표시를 덧붙이지 않고
//   로고 그림 자체에 구분 띠를 넣은 파일을 logos-src/ 에 둔다 (logos-src/README.md)
const logo = (short, cls = '', dark) => {
  const lg = xteam(short)?.logo;
  const d = dark ?? document.documentElement.dataset.theme === 'dark';
  // 공식 로고: [0] logoLight = 흰 로고(어두운 배경용), [1] logoDark = 어두운 로고(밝은 배경용).
  // 배경에 맞는 쪽이 없으면 다른 쪽을 반대색 판 위에 올려 보이게 한다. 둘 다 없으면 약칭 배지
  if (!lg || (!lg[0] && !lg[1])) return `<span class="tlogo ph ${cls}" aria-hidden="true">${esc(String(short || '?').slice(0, 4))}</span>`;
  const src = d ? lg[0] || lg[1] : lg[1] || lg[0];
  const plate = d ? (lg[0] ? '' : ' plate-light') : (lg[1] ? '' : ' plate-dark');
  const fail = `onerror="this.outerHTML='<span class=&quot;tlogo ph ${cls}&quot;>${esc(String(short || '?').slice(0, 4))}</span>'"`;
  // 새 로고(logos/t/…): 64px·160px WebP 두 장 중 표시 크기 × 화면 배율에 맞는 쪽을 브라우저가 고른다
  if (/^logos\/t\//.test(src)) return `<img class="tlogo ${cls}${plate}" src="${esc(src)}-64.webp" srcset="${esc(src)}-64.webp 64w, ${esc(src)}-160.webp 160w" sizes="${LOGO_PX[cls] || 30}px" alt="" loading="lazy" decoding="async" ${fail}>`;
  return `<img class="tlogo ${cls}${plate}" src="${esc(src)}" alt="" loading="lazy" decoding="async" ${fail}>`;
};
const D2 = '<span class="tag d2" title="2부 리그(챌린저 서킷) 팀">2부</span>';
const teamLink = (short, label) => (team(short) ? `<a class="tl" href="#/teams/${encodeURIComponent(short)}">${logo(short)}<span>${esc(label || short)}</span></a>`
  : A.xteams?.[short] ? `<span class="tl" title="${esc(A.xteams[short].name)}">${logo(short)}<span>${esc(label || A.xteams[short].name)}</span></span>${A.xteams[short].d2 ? ' ' + D2 : ''}` : esc(label || short));
const now = () => Date.now();
function until(iso) {
  const ms = new Date(iso) - now();
  if (ms <= 0) return null;
  const h = Math.floor(ms / 3.6e6), m = Math.floor((ms % 3.6e6) / 6e4);
  return h >= 48 ? `${Math.floor(h / 24)}일 후` : h ? `${h}시간 ${m}분 후` : `${m}분 후`;
}
// 공식 API에 없는 일정 (config/overrides.json schedExtra → A.extras): POI 드래프트 등. 시작 3시간 뒤 '예정'에서 빠진다
const XKIND = { 'poi-draft': ['POI 드래프트', '낙하 지점(POI) 선택 시작'] };
const XEVENT = { lcq: 'LCQ', playoffs: '플레이오프', champs: '챔피언십' };
const extrasUpcoming = () => (A.extras || []).filter((x) => now() - new Date(x.start) < 3 * 3600e3);
const extraName = (x) => x.name || XKIND[x.kind]?.[0] || '일정';
function isKrExtra(x) { if (!x.region) return true; const regions = new Set(focusList().map((k) => team(k.short)?.region)); return opt.mode === 'kr' ? x.region === 'apac-n' : ML().region ? x.region === ML().region : regions.has(x.region); }
function extraItem(x) {
  const started = new Date(x.start) <= now();
  return `<article class="match extra">
    <time datetime="${x.start}">${hhmm(x.start)}</time>
    <div><div class="what">${esc(extraName(x))} <span class="tag xk">${started ? '진행 중' : '경기 아님'}</span>${isKrExtra(x) && x.region ? ` <span class="tag kr">${ML().tag}</span>` : ''}</div>
      <div class="meta">${esc([XEVENT[x.event], REGION[x.region], XKIND[x.kind]?.[1], started ? '' : until(x.start)].filter(Boolean).join(', '))}</div></div>
  </article>`;
}
// 시리즈와 추가 일정을 시각 순으로 섞어 그린다
const timedItems = (series, extras, o) => [...series.map((s) => ({ t: s.start, h: () => matchItem(s, o) })), ...extras.map((x) => ({ t: x.start, h: () => extraItem(x) }))].sort((a, b) => a.t.localeCompare(b.t)).map((o) => o.h()).join('');
const seriesState = (s) => s.status === 'completed' ? '종료' : s.live || s.status === 'live' ? 'LIVE' : s.timeTbd ? '시각 미정' : until(s.start) || '시작 대기';

/* ---------- 라우터 ---------- */
function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs] = raw.split('?');
  return { parts: path.split('/').filter(Boolean), q: new URLSearchParams(qs || '') };
}
const qsLink = (path, q, patch) => { const p = new URLSearchParams(q); for (const [k, v] of Object.entries(patch)) (v == null ? p.delete(k) : p.set(k, v)); const t = p.toString(); return `#${path}${t ? '?' + t : ''}`; }; // 값이 null이면 그 항목을 뺀다

// 페이지마다 다른 제목: 탭·기록·공유 시트에 어느 화면인지 보인다 (예: 'RIDDLEORDER ZERO · 팀 · EASY ALGS KR')
const TAB_NAME = { schedule: '경기', standings: '순위', points: '포인트', teams: '팀', players: '팀', streams: '방송', rules: '규칙' };
function setPageTitle(parts, q) {
  const tab = parts[0] || 'home';
  if (tab === 'home') { document.title = `${I.info.brand} · ${I.info.title}`; return; }
  let head = '';
  if ((tab === 'teams' || tab === 'players') && parts[1]) head = app.querySelector('h1')?.textContent.trim() || '';
  else head = app.querySelector('.subtabs [aria-current="page"]')?.textContent.trim() || '';
  if (head && tab === 'standings' && lcqEvents().length && !champsMain() && !intlCurrent() && !['past', 'champs'].includes(parts[1])) { // LCQ는 지역까지
    const r = lcqEvents().some((e) => e.region === q.get('r')) ? q.get('r') : lcqRegionDefault();
    head = `${head} ${I.t(REGION[r] || '')}`.trim();
  }
  const name = I.t(TAB_NAME[tab] || '');
  document.title = [head, head === name ? '' : name, I.info.brand].filter(Boolean).join(' · ');
}
// 링크 공유: 주소를 '#'·'?'·'&'·'=' 없는 경로로 만든다 (DC인사이드 같은 게시판은 그 뒤를 잘라 버리고, 미리보기 수집기도 '#' 뒤를 못 읽는다).
//   …/s/standings/-/r/emea/m/a/pm/storm-point/  = 화면 경로 + '-' + 이름/값 쌍. 언어(브라우저 기본과 다를 때 lang)·지난 시즌(y)도 같은 쌍으로 담는다.
//   자주 공유되는 화면은 빌드(scripts/share.mjs)가 실제 파일로 만들어 두고(미리보기 카드 있음), 나머지는 site/404.html 이 풀어 준다.
//   경로 규칙(sharePath)은 scripts/share.mjs 의 같은 이름 함수와 반드시 같아야 한다.
const SHARE_ORDER = ['r', 'm', 'pm'];
const shareSeg = (s) => encodeURIComponent(String(s)).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
function sharePath(parts, pairs) {
  const ps = pairs.slice().sort((a, b) => { const i = SHARE_ORDER.indexOf(a[0]), j = SHARE_ORDER.indexOf(b[0]); return (i < 0 ? 99 : i) - (j < 0 ? 99 : j) || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0); });
  return [...parts.map(shareSeg), ...(ps.length ? ['-', ...ps.flatMap(([k, v]) => [shareSeg(k), shareSeg(v)])] : [])].join('/');
}
function shareUrl() {
  const { parts, q } = parseHash();
  const root = new URL('./', location.href); root.search = ''; root.hash = '';
  const pairs = [...q].filter(([k]) => k !== 'play').map(([k, v]) => [k, k === 'pm' ? poiSlug(v) : v]); // 재생 중인 방송(play)은 순간 상태라 뺀다. 지도 이름은 경로에 쓸 수 있게 소문자·하이픈으로
  // LCQ 화면: 지금 보는 지역·경기·지도를 주소에 명시한다 (안 그러면 받는 사람이 여는 때의 기본 탭으로 열린다)
  if (parts[0] === 'standings' && (!parts[1] || parts[1] === 'lcq') && app.querySelector('.lcq-tabs')) { // (챔피언십 등 다른 순위 화면은 제외)
    for (const [sel, key] of [['.controls .seg a[aria-current="true"]', 'r'], ['.lcq-tabs a[aria-current="true"]', 'm'], ['.poi .seg a[aria-current="true"]', 'pm']]) {
      const v = new URLSearchParams((app.querySelector(sel)?.getAttribute('href') || '').split('?')[1] || '').get(key);
      if (v && !pairs.some(([k]) => k === key)) pairs.push([key, key === 'pm' ? poiSlug(v) : v]);
    }
  }
  // 언어: 이 브라우저의 기본 언어(i18n.js detect 와 같은 규칙)와 다를 때만 담는다. 같으면 받는 사람이 자기 언어로 보고, 링크는 미리보기 카드가 있는 짧은 형태로 남는다
  const auto = (() => { const n = String((navigator.languages && navigator.languages[0]) || navigator.language || 'ko').toLowerCase(); return n.startsWith('ko') ? 'ko' : n.startsWith('ja') ? 'ja' : 'en'; })();
  if (I.lang !== auto) pairs.push(['lang', I.lang]);
  const y = new URLSearchParams(location.search).get('y'); if (y) pairs.push(['y', y]);
  return parts.length || pairs.length ? `${root.href}s/${sharePath(parts, pairs)}/` : root.href;
}
let toastT = 0;
function toast(msg) {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; el.setAttribute('role', 'status'); document.body.append(el); }
  el.textContent = I.t(msg); el.hidden = false;
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show'))); // 나타남: 아래에서 살짝 올라온다
  clearTimeout(toastT); toastT = setTimeout(() => { el.classList.remove('show'); toastT = setTimeout(() => { el.hidden = true; }, 200); }, 2200);
}
async function sharePage() {
  const url = shareUrl();
  if (navigator.share) { try { await navigator.share({ title: document.title, url }); return; } catch (e) { if (e?.name === 'AbortError') return; } } // 휴대폰: 공유 시트. 취소하면 그대로 끝
  try { await navigator.clipboard.writeText(url); toast('링크를 복사했습니다'); } catch { window.prompt(I.t('아래 주소를 복사하세요'), url); }
}

let lastHtml = '', lastHash = null, lastHashPrev = null;
// 펼쳐야 보이는 내용(포인트 표의 팀·선수별 내역 등)은 펼칠 때 만든다: 표를 그릴 때 수천 줄을 미리 만들지 않는다
//   틀 안에서 ${lazy(() => html)} 를 속성 자리에 쓰면 data-lazy 번호가 붙고, 펼칠 때 fillLazy 가 채운다
let LAZY = [], lazyNext = [];
let RGEN = 0; // 그리기 번호 (render 마다 1씩): 한 번 그리는 동안만 쓰는 계산 저장용
const lazy = (make) => ` data-lazy="${lazyNext.push(make) - 1}"`;
// 접힌 <details class="lz"> 는 펼칠 때 채운다 (toggle 은 거품이 안 올라와 잡기 단계에서 받는다)
app.addEventListener('toggle', (e) => { if (e.target.open && e.target.matches?.('details.lz')) fillLazy(e.target); }, true);
// 접힌 항목을 사용자가 펼치면 내용이 살짝 내려오며 나타난다 (요약 줄을 누를 때만: 다시 그릴 때 열린 채로 생긴 항목은 움직이지 않는다)
document.addEventListener('click', (e) => { const sm = e.target.closest?.('details > summary'); const d = sm?.parentElement; if (d && !d.open) pulseCls(d, 'anim-open', 400); });
function fillLazy(root) {
  for (const el of root.matches?.('[data-lazy]') ? [root] : root.querySelectorAll('[data-lazy]')) {
    const make = LAZY[+el.dataset.lazy]; el.removeAttribute('data-lazy');
    if (make) { el.innerHTML = make(); I.tree(el); }
  }
}
// 부분 갱신 (순위 탭 전용). 지난번 그린 HTML(번역 전)과 새 HTML을 같은 자리끼리 견주어, 같은 조각은 그대로 두고 다른 조각만 새것으로 바꾼다.
//   속성까지 같은 상자(div·section 등)는 안으로 들어가 더 작은 조각만 바꾸고, 글자 조각이 다르거나 자식 수가 다르면 그 상자를 통째로 바꾼다.
//   bind() 가 이벤트를 다는 요소가 바뀐 조각에 있으면(중복으로 달리지 않게) 하지 않고 전부 다시 그린다. 계획을 다 세운 뒤에만 바꾸므로 실패해도 화면은 그대로다.
let lastTpl = null;
const BIND_SEL = '[data-toggle],[data-unclip],[data-st-retry],[data-reveal],[data-mode],[data-fav],[data-main],[data-fav-clear],[data-rp-retry],button.lv-card,button.lv-add,button.yt,#teamSearch,#favSearch,#lvPlayer,#rpSeries,#rpSlider';
function patchApp(html) {
  if (!lastTpl) return false;
  const tpl = document.createElement('template'); tpl.innerHTML = html;
  const ops = [];
  const sameAttrs = (a, b) => a.attributes.length === b.attributes.length && [...a.attributes].every((x) => b.getAttribute(x.name) === x.value);
  const plan = (dom, old, nu, depth) => {
    const D = dom.childNodes, O = old.childNodes, N = nu.childNodes;
    if (D.length !== O.length || O.length !== N.length) return false;
    for (let i = 0; i < N.length; i++) {
      const o = O[i], n = N[i], d = D[i];
      if (o.isEqualNode(n)) continue;
      if (n.nodeType !== 1 || o.nodeType !== 1 || d.nodeType !== 1 || d.tagName !== n.tagName) return false;
      if (depth < 6 && o.tagName === n.tagName && sameAttrs(o, n) && !/^(TABLE|TBODY|THEAD|TR|SVG|svg|UL|OL)$/.test(n.tagName)) {
        const mark = ops.length;
        if (plan(d, o, n, depth + 1)) continue;
        ops.length = mark;
      }
      if (n.matches(BIND_SEL) || n.querySelector(BIND_SEL)) return false;
      ops.push([d, n]);
    }
    return true;
  };
  if (!plan(app, lastTpl.content, tpl.content, 0) || !ops.length) return false;
  const mark = ops.length <= 20; // 한꺼번에 많이 바뀌면(게임이 끝나 표 전체가 바뀔 때 등) 강조하지 않는다
  for (const [d, n] of ops) {
    const c = n.cloneNode(true); d.replaceWith(c); I.tree(c); stickInit(c.parentElement || app);
    if (mark && c.nodeType === 1 && !c.matches('table, .poi, .poi-fig') && !c.querySelector('table, .poi-pin') && c.textContent.length <= 160) pulseCls(c, 'upd', 1000, true);
  }
  lastTpl = tpl;
  return true;
}
let lastNav = null;
/* ---------- 화면 전환 애니메이션 (docs/transitions-plan.md) ----------
   사용자가 바꿨을 때만 움직인다: 주소 이동(hashchange)·보기 모드·응원 팀 같은 직접 조작에서만 animNext 를 세우고,
   render() 가 그린 직후 #app 에 anim-* 클래스를 잠깐 붙인다. 주기적 갱신(점수·방송·데이터)으로 다시 그릴 때는 붙지 않는다.
   기기의 '동작 줄이기' 또는 설정의 '애니메이션 줄이기'(html.no-motion)면 움직이지 않는다 (CSS 도 같은 조건) */
let animNext = null, animT = 0;
const motionOK = () => !document.documentElement.classList.contains('no-motion') && !matchMedia('(prefers-reduced-motion: reduce)').matches;
const ANIM_CLS = ['anim-page', 'anim-sub', 'anim-soft'];
function animApp(kind) {
  if (!kind || !motionOK()) return;
  clearTimeout(animT);
  app.classList.remove(...ANIM_CLS, 'anim-poi');
  void app.offsetWidth; // 같은 효과를 이어서 다시 시작할 수 있게
  const pins = kind === 'soft' ? [] : [...app.querySelectorAll('.poi-pin')];
  pins.forEach((el, i) => el.style.setProperty('--i', String(Math.min(i, 40))));
  app.classList.add(`anim-${kind}`, ...(pins.length ? ['anim-poi'] : []));
  animT = setTimeout(() => app.classList.remove(...ANIM_CLS, 'anim-poi'), pins.length ? 260 + Math.min(pins.length, 40) * 15 : 420);
}
// 한 요소에 한 번만 도는 효과: 클래스를 붙였다가 끝나면 뗀다 (색 강조는 동작 줄이기에서도 남긴다)
function pulseCls(el, cls, ms = 600, always = false) {
  if (!el || (!always && !motionOK())) return;
  el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
  clearTimeout(el._pc); el._pc = setTimeout(() => el.classList.remove(cls), ms);
}
// POI 드래프트 진행 중 새로 생긴 핀만 강조한다 (같은 주소에서 다시 그릴 때)
let poiPinSeen = null;
function markNewPins(sameAddr) {
  const pins = [...app.querySelectorAll('.poi-pin[data-n]')];
  const keys = pins.map((p) => `${p.closest('.poi')?.querySelector('.poi-base')?.getAttribute('src') || ''}|${p.dataset.n}`);
  if (sameAddr && poiPinSeen && motionOK()) pins.forEach((p, i) => { if (!poiPinSeen.has(keys[i])) pulseCls(p, 'pin-new', 900); });
  poiPinSeen = pins.length ? new Set(keys) : null;
}
const H_SCROLL = ['.subtabs-in', '.seg', '.kr-strip'];
function render() {
  applyTeamTheme();
  const an = animNext; animNext = null;
  lazyNext = []; poiWatch = null; GWATCH.clear(); RGEN++;
  const { parts, q } = parseHash();
  const tab = parts[0] || 'home';
  const navTab = tab === 'players' ? 'teams' : tab;
  document.querySelectorAll('.tabbar a').forEach((a) => { if (a.dataset.tab === navTab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  board();
  const view = { home, schedule, standings, points, teams, streams, rules, players: playerView }[tab] || home;
  // 지난 시즌 기록을 볼 때: 본문 맨 위에 어느 시즌인지와 돌아가는 링크
  const bar = FROZEN ? `<div class="season-bar" id="seasonBar"><span><b>${esc(A.season.name)}</b> <span>지난 시즌 기록을 보고 있습니다.</span></span> <a href="./">현재 시즌으로</a></div>` : '';
  // 페이지 머리(작은 윗줄 + 제목) → 세부 메뉴(알약) → 본문 순서로 모든 화면이 같은 틀을 쓴다
  const sub = subtabs(navTab, tab === 'players' ? ['teams', 'x'] : parts, q);
  let body = view(parts, q), head = '';
  const hm = /^<h1 class="title">[^<]*<\/h1>/.exec(body);
  if (hm) { head = `<header class="ph"><p class="ph-eyebrow"><span>${esc(A.season.name)}</span>${sub.cur ? ` <i>/</i> <span>${esc(sub.cur)}</span>` : ''}</p>${hm[0]}</header>`; body = body.slice(hm[0].length); }
  const html = head + sub.html + bar + body;
  if (!poiWatch) poiAsked = null; // POI 드래프트 구역을 떠났으면, 다시 열 때 바로 확인하도록
  // 주기적 갱신(데이터 확인·방송 상태·홈 카운트다운)으로 다시 불렸는데 내용이 그대로면 화면을 건드리지 않는다: 스크롤·펼친 항목·재생이 유지되고 그리는 비용도 없다
  if (html === lastHtml && location.hash === lastHash && app.firstChild) return;
  // 순위 탭을 보는 중 주기적 갱신(같은 주소)으로 내용 일부만 바뀌었으면 바뀐 조각만 바꾼다 (POI 핀 툴팁·지도 위치·펼친 항목 유지). 못 하면 아래처럼 전부 다시 그린다
  if (tab === 'standings' && location.hash === lastHash && app.firstChild && patchApp(html)) { lastHtml = html; LAZY = lazyNext; fitRing(); setPageTitle(parts, q); markNewPins(true); return; }
  lastTpl = null;
  lastHtml = html; lastHash = location.hash; LAZY = lazyNext;
  const keep = ['teamSearch', 'favSearch'].map((id) => [id, document.getElementById(id)?.value]).filter(([, v]) => v);
  // 가로로 스크롤되는 줄(세부 메뉴·보기 버튼·팀 칩): 같은 탭 안에서 다시 그릴 때 스크롤 위치를 유지한다 (휴대폰에서 메뉴를 밀어 둔 뒤 누르면 처음으로 돌아가던 문제)
  const sameTab = navTab === lastNav; lastNav = navTab;
  const sameAddr = location.hash === lastHashPrev; lastHashPrev = location.hash;
  const hx = sameTab ? H_SCROLL.map((sel) => [...app.querySelectorAll(sel)].map((el) => el.scrollLeft)) : null;
  app.innerHTML = html;
  if (tab === 'standings') { lastTpl = document.createElement('template'); lastTpl.innerHTML = html; }
  if (hx) H_SCROLL.forEach((sel, i) => app.querySelectorAll(sel).forEach((el, j) => { if (hx[i][j]) el.scrollLeft = hx[i][j]; }));
  // 고른 세부 메뉴가 화면 밖이면 보이는 곳까지만 민다
  { const on = app.querySelector('.subtabs [aria-current="page"]'), bar = on?.closest('.subtabs-in');
    if (bar) { const l = on.offsetLeft - bar.offsetLeft, r = l + on.offsetWidth, go = (x) => (an && motionOK() ? bar.scrollTo({ left: x, behavior: 'smooth' }) : (bar.scrollLeft = x));
      if (l < bar.scrollLeft) go(l - 16); else if (r > bar.scrollLeft + bar.clientWidth) go(r - bar.clientWidth + 16); } }
  bind();
  for (const [id, v] of keep) { const el = document.getElementById(id); if (el) { el.value = v; el.dispatchEvent(new Event('input')); } } // 데이터 갱신으로 다시 그려도 검색어 유지
  I.tree(app);
  // 가로로 넘치는 LCQ 경기 탭: 고른 탭이 보이게
  const on = app.querySelector('.lcq-tabs [aria-current="true"]');
  if (on) { const bar = on.closest('.lcq-tabs'); bar.scrollLeft = on.offsetLeft - (bar.clientWidth - on.offsetWidth) / 2; }
  { const ps = app.querySelector('.poi-scroll.big'); if (ps) ps.scrollLeft = (ps.scrollWidth - ps.clientWidth) / 2; } // POI 지도 크게 보기: 가운데부터
  fitRing();
  setPageTitle(parts, q);
  markNewPins(sameAddr);
  animApp(an === 'nav' ? (sameTab ? 'sub' : 'page') : an);
}

/* ---------- 세부 탭 (각 탭 안의 하위 분류) ---------- */
// [이름, 주소, 지금 보고 있는지]
function subtabs(tab, parts, q) {
  const g = q.get('g') || 'all', sv = q.get('s') || 'all';
  const SUB = {
    schedule: [['예정 경기', '#/schedule', parts[1] !== 'replay' && q.get('view') !== 'results'], ['지난 결과', '#/schedule?view=results', parts[1] !== 'replay' && q.get('view') === 'results'], ['게임 다시보기', '#/schedule/replay', parts[1] === 'replay']],
    standings: champsMain()
      ? [['챔피언십', '#/standings', parts[1] !== 'past'], ['이전 결과', '#/standings/past', parts[1] === 'past']]
      : intlCurrent()
      ? [['결승', '#/standings/finals', parts[1] === 'finals'], ['브래킷', '#/standings/bracket', parts[1] === 'bracket' || (!parts[1] && !finalsFirstTab())], ['조별 리그', '#/standings/group', parts[1] === 'group'],
        ...(champsTab() ? [['챔피언십', '#/standings/champs', parts[1] === 'champs']] : []), ['이전 결과', '#/standings/past', parts[1] === 'past']]
      : [[lcqEvents().length ? 'LCQ' : '진행 중', '#/standings', !['past', 'champs'].includes(parts[1])], ...(champsTab() ? [['챔피언십', '#/standings/champs', parts[1] === 'champs']] : []), ['이전 결과', '#/standings/past', parts[1] === 'past']],
    points: [['챔피언십 포인트', '#/points/cp', !['pl', 'events'].includes(parts[1])], ['대회별 CP 내역', '#/points/events', parts[1] === 'events'], ['프로리그 포인트', '#/points/pl', parts[1] === 'pl']],
    teams: [['전체', '#/teams', !parts[1] && g === 'all'], [ML().group, '#/teams?g=kr', g === 'kr'], ...['apac-n', 'apac-s', 'emea', 'americas'].filter((r) => r !== ML().region).map((r) => [REGION[r], `#/teams?g=${r}`, g === r]), ['로스터 변경', '#/teams?g=moves', g === 'moves']],
    streams: [['전체', '#/streams', sv === 'all'], ...(C.streamsUrl ? [['방송 중·영상', '#/streams?s=live', sv === 'live']] : []), ['ALGS 멀티뷰', '#/streams?s=mv', sv === 'mv'], ['공식 중계', '#/streams?s=official', sv === 'official'], ['선수·코치', '#/streams?s=players', sv === 'players'], ...(A.streams.creators?.length ? [['스트리머', '#/streams?s=creators', sv === 'creators']] : [])],
    rules: [['전체', '#/rules', sv === 'all'], ['영상', '#/rules?s=video', sv === 'video'], ['대회 방식', '#/rules?s=format', sv === 'format'], ['점수·포인트', '#/rules?s=points', sv === 'points']],
  }[tab];
  if (!SUB) return { html: '', cur: '' };
  const cur = (SUB.find((x) => x[2]) || [])[0] || '';
  return { cur, html: `<nav class="subtabs" aria-label="세부 메뉴"><div class="subtabs-in">${SUB.map(([n, h, on]) => `<a href="${h}"${on ? ' aria-current="page"' : ''}>${esc(n)}</a>`).join('')}</div></nav>` };
}

/* ---------- 국제전 브래킷 (Playoffs·Championship 공통 형식) ---------- */
// 조별 리그 40팀 → 상위 20 승자 라운드 / 하위 20 패자부활 1R
// 승자 라운드: 상위 10 결승, 하위 10 패자부활 2R / 패자부활 1R: 상위 10 패자부활 2R, 하위 10 탈락
// 패자부활 2R: 상위 10 결승, 하위 10 탈락 / 매치 포인트 결승 20팀
const STAGES = [
  { key: 'gs', ko: '조별 리그', n: 40 },
  { key: 'wr', name: 'Winners Round', ko: '승자 라운드', n: 20, cut: 10, up: '결승 진출', down: '패자부활 2R로' },
  { key: 'er1', name: 'Elimination Round 1', ko: '패자부활 1라운드', n: 20, cut: 10, up: '패자부활 2R 진출', down: '탈락' },
  { key: 'er2', name: 'Elimination Round 2', ko: '패자부활 2라운드', n: 20, cut: 10, up: '결승 진출', down: '탈락' },
  { key: 'f', name: 'Match Point Finals', ko: '매치 포인트 결승', n: 20 },
];
function bracket(ev = A.intl) {
  if (!ev?.eventId) return null;
  const ss = A.series.filter((s) => s.eventId === ev.eventId);
  const B = { ev };
  const g = ss.filter((s) => s.phase === 'Group Stage');
  B.gs = { ...STAGES[0], ev, series: g, start: g.map((x) => x.start).sort()[0], status: g.length && g.every((x) => x.status === 'completed') ? 'completed' : g.some((x) => x.live) ? 'live' : g.some((x) => x.status === 'completed') ? 'live' : 'pending',
    teams: ev.rows.map((r) => r.short), src: 'results' };
  for (const S of STAGES.slice(1)) {
    const x = ss.find((y) => y.name === S.name || (S.key === 'f' && y.phase === 'Match Point Finals'));
    B[S.key] = { ...S, ev, s: x, start: x?.start, status: !x ? 'none' : x.status === 'completed' ? 'completed' : x.live || x.status === 'live' ? 'live' : 'pending' };
  }
  const top = (st, a, b) => (st.s?.status === 'completed' && st.s.results ? st.s.results.filter((r) => r.pos >= a && r.pos <= b).map((r) => r.short) : null);
  const gsDone = B.gs.status === 'completed';
  const proj = {
    wr: gsDone ? ev.rows.filter((r) => r.pos <= 20).map((r) => r.short) : null,
    er1: gsDone ? ev.rows.filter((r) => r.pos > 20).map((r) => r.short) : null,
    er2: top(B.wr, 11, 20) && top(B.er1, 1, 10) ? [...top(B.wr, 11, 20), ...top(B.er1, 1, 10)] : null,
    f: top(B.wr, 1, 10) && top(B.er2, 1, 10) ? [...top(B.wr, 1, 10), ...top(B.er2, 1, 10)] : null,
  };
  for (const S of STAGES.slice(1)) {
    const st = B[S.key], x = st.s;
    if (x?.results?.length) { st.teams = x.results.map((r) => r.short); st.src = 'results'; }
    else if (x?.lineup?.length) { st.teams = x.lineup; st.src = 'official'; }
    else if (proj[S.key]) { st.teams = proj[S.key]; st.src = 'projected'; }
    else { st.teams = []; st.src = null; }
  }
  B.started = STAGES.slice(1).some((S) => B[S.key].status !== 'pending' && B[S.key].status !== 'none' || (B[S.key].start && new Date(B[S.key].start) <= now()));
  B.list = STAGES.map((S) => B[S.key]);
  return B;
}
const stageState = (st) => (st.status === 'completed' ? '종료' : st.status === 'live' ? 'LIVE' : st.tbd ? '시각 미정' : st.start ? until(st.start) || '시작 대기' : st.date ? until(`${st.date}T00:00:00+09:00`) || '시작 대기' : '일정 미정');
const krIn = (shorts) => shorts.filter((sh) => krOf(sh) !== 'none');
// 게임 수 표시: 일반 경기 '치른 게임/전체'(0/6 → 6/6), 매치 포인트 결승은 시작 전 '결승', 시작하면 치른 게임 수가 붙는다
function gameCount(s, final) {
  const done = s?.status === 'completed', live = !!s && (s.live || s.status === 'live');
  const played = done ? s.matches || 0 : live ? s.gDone ?? s.games ?? 0 : 0; // 진행 중에는 끝난 게임 수(게임별 상태를 모르면 지금 게임 번호)
  if (final || s?.mp) return `<span class="gc fin${live ? ' live' : ''}${done ? ' done' : ''}"><span>결승</span>${played ? `<b>${played}</b>` : ''}</span>`;
  const tot = s?.matches || 6; // 시리즈 게임 수(공식 값, 보통 6)
  return `<span class="gc${live ? ' live' : ''}${done ? ' done' : ''}" title="치른 게임 / 전체 게임"><b>${Math.min(played, tot)}</b>/${tot}</span>`;
}
// 단계 결과에서 팀이 위로 갔는지 (null = 아직 모름)
const advanced = (st, short) => {
  if (st.key === 'gs') return st.status === 'completed' ? ((st.ev || A.intl).rows.find((r) => r.short === short)?.pos ?? 99) <= 20 : null;
  if (st.s?.status !== 'completed' || !st.s.results) return null;
  const r = st.s.results.find((x) => x.short === short);
  if (!r) return null;
  return st.key === 'f' ? !!r.won : r.pos <= st.cut;
};

// 휴대폰용 세로 진행 그림: 가로 그림을 옆으로 밀지 않아도 되게 같은 내용을 위→아래 카드로 보여 준다 (화면 폭 640px 이하에서 가로 그림 대신 보인다)
//   items: [{ key, title, st(단계), cls, href, when, adv(short) → true|false|null, outs: [[라벨, 도착 단계 키]], note }]
function flowV(items, label) {
  const title = Object.fromEntries(items.map((n) => [n.key, n.title]));
  // 진출 경로 한 줄: 위로(다음 라운드) / 아래로(패자부활) / 탈락 / 챔피언십 을 색·기호로 구분한다
  const route = (lab, to) => {
    // 진출 경로가 아닌 안내 문구(예: '조마다 다른 세 조와 한 번씩')는 'note'(ⓘ, 회색)
    const kind = /탈락/.test(lab) ? 'out' : /챔피언십/.test(lab) ? 'champ' : /하위/.test(lab) ? 'down' : to || /상위/.test(lab) ? 'up' : 'note';
    const ico = { up: '▲', down: '▼', out: '✕', champ: '★', note: 'ⓘ' }[kind];
    const [who, where] = to ? [lab, title[to] || ''] : kind === 'out' ? [lab.replace(/\s*탈락$/, ''), '탈락'] : kind === 'champ' ? [lab.replace(/\s*챔피언십.*$/, ''), '챔피언십 진출'] : [lab, ''];
    return `<li class="rt ${kind}"><i aria-hidden="true">${ico}</i><b>${esc(who)}</b><span>${esc(where)}</span></li>`;
  };
  let day = '', dn = 0;
  // 대회가 진행 중이면(끝나지 않은 단계가 있으면) 끝난 단계는 진출 경로 줄을 접어 짧게: 관심 팀 칩의 ▲·취소선이 결과를 말해 준다
  const going = items.some((n) => n.st.status !== 'completed') && items.some((n) => n.st.status === 'completed');
  return `<ol class="bfv${going ? ' going' : ''}" aria-label="${esc(label)}">${items.map((n) => {
    const st = n.st, ks = krIn(st.teams || []);
    const chips = ks.length ? ks.map((sh) => { const a = n.adv(sh); return `<span class="bfv-chip ${CAT[krOf(sh)]} ${a === false ? 'out' : a ? 'up' : ''}">${esc(sh)}</span>`; }).join('') : `<span class="bfv-none">${st.teams?.length ? esc(ML().none) : '출전 팀 미정'}</span>`;
    const tag = st.status === 'live' ? gameNow(st.s) || '<span class="tag live">LIVE</span>' : `<span class="tag">${esc(stageState(st))}</span>`;
    const ext = String(n.href).startsWith('http');
    const outs = n.outs.map(([lab, to]) => route(lab, to)).join('') + (n.note ? route(n.note) : '');
    const d = st.start ? dayLabel(dayKey(st.start)) : '';
    const dh = d && d !== day ? `<li class="bfv-day"><b>DAY ${++dn}</b><span>${esc(d)}</span></li>` : '';
    if (d) day = d;
    const gc = st.key === 'gs' ? '' : gameCount(st.s, st.key === 'f');
    return `${dh}<li class="bfv-n ${n.cls}"><a class="bfv-a" href="${esc(n.href)}"${ext ? ' target="_blank" rel="noopener"' : ''}><span class="bfv-h"><b>${esc(n.title)}</b><span class="bfv-t">${gc}${tag}</span></span><span class="bfv-s">${st.n}팀${n.when ? ' · ' + esc(n.when) : ''}</span><span class="bfv-c">${chips}</span></a>${outs ? `<ul class="bfv-o">${outs}</ul>` : ''}</li>`;
  }).join('')}</ol>`;
}
const flowOrder = (keys, pos) => keys.slice().sort((a, b) => pos[a][0] - pos[b][0] || pos[a][1] - pos[b][1]);

// 홈 진출 구조 그림. 각 단계를 누르면 공식 경기 페이지로 간다.
function bracketFlow(B) {
  const W = 170, H = 96;
  // 상자 위치와 화살표 [from, to, 출발 y(노드 안 위치), 도착 y, 라벨, 라벨 x, 라벨 y]: 규칙 파일 brackets.playoffs.flow
  const pos = PO_FLOW_L.nodes, edges = PO_FLOW_L.edges;
  const nextKey = B.list.find((st) => st.status === 'pending' || st.status === 'live')?.key;
  const edge = ([a, b, oy, iy, label, lx, ly]) => {
    const x1 = pos[a][0] + W, y1 = pos[a][1] + oy, x2 = pos[b][0], y2 = pos[b][1] + iy, mx = (x1 + x2) / 2;
    return `<path d="M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2 - 3} ${y2}" class="bf-edge" marker-end="url(#bfArrow)"/><text x="${lx}" y="${ly}" class="bf-elab" text-anchor="middle">${label}</text>`;
  };
  const urlOf = (st) => (st.key === 'gs' ? (st.series?.[0] ? officialUrl(st.series[0]).replace(/\/match\/.*/, '/schedule') : '#/standings') : st.s ? officialUrl(st.s) : '#/standings');
  const stCls = (st) => [st.status === 'completed' ? 'done' : '', st.status === 'live' ? 'live' : '', st.key === nextKey && st.status !== 'live' ? 'next' : ''].join(' ');
  const by = Object.fromEntries(B.list.map((st) => [st.key, st]));
  const vert = flowV(flowOrder(Object.keys(pos).filter((k) => by[k]), pos).map((k) => { const st = by[k]; return { key: k, title: st.ko, st, cls: stCls(st), href: urlOf(st), when: st.start ? `${dayLabel(dayKey(st.start)).slice(0, 5)} ${hhmm(st.start)}` : '', adv: (sh) => advanced(st, sh), outs: edges.filter((e) => e[0] === k).map((e) => [e[4], e[1]]) }; }), `${ko(A.intl.name, EVENT_KO)} 진출 구조`);
  const node = (st) => {
    const [x, y] = pos[st.key];
    const cls = ['bf-node', st.status === 'completed' ? 'done' : '', st.status === 'live' ? 'live' : '', st.key === nextKey && st.status !== 'live' ? 'next' : ''].join(' ');
    const ks = krIn(st.teams || []);
    let cx = x + 12;
    const chips = ks.slice(0, 4).map((sh) => {
      const lvl = krOf(sh), kc = false;
      const tw = sh.length * 7.4 + 12, w = tw, adv = advanced(st, sh);
      const out = `<g class="bf-chip ${CAT[lvl]} ${adv === false ? 'out' : adv ? 'up' : ''}"><rect x="${cx}" y="${y + 66}" width="${w}" height="18" rx="9"/><text x="${cx + tw / 2}" y="${y + 79}" text-anchor="middle">${esc(sh)}</text>${kc ? `<circle cx="${cx + w - 9}" cy="${y + 75}" r="6.5" class="bf-c"/><text x="${cx + w - 9}" y="${y + 78.5}" text-anchor="middle" class="bf-ct">C</text>` : ''}</g>`;
      cx += w + 4; return out;
    }).join('') + (ks.length > 4 ? `<text x="${cx}" y="${y + 77}" class="bf-more" dy="2">+${ks.length - 4}</text>` : '');
    const when = st.start ? `${dayLabel(dayKey(st.start)).slice(0, 5)} ${hhmm(st.start)}` : '';
    const url = urlOf(st);
    const ext = url.startsWith('http');
    return `<a href="${esc(url)}" ${ext ? 'target="_blank" rel="noopener"' : ''} class="${cls}" aria-label="${esc(st.ko)} ${esc(stageState(st))}${ks.length ? ', 한국 관련 ' + ks.join(' ') : ''}">
      <rect x="${x}" y="${y}" width="${W}" height="${H}" rx="10" class="bf-box"/>
      <text x="${x + 12}" y="${y + 21}" class="bf-title">${esc(st.ko)}</text>
      <text x="${x + 12}" y="${y + 38}" class="bf-state">${esc(stageState(st))}</text>
      <text x="${x + 12}" y="${y + 53}" class="bf-sub">${st.n}팀${when ? ' · ' + when : ''}</text>
      ${ks.length ? '' : `<text x="${x + 12}" y="${y + 79}" class="bf-sub2">${st.teams?.length ? ML().none : '출전 팀 미정'}</text>`}
      ${chips}</a>`;
  };
  return `<div class="bf-both"><div class="bf-wrap"><svg class="bf" viewBox="0 0 880 232" role="group" aria-label="${esc(ko(A.intl.name, EVENT_KO))} 진출 구조">
    <defs><marker id="bfArrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L8 4 L0 8 z" class="bf-arrow"/></marker></defs>
    ${edges.map(edge).join('')}${B.list.map(node).join('')}</svg></div>${vert}</div>`;
}

/* ---------- 홈 ---------- */
// LCQ·챔피언십이 시작되면 홈 맨 위에 진행 방식 그림과 지금 경기 점수표 (끝나고 3일까지)
function eventHome() {
  const recent = (B, end) => !B.done || now() - new Date(B.f.start || end) < 3 * 864e5;
  let B, base, q, title, L, key;
  const C = champsTimeline() ? champsBracket() : null;
  if (C?.started && recent(C, C.tl.end)) {
    B = C; base = champsMain() ? '/standings' : '/standings/champs'; q = new URLSearchParams(); title = '챔피언십'; L = CH_FLOW_L; key = `ev:${C.ss[0].eventId}`;
  } else if (lcqEvents().length && !intlCurrent()) {
    const ev = lcqEvents().find((e) => e.region === lcqRegionDefault()) || lcqEvents()[0];
    const X = lcqBracket(ev);
    if (!X.started || !recent(X, ev.end)) return '';
    B = X; base = '/standings'; q = new URLSearchParams({ r: ev.region }); title = `${REGION[ev.region]} LCQ`; L = LCQ_FLOW_L; key = `ev:${ev.eventId}`;
  } else return '';
  B.base = base; B.q = q;
  const sts = homeStages(B);
  // 점수표는 짧게(상위 3팀 + 컷 경계 + 관심 팀). 전체는 '전체 점수표'(순위 탭)
  const board = (st) => `<div class="lvm"><h3 class="h3 up-h">${esc(st.ko)} ${st.status === 'live' ? '' : `<small class="muted">${esc(stageState(st))}</small> `}${gameCount(st.s, st.key === 'f')} ${gameNow(st.s)}</h3>${spoil(stageGrid(B, st, 0, true), key, '점수표')}<a class="more" href="${qsLink(base, q, { m: st.key })}">전체 점수표</a></div>`;
  if (sts.some((st) => st.status === 'live')) {
    // 관심 팀이 나가는 경기가 있으면 그 경기만 (나머지 조는 '전체 보기')
    const mineSts = sts.filter((st) => (st.teams || st.s?.lineup || []).some(isF));
    if (mineSts.length) sts.splice(0, sts.length, ...mineSts);
    // 경기 중: 진행 방식 그림·일정 없이 지금 경기 점수만. 다음 단계는 한 줄
    const nx = B.list.find((st) => st.key !== 'gs' && st.status !== 'completed' && st.status !== 'live' && st.start);
    return `<section class="sec flow-sec lvm-sec" aria-labelledby="h-ev">
      <div class="sec-head"><h2 class="h2" id="h-ev">${esc(title)} <span class="tag live">LIVE</span></h2><a class="more" href="${qsLink(base, q, { m: 'groups' })}">전체 보기</a></div>
      <div class="lvm-grid">${sts.map(board).join('')}</div>
      ${nx ? `<p class="lvm-next"><span>다음 경기</span> <b>${esc(nx.ko)}</b> · ${rt(nx.start, 'dt')}</p>` : ''}
    </section>`;
  }
  return `<section class="sec flow-sec" aria-labelledby="h-ev">
      <div class="sec-head"><h2 class="h2" id="h-ev">${esc(title)}</h2><a class="more" href="${qsLink(base, q, { m: 'groups' })}">전체 보기</a></div>
      <div class="flow-grid"><div>${spoil(stageFlow(B, L, (k) => qsLink(base, q, { m: k }), `${title} 진행 방식`), key, '진출 결과')}</div>
      <div>${sts.map(board).join('')}</div></div>
    </section>`;
}
function home() {
  const krs = focusList();
  const lead = krs.find((k) => mainId() && team(k.short)?.id === mainId()) || krs.find((k) => k.level === 'team') || krs[0]; // 대표 응원 팀이 있으면 그 팀이 큰 카드
  const others = krs.filter((k) => k !== lead);
  const upcoming = A.series.filter((s) => s.status !== 'completed').sort((a, b) => a.start.localeCompare(b.start));
  const B = bracket();
  const evHome = eventHome();
  const showFlow = !evHome && B && B.list.some((st) => st.status !== 'completed') && upcoming.some((s) => s.eventId === A.intl.eventId);
  const evLive = evHome.includes('lvm-sec');
  const upMix = [...upcoming.filter((s) => !(evLive && s.live)).map((s) => ({ t: s.start, h: () => matchItem(s, { cd: true }) })), ...extrasUpcoming().filter(isKrExtra).map((x) => ({ t: x.start, h: () => extraItem(x) }))].sort((a, b) => a.t.localeCompare(b.t)).slice(0, 3);
  const upList = `<div class="up-list">${upMix.map((o) => o.h()).join('') || '<p class="empty">예정된 경기가 없습니다.</p>'}</div>`;
  const modeBar = `<div class="mode-bar">${modeSwitch()}${opt.mode === 'custom' ? `<a class="more" href="#/teams/pick">${opt.fav.length ? '응원 팀 바꾸기' : '응원 팀 고르기'}</a>` : ''}</div>`;
  if (opt.mode === 'custom' && !opt.fav.length) return modeBar + `<section class="sec"><h1 class="title">내 응원 팀</h1>${favPicker()}</section>`;
  return `${modeBar}${liveStrip()}${nextCard(upcoming)}${seasonEnd()}${evHome}${showFlow ? `<section class="sec flow-sec" aria-labelledby="h-up">
      <div class="sec-head"><h2 class="h2" id="h-up">${esc(ko(A.intl.name, EVENT_KO))} 진출 구조</h2><a class="more" href="#/standings">전체 순위</a></div>
      <div class="flow-grid"><div>${spoil(bracketFlow(B), intlKey(), '진출 결과')}</div><div><h3 class="h3 up-h">다가오는 경기</h3>${upList}<a class="more" href="#/schedule">경기 전체</a></div></div>
    </section>` : ''}
    <div class="home-grid"><div class="col-a">
    ${lead ? heroCard(lead) : '<p class="empty">현재 시즌에 한국 팀 데이터가 없습니다.</p>'}
    ${others.length ? krStrip(others) : ''}
    </div><div class="col-b">
    ${evCard()}
    ${A.intl && !(champsDone() && /^champs/.test(A.intl.slug || '')) ? `<section class="sec" aria-labelledby="h-now">
      <div class="sec-head"><h2 class="h2" id="h-now">${intlCurrent() ? '지금 순위' : `${esc(ko(A.intl.name, EVENT_KO))} 결과`}</h2><a class="more" href="${intlCurrent() ? '#/standings' : '#/standings/past'}">자세히 보기</a></div>
      ${spoil(B?.started ? stageMini(B) : intlMini(), intlKey(), '순위')}
    </section>` : ''}
    ${showFlow ? '' : `<section class="sec" aria-labelledby="h-up">
      <div class="sec-head"><h2 class="h2" id="h-up">다가오는 경기</h2><a class="more" href="#/schedule">경기 전체</a></div>
      ${upList}
    </section>`}
    ${seasonNext()}
    </div></div>`;
}

// LCQ에서 팀의 현재 위치 (출전하지 않으면 null)
const LCQ_SHORT = { a: '승자1R', b: '승자1R', wr2: '승자2R', er1: '패자1R', er2: '패자2R', f: '결승' };
function lcqState(short, Bs) {
  for (const B of Bs || lcqEvents().map(lcqBracket)) {
    const t = B.E.list.find((x) => x.short === short);
    if (!t) continue;
    let last = null;
    for (const st of B.list) if (st.teams?.includes(short)) last = st;
    if (!last) return `LCQ 출전${t.cp ? ` · CP ${t.cp.rank}위` : ''}`;
    const r = last.s?.results?.find((x) => x.short === short && x.pos);
    if (last.status === 'completed' && r) return `LCQ ${LCQ_SHORT[last.key]} ${r.pos}위${last.key === 'f' ? (r.pos <= last.top ? ' 진출' : '') : r.pos <= last.cut ? ' ↑' : last.down === '탈락' ? ' 탈락' : ' ↓'}`;
    if (last.status === 'live') return `LCQ ${LCQ_SHORT[last.key]} LIVE${r ? ` ${r.pos}위` : ''}`;
    return `LCQ ${LCQ_SHORT[last.key]} 대기`;
  }
  return null;
}
// 홈: LCQ에 나가는 관심 팀 (국제전이 진행 중이 아닐 때)
// 홈 맨 위 '다음 경기' 카드: 관심 팀 경기가 있으면 그 경기, 없으면 가장 가까운 경기. 큰 글자로 남은 날(D-7 · 오늘 · LIVE)을 보여 준다
//   같은 시각에 시작하는 같은 대회·지역 경기(그룹 A·B)는 한 카드에 묶고, 경기마다 출전하는 관심 팀을 적는다
function nextCard(upcoming) {
  const first = upcoming.find((s) => isKrSeries(s)) || upcoming[0];
  if (!first) return '';
  const set = upcoming.filter((s) => s.eventId === first.eventId && s.region === first.region && (s.start === first.start || (s.live && first.live))).slice(0, 3);
  const live = set.some((s) => s.live);
  const days = Math.round((Date.parse(dayKey(first.start)) - Date.parse(dayKey(new Date(now()).toISOString()))) / 864e5);
  const big = live ? 'LIVE' : days <= 0 ? '오늘' : `D-${days}`;
  const rows = set.map((s) => { const fs = (s.lineup || []).filter(isF); return `<li><b>${esc(ko(s.name, PHASE_KO))}${s.live ? ` ${gameNow(s)}` : ''}</b>${fs.length ? `<span class="nx-teams">${fs.slice(0, 4).map((sh) => `<a class="nx-chip ${CAT[krOf(sh)] || ''}" href="#/teams/${encodeURIComponent(sh)}">${esc(sh)}</a>`).join('')}${fs.length > 4 ? `<small>+${fs.length - 4}</small>` : ''}</span>` : ''}</li>`; }).join('');
  return `<section class="nx${live ? ' live' : ''}" aria-labelledby="h-nx">
    <div class="nx-top"><h2 id="h-nx"><span>${live ? '진행 중' : '다음 경기'}</span> · <span>${esc(ko(first.event, EVENT_KO))}</span> <span>${esc(REGION[first.region] || '')}</span></h2>${live ? watchBtn() : ''}</div>
    <div class="nx-when"><strong>${big}</strong><span><b>${esc(dayLabel(dayKey(first.start)))}</b><b${first.timeTbd ? ' class="tbd"' : ''}>${first.timeTbd ? '시간 미정' : `${esc(hhmm(first.start))} <small class="nx-tz">${esc(TZL)}</small>`}</b>${live || first.timeTbd ? '' : `<small class="nx-rel">${rt(first.start, 'rel')}</small>`}</span></div>
    <ul class="nx-list">${rows}</ul>
    <div class="nx-act"><a class="nx-go" href="#/schedule">경기 일정 보기</a>${live || set.every((s) => s.timeTbd) ? '' : `<button type="button" class="nx-ics" data-ics="${esc(set.filter((s) => !s.timeTbd).map((s) => s.id).join(','))}" data-day="${esc(dayKey(first.start))}">캘린더에 추가</button>`}</div>
  </section>`;
}
/* ---------- 홈: 대회 카드 (지역 대회·세계 대회 공통) ---------- */
// 시즌 일정표(A.season.timeline)에서 한 대회를 고른다: 진행 중 → 끝난 지 4일 안(다음 대회가 7일 안에 없을 때) → 다음 대회
// 지역 대회(Online Open·Pro League·LCQ)는 지역마다 한 줄(지금 보기의 지역이 맨 위), 세계 대회(Playoffs·Championship)는 단계 + 관심 팀 위치
// 제목은 상태에 따라 '다가오는 대회' · '진행 중인 대회' · '지난 대회 결과'
const EV_REGIONS = ['apac-n', 'apac-s', 'emea', 'americas'];
const EV_TITLE = { now: '진행 중인 대회', next: '다가오는 대회', done: '지난 대회 결과' };
const evGlobal = (e) => /^s\dpo$|^champs$/.test(e.key) || /LAN/.test(e.where || '');
const kstDay = (d) => Date.parse(`${d}T00:00:00+09:00`);
const evDays = (d) => Math.round((kstDay(d) - Date.parse(dayKey(new Date(now()).toISOString()) + 'T00:00:00+09:00')) / 864e5);
function evPick() {
  const tl = A.season.timeline || [];
  const cur = tl.find((e) => tlState(e) === 'now');
  if (cur) return { e: cur, st: 'now' };
  const nx = tl.find((e) => tlState(e) === 'next');
  const last = tl.filter((e) => tlState(e) === 'done').at(-1);
  if (last && last.key !== 'champs' && (!nx || evDays(nx.start) > 7) && now() - kstDay(last.end) < 4 * 864e5) return { e: last, st: 'done' };
  return nx ? { e: nx, st: 'next' } : null; // 챔피언십이 끝난 뒤에는 시즌 결과(seasonEnd)가 대신한다
}
// 지금 보기의 지역: 한국 팀 → APAC North, 지역 보기 → 그 지역, 내 응원 팀 → 대표 팀 지역부터 고른 팀들의 지역
function evMine() {
  if (opt.mode !== 'custom') return [ML().region || 'apac-n'];
  const rs = Object.values(A.teams).filter((t) => opt.fav.includes(t.id) && t.region).map((t) => t.region);
  return [...new Set([lcqRegionDefault(), ...rs])];
}
const evChip = (sh, label) => `<span class="evc ${CAT[krOf(sh)] || ''}">${esc(sh)}${label ? ` <small>${esc(label)}</small>` : ''}</span>`;
// LCQ 한 지역: 시작 전이면 첫 경기 시각, 진행 중이면 지금 단계·게임, 끝나면 진출 2팀
function evLcqRow(r) {
  const e = lcqEvents().find((x) => x.region === r);
  if (!e) return null;
  const B = lcqBracket(e);
  const live = B.list.find((st) => st.status === 'live');
  const nx = B.list.find((st) => st.status !== 'completed' && st.start && !st.tbd);
  let st, cls = '';
  if (B.done) { const top = (B.f.s?.results || []).filter((x) => x.pos <= (B.f.top || 2)).map((x) => x.short); st = top.length ? `<small>진출</small> ${top.map((sh) => esc(sh)).join(' · ')}` : '종료'; }
  else if (live) { st = `${esc(LCQ_SHORT[live.key])} ${gameNow(live.s) || '<span class="gnow live">진행 중</span>'}`; cls = 'live'; }
  else if (nx) st = `${B.started ? `<small>${esc(LCQ_SHORT[nx.key])}</small> ` : ''}${rt(nx.start, 'dt')}`;
  else st = '<small>시각 미정</small>';
  const chips = B.E.list.filter((t) => isF(t.short)).map((t) => evChip(t.short, (lcqState(t.short) || '').replace(/^LCQ /, '')));
  return { st, cls, chips, href: `#/standings?r=${r}`, started: B.started, key: `ev:${e.eventId}` };
}
// 프로리그 한 지역: 경기 일정은 APAC North 것만 받으므로, 일정이 있으면 다음 경기, 없으면 지역 1위
function evPlRow(r, split) {
  const p = A.pl[`s${split}:${r}`];
  if (!p) return null;
  const ss = A.series.filter((s) => s.region === r && /pro-league/.test(s.eventSlug || '') && s.status !== 'completed').sort((a, b) => a.start.localeCompare(b.start));
  const started = p.rows.some((x) => x.rs > 0);
  const live = ss.find((s) => s.live || s.status === 'live');
  let st, cls = '';
  if (live) { st = `${esc(ko(live.name, PHASE_KO))} ${gameNow(live) || '<span class="gnow live">진행 중</span>'}`; cls = 'live'; }
  else if (ss[0] && !ss[0].timeTbd) st = `<small>다음 경기</small> ${rt(ss[0].start, 'dt')}`;
  else st = started && p.rows[0] ? `<small>1위</small> ${esc(p.rows[0].short)}` : '<small>시작 전</small>';
  const chips = p.rows.filter((x) => isF(x.short)).map((x) => evChip(x.short, started ? `${x.pos}위` : ''));
  return { st, cls, chips, href: `#/points/pl?s=${split}`, started, key: started ? `pl:${split}` : null };
}
function evRegional(e) {
  const m = /^s(\d)pl$/.exec(e.key);
  const one = e.key === 'lcq' ? evLcqRow : m ? (r) => evPlRow(r, +m[1]) : null;
  if (!one) return '';
  const mine = evMine();
  const regs = [...mine.filter((r) => EV_REGIONS.includes(r)), ...EV_REGIONS.filter((r) => !mine.includes(r))];
  const rows = regs.map((r) => [r, one(r)]).filter(([, x]) => x);
  if (!rows.length) return '';
  const me = ML().region ? '' : `<span class="me">${esc(ML().label)}</span>`; // 지역 보기는 지역 이름이 같아 표시 없이 줄 색으로만
  const CH = 6; // 지역 보기에서는 그 지역 팀이 모두 관심 팀이라 칩을 줄인다
  const chipsOf = (c) => (c.length > CH ? `${c.slice(0, CH - 1).join('')}<small>+${c.length - CH + 1}팀</small>` : c.join(''));
  const html = `<ul class="evr">${rows.map(([r, x]) => `<li class="${mine.includes(r) ? 'mine' : ''}"><a class="evr-n" href="${x.href}">${esc(REGION[r])}${mine.includes(r) ? me : ''}</a><span class="evr-s ${x.cls}">${x.st}</span>${x.chips.length ? `<span class="evr-t">${chipsOf(x.chips)}</span>` : ''}</li>`).join('')}</ul>${rows.some(([, x]) => !x.chips.length) ? `<p class="evr-none">${esc(rows.filter(([, x]) => !x.chips.length).map(([r]) => REGION[r]).join(' · '))}: ${esc(ML().none)}</p>` : ''}`;
  const sk = rows.find(([r, x]) => mine.includes(r) && x.started)?.[1].key || rows.find(([, x]) => x.started)?.[1].key || null;
  return spoil(html, sk, '대회 결과');
}
// 세계 대회: 이 대회의 브래킷(플레이오프는 지금 국제전, 챔피언십은 사이트 계산 대진)
function evGlobalBody(e, state) {
  const m = /^s(\d)po$/.exec(e.key);
  const B = e.key === 'champs' ? champsBracket() : m && A.intl && new RegExp(`^split-${m[1]}-playoffs`).test(A.intl.slug || '') ? bracket() : null;
  const grp = (k) => (k === 'f' ? 2 : /^(g\d*|gs)$/.test(k) ? 0 : 1);
  const L = (B?.list || []).filter((x) => x && x.status && x.status !== 'none');
  const steps = ['조별 리그', '브래킷', '결승'].map((n, i) => { const xs = L.filter((x) => grp(x.key) === i); return { n, done: xs.length > 0 && xs.every((x) => x.status === 'completed'), live: xs.some((x) => x.status === 'live') }; });
  const cur = state === 'next' ? 0 : steps.findIndex((x) => !x.done);
  const stepHtml = B ? `<ol class="evs">${steps.map((x, i) => `<li class="${x.done ? 'done' : ''}${i === cur ? ' on' : ''}${x.live ? ' live' : ''}">${esc(x.n)}</li>`).join('')}</ol>` : '';
  const live = L.find((x) => x.status === 'live');
  const nx = L.find((x) => x.status !== 'completed' && x.start && !x.tbd);
  const lines = [];
  if (B?.done && B.f?.s?.results?.[0]) lines.push(['우승', spoil(evChip(B.f.s.results[0].short, ''), intlKey(), '우승 팀')]);
  else if (live) lines.push(['지금', `${esc(live.ko)} ${gameNow(live.s)}`]);
  else if (nx) lines.push([B?.started ? '다음 단계' : '첫 경기', `${esc(nx.ko)} · ${rt(nx.start, 'dt')}`]);
  else lines.push(['첫 경기', `${esc(dayLabel(e.start))} <small>시각 미정</small>`]);
  // 관심 팀: 시작 전 챔피언십은 직행·LCQ 진출 팀, 그 밖에는 국제전 출전 팀의 지금 위치
  let chips = [];
  if (e.key === 'champs' && !B?.started) {
    const S = champsSeeds();
    chips = S.seeds.filter((t) => !t.tbd && isF(t.short)).map((t) => evChip(t.short, t.via === 'cp' ? '직행' : 'LCQ 진출'));
    if (!S.allDone) { const lt = (A.season.timeline || []).find((x) => x.key === 'lcq'); lines.push(['남은 자리', `<b>LCQ ${A.season.lcqSlots}팀</b>${lt ? ` <small>${esc(dayLabel(lt.end))} 결정</small>` : ''}`]); }
  } else if (B && A.intl?.rows?.length) chips = A.intl.rows.filter((r) => isF(r.short)).map((r) => evChip(r.short, B.started ? stageShort(r.short) : '출전'));
  lines.splice(1, 0, ['관심 팀', chips.length ? `<span class="evr-t">${chips.length > 6 ? `${chips.slice(0, 5).join('')}<small>+${chips.length - 5}팀</small>` : chips.join('')}</span>` : `<small>${esc(ML().none)}</small>`]);
  return `${stepHtml}<dl class="evg">${lines.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('')}</dl>`;
}
function evCard() {
  const P = evPick();
  if (!P) return '';
  const { e, st } = P, glob = evGlobal(e);
  const live = st === 'now' && A.series.some((s) => s.live);
  const d = evDays(e.start);
  const pill = st === 'done' ? '<span class="evp">종료</span>' : live ? '<span class="evp live">LIVE</span>' : st === 'now' ? '<span class="evp live">진행 중</span>' : `<span class="evp">${d <= 0 ? '오늘' : `D-${d}`}</span>`;
  const body = glob ? evGlobalBody(e, st) : evRegional(e);
  const href = stageHref(e) || '#/rules?s=format';
  return `<section class="sec ev-sec" aria-labelledby="h-evc"><div class="sec-head"><h2 class="h2" id="h-evc">${EV_TITLE[st]}</h2><a class="more" href="${href}">자세히 보기</a></div>
    <div class="evn"><div class="evn-top"><div><p class="evn-eye"><em>${glob ? '세계 대회' : '지역 대회'}</em> · <span>${esc(e.where || '')}</span></p><h3 class="evn-t">${esc(ko(e.name, EVENT_KO))}</h3><p class="evn-d">${esc(dayLabel(e.start))}–${esc(e.end.slice(5).replace('-', '.'))}</p></div>${pill}</div>
    ${body}${body && !glob ? `<p class="evn-f">시각은 ${esc(TZL)} 기준입니다.</p>` : ''}</div>
  </section>`;
}
// 홈 시각 글자: 1분마다 홈 전체를 다시 그리지 않고 이 글자만 그 자리에서 바꾼다 (homeTick)
function relDay(iso) {
  const ms = new Date(iso) - now();
  if (ms <= 0) return '';
  const d = evDays(dayKey(iso)), day = d === 0 ? '오늘' : d === 1 ? '내일' : '';
  const h = Math.floor(ms / 3.6e6), m = Math.floor(ms / 6e4);
  return [day, ms < 3.6e6 ? `${Math.max(1, m)}분 후` : h < 48 ? `${h}시간 후` : ''].filter(Boolean).join(' · ');
}
const RT = { until: (iso) => until(iso) || '진행 중', rel: relDay, dt: (iso) => dateTime(iso) };
const rt = (iso, f = 'until') => `<span data-rt="${esc(iso)}" data-rf="${f}">${esc(RT[f](iso))}</span>`;
let homeKey = '';
function homeTick() {
  if (document.hidden || parseHash().parts[0]) return;
  const t = now();
  const soon = A.series.some((s) => s.status !== 'completed' && !s.live && Math.abs(new Date(s.start) - t) < 3.6e6);
  // 날짜·시각(시)이 바뀌었거나, 1시간 안에 시작하는 경기가 있으면(분 단위 표시) 다시 그린다. 내용이 같으면 render 가 건너뛴다
  const key = `${dayKey(new Date(t).toISOString())}|${Math.floor(t / 3.6e6)}${soon ? `|${Math.floor(t / 6e4)}` : ''}`;
  if (key !== homeKey) { homeKey = key; render(); return; }
  for (const el of app.querySelectorAll('[data-rt]')) { const v = I.t(RT[el.dataset.rf]?.(el.dataset.rt) ?? ''); if (el.textContent !== v) el.textContent = v; }
}
// 다음 경기를 캘린더에 (.ics 파일). 시리즈마다 일정 하나, 6게임 약 4시간
function icsFor(ids) {
  const ss = ids.split(',').map((id) => A.series.find((s) => s.id === id)).filter(Boolean);
  const f = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const ie = (s) => String(s).replace(/[\\,;]/g, (c) => '\\' + c).replace(/\n/g, '\\n');
  const url = `${location.origin}${location.pathname}#/schedule`;
  const evs = ss.map((s) => {
    const fs = (s.lineup || []).filter(isF);
    return ['BEGIN:VEVENT', `UID:${s.id}@algs-kr`, `DTSTAMP:${f(now())}`, `DTSTART:${f(s.start)}`, `DTEND:${f(new Date(s.start).getTime() + 4 * 3.6e6)}`,
      `SUMMARY:${ie(`ALGS ${I.t(ko(s.event, EVENT_KO))}${s.region !== 'global' ? ` ${REGION[s.region] || ''}` : ''} · ${I.t(ko(s.name, PHASE_KO))}`)}`,
      `DESCRIPTION:${ie(`${fs.length ? `${I.t(ML().group)}: ${fs.join(', ')}\n` : ''}${url}`)}`, `URL:${url}`, 'END:VEVENT'].join('\r\n');
  });
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//EASY ALGS KR//KO', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', ...evs, 'END:VCALENDAR'].join('\r\n') + '\r\n';
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-ics]');
  if (!b) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([icsFor(b.dataset.ics)], { type: 'text/calendar;charset=utf-8' }));
  a.download = `algs-${b.dataset.day || 'match'}.ics`;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
});

// 한국 선수·코치 팀: 홈에서는 작은 칩으로만, 자세한 내용은 팀 탭 '한국 관련'
const STAGE_SHORT = { gs: '조별', wr: '승자R', er1: '패자1R', er2: '패자2R', f: '결승' };
function stageShort(short) {
  if (!intlCurrent()) {
    const l = lcqState(short);
    if (l) return l;
    const c = cpStanding().find((r) => r.short === short);
    if (c?.direct && lcqEvents().length) return `직행 · CP ${c.rank}위`;
  }
  const B = A.intl ? bracket() : null;
  const cp = (focusList()).find((k) => k.short === short)?.cp;
  if (!B) return cp ? `CP ${cp.rank}위` : '';
  let last = null;
  for (const st of B.list.slice(1)) if (st.teams?.includes(short)) last = st;
  if (!last) { const g = A.intl.rows.find((r) => r.short === short); return g ? `조별 ${g.pos}위` : cp ? `CP ${cp.rank}위` : '미출전'; }
  const r = last.s?.results?.find((x) => x.short === short);
  if (last.status === 'completed' && r) return `${STAGE_SHORT[last.key]} ${r.pos}위${last.key === 'f' ? (r.won ? ' 우승' : '') : r.pos <= last.cut ? ' ↑' : last.down === '탈락' ? ' 탈락' : ' ↓'}`;
  if (last.status === 'live') return `${STAGE_SHORT[last.key]} LIVE${r ? ` ${r.pos}위` : ''}`;
  return `${STAGE_SHORT[last.key]} 대기`;
}
function krStrip(list) {
  return `<section class="sec" aria-labelledby="h-kr2">
    <div class="sec-head"><h2 class="h2" id="h-kr2">${ML().strip}</h2><a class="more" href="#/teams?g=kr">자세히 보기</a></div>
    ${spoil(`<div class="kr-strip">${list.slice(0, opt.mode === 'kr' ? 99 : 12).map((k) => `<a class="kchip ${CAT[k.level]}${mainId() && team(k.short)?.id === mainId() ? ' main' : ''}" href="#/teams/${encodeURIComponent(k.short)}" title="${esc(k.name)}">${logo(k.short)}<span><b>${esc(k.short)}</b>${outTag(k.short)}<small>${esc(stageShort(k.short))}</small></span></a>`).join('')}${list.length > 12 && opt.mode !== 'kr' ? `<a class="kchip more-chip" href="#/teams?g=kr"><span><b>+${list.length - 12}</b><small>전체 보기</small></span></a>` : ''}</div>`, intlKey(), '관심 팀 성적')}
    ${krLegend()}
  </section>`;
}
// 챔피언십 최종 순위 40팀: 결승 1~20위, 패자부활 2라운드 탈락 21~30위, 패자부활 1라운드 탈락 31~40위
function champsFinal() {
  const B = champsBracket();
  if (!B.done) return null;
  const rows = (B.f.s?.results || []).map((r) => ({ pos: r.pos, short: r.short, won: !!r.won, label: r.pos === 1 ? '우승' : r.pos === 2 ? '준우승' : `${r.pos}위` }));
  const out = (st, label) => (st.s?.results || []).filter((r) => r.pos > st.cut).map((r) => ({ pos: null, short: r.short, label }));
  return [...rows, ...out(B.er2, '21–30위'), ...out(B.er1, '31–40위')];
}
// 홈: 시즌이 끝나면(챔피언십 결승 종료) 최종 결과를 맨 위에 둔다. 다음 시즌이 메인이 될 때까지, 그리고 지난 시즌 보기에서 계속 보인다
function seasonEnd() {
  const fin = champsDone() ? champsFinal() : null;
  if (!fin?.length) return '';
  const B = champsBracket();
  const rows = [...fin.slice(0, 3), ...fin.slice(3).filter((r) => isF(r.short))];
  const key = now() - new Date(B.f.start || B.tl.end) < 7 * 864e5 && B.ss[0] ? `ev:${B.ss[0].eventId}` : null;
  const nx = !FROZEN && A.next?.timeline?.[0];
  return `<section class="sec season-end" aria-labelledby="h-end">
    <div class="sec-head"><h2 class="h2" id="h-end">${esc(yearLabel())} 챔피언십 결과</h2><a class="more" href="#/standings">전체 결과</a></div>
    ${spoil(`<div class="tbl-wrap"><table class="tbl"><tbody>${rows.map((r) => `<tr class="${rowCls(r)}"><td class="rank">${r.pos ?? '–'}</td><td class="team">${krDot(null, r.short)}${teamLink(r.short, xteam(r.short)?.name || r.short)}</td><td class="r small">${r.won || r.pos === 1 ? '<span class="tag mpe">우승</span>' : esc(r.label)}</td></tr>`).join('')}</tbody></table></div>`, key, '챔피언십 결과')}
    <p class="lead">${esc(A.season.name)} 시즌이 끝났습니다.${nx ? ` <span>다음 시즌 ${esc(A.next.name)}: ${esc(nx.name)} ${esc(nx.start.slice(5).replace('-', '.'))} 시작.</span>` : FROZEN ? '' : ' <span>다음 시즌 일정이 공식 발표되면 여기에 표시됩니다.</span>'}</p>
  </section>`;
}
// 지난 시즌 기록으로 가는 링크 (현재 시즌 화면에서만)
const pastSeasons = () => (!FROZEN && A.seasons?.length ? `<p class="caption past-seasons">지난 시즌: ${A.seasons.map((x) => `<a href="?y=${encodeURIComponent(x.slug)}#/">${esc(x.name)}</a>`).join(' · ')}</p>` : '');
// 홈: 시즌 일정은 지금·다음 일정 한 줄만. 이번 시즌 일정이 모두 끝났으면 다음 시즌 첫 일정을 보여 준다
function seasonNext() {
  const tl = A.season.timeline;
  const cur = tl.find((e) => tlState(e) === 'now');
  const nx = tl.find((e) => tlState(e) === 'next');
  const row = (e, tag) => e ? `<li><span class="tag ${tag === '진행 중' ? 'live' : ''}">${tag}</span> ${e.url ? olink(e.url, esc(e.name)) : esc(e.name)} <span class="when">${e.start.slice(5).replace('-', '.')}–${e.end.slice(5).replace('-', '.')} · ${esc(e.where)}</span></li>` : '';
  return `<section class="sec" aria-labelledby="h-season"><div class="sec-head"><h2 class="h2" id="h-season">${esc(A.season.name)} 일정</h2><a class="more" href="#/rules?s=format">전체 일정</a></div>
    <ul class="season-next">${row(cur, '진행 중')}${row(nx, '다음')}${!cur && !nx && !FROZEN && A.next?.timeline?.length ? A.next.timeline.slice(0, 2).map((e) => row(e, '다음 시즌')).join('') : ''}${!cur && !nx && (FROZEN || !A.next?.timeline?.length) ? '<li><span class="tag">종료</span> 이번 시즌 일정이 모두 끝났습니다.</li>' : ''}</ul>${pastSeasons()}</section>`;
}
const krLegendKr = () => `<p class="legend"><span><span class="krdot k-team"></span>한국 팀 (한국 선수 2명 이상)</span><span><span class="krdot k-member"></span>한국 선수 소속 (1명)</span><span><span class="krdot k-coach"></span>한국 코치 팀 (선수 없이 코치만)</span></p>`;
const krLegend = () => (opt.mode === 'kr' ? krLegendKr() : `<p class="legend"><span><span class="krdot k-team"></span>${ML().label}</span>${opt.mode === 'custom' ? ' <a class="more" href="#/teams/pick">응원 팀 고르기</a>' : ''}</p>`);

// 팀의 국제전 현재 위치 (text) 와 다음 경기(next)
function krStageInfo(short) {
  const B = bracket();
  if (!B) return { text: '', next: null };
  const gs = A.intl.rows.find((r) => r.short === short);
  let last = null;
  for (const st of B.list.slice(1)) if (st.teams?.includes(short)) last = st;
  if (!last) {
    const nx = gs && A.series.find((s) => s.eventId === A.intl.eventId && s.name === gs.next && s.status !== 'completed');
    return { text: gs ? `조별 ${gs.pos}위${B.gs.status === 'completed' ? '' : ' (진행 중)'}, 다음 ${ko(gs.next, PHASE_KO)}` : '', next: nx || null };
  }
  const r = last.s?.results?.find((x) => x.short === short);
  if (last.status === 'completed' && r) {
    if (last.key === 'f') return { text: `결승 ${r.pos}위${r.won ? ', 우승' : ''}`, next: null };
    return { text: `${last.ko} ${r.pos}위, ${r.pos <= last.cut ? last.up : last.down}`, next: null };
  }
  if (last.status === 'live') return { text: `${last.ko} 진행 중${r ? ` (현재 ${r.pos}위, ${ptsLine(r.pts, r.kills)})` : ''}`, next: last.s };
  return { text: `${last.ko} ${last.src === 'projected' ? '진출 예정' : '출전'}, ${stageState(last)}`, next: last.s };
}
const krStage = (short) => krStageInfo(short).text;
function lineupLine(s) {
  if (!s.lineup?.length) return '';
  const ks = krIn(s.lineup).sort((a, b) => (team(b)?.id === mainId()) - (team(a)?.id === mainId()));
  return `<div class="meta lineup">출전 ${s.lineup.length}팀 확정${ks.length ? ` · ${ML().group} ${ks.map((sh) => `${krDot(krOf(sh), sh)}${teamLink(sh)}${outTag(sh)}${coachBadge(krOf(sh), sh)}`).join(' ')}` : ''}</div>`;
}

// 홈: 지금(또는 가장 최근) 브래킷 단계 요약
function stageMini(B) {
  const st = B.list.slice(1).find((x) => x.status === 'live') || B.list.slice(1).filter((x) => x.status === 'completed').at(-1) || B.list.slice(1).find((x) => x.teams?.length);
  if (!st) return intlMini();
  const res = st.s?.results;
  const rows = res ? res.filter((r, i) => i < 5 || isF(r.short)) : (st.teams || []).map((sh) => ({ short: sh, kr: krOf(sh), seed: A.intl.rows.find((r) => r.short === sh)?.pos })).filter((r, i) => i < 5 || isF(r.short));
  return `<p class="lead" style="margin-top:4px"><b>${esc(st.ko)}</b> · ${esc(stageState(st))} ${gameNow(st.s)}</p>
  <div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>팀</th>${res ? PTS_TH : '<th class="r">조별 순위</th>'}${res && st.cut ? `<th class="r">${st.status === 'completed' ? '결과' : '현재 기준'}</th>` : ''}</tr></thead><tbody>
  ${rows.map((r, i) => `<tr class="${rowCls(r)}"><td class="rank">${res ? r.pos : i + 1}</td><td class="team">${krDot(r.kr, r.short)}${teamLink(r.short)}${coachBadge(r.kr, r.short)}</td>${res ? ptsTd(r.pts, r.kills) : `<td class="r num">${r.seed ?? '–'}</td>`}${res && st.cut ? `<td class="r small muted">${r.pos <= st.cut ? esc(st.up) : esc(st.down)}</td>` : ''}</tr>`).join('')}
  </tbody></table></div>`;
}

// 대표 팀 카드 성적 (평시): 챔피언십 포인트 · 가장 최근 국제전 최종 순위 · 가장 최근 지역 리그 최종 순위
// 대회 도중(LCQ·플레이오프·챔피언십이 시작됐고 끝난 지 3일 안)이고 그 팀이 나가면: 그 대회의 지금 단계 순위 · 점수 · 다음 단계
function cpOfTeam(short) {
  const BD = board();
  const b = (BD.state === 'live' || BD.state === 'pending') && BD.rows.find((r) => r.short === short);
  if (b) return { rank: b.prank, total: b.min };
  const c = A.cp.find((r) => r.short === short);
  return c ? { rank: c.rank, total: c.total } : null;
}
// 끝난 국제전에서 팀의 최종 순위: 공식 대회별 순위(cpEvents)가 있으면 그것, 없으면 결승 → 패자 2R(21~30위) → 패자 1R(31~40위) 결과로
function intlPlace(evId, short) {
  const ce = A.cpEvents.find((e) => e.id === evId);
  const r = ce?.rows.find((x) => x.short === short);
  if (r) return { pos: r.pos, cp: r.cp };
  const ss = A.series.filter((x) => x.eventId === evId && x.results?.length);
  const at = (name, add) => { const y = ss.find((x) => x.name === name || (name === 'Match Point Finals' && x.phase === 'Match Point Finals'))?.results.find((z) => z.short === short); return y ? y.pos + add : null; };
  const f = at('Match Point Finals', 0);
  if (f) return { pos: f };
  const e2 = at('Elimination Round 2', 10); if (e2 > 20) return { pos: e2 };
  const e1 = at('Elimination Round 1', 20); if (e1 > 30) return { pos: e1 };
  return null;
}
function lastIntl(short) {
  const evs = [...A.cpEvents.filter((e) => e.kind === 'po').map((e) => ({ id: e.id, name: e.label, start: e.start })),
    ...(A.past || []).map((e) => ({ id: e.eventId, name: ko(e.name, EVENT_KO), start: e.start }))]
    .filter((e, i, arr) => arr.findIndex((x) => x.id === e.id) === i && new Date(e.start) < now()).sort((a, b) => b.start.localeCompare(a.start));
  const ev = evs.find((e) => !intlCurrent() || e.id !== A.intl?.eventId) || evs[0];
  return ev ? { name: ev.name, ...(intlPlace(ev.id, short) || {}) } : null;
}
function lastLeague(short) {
  const t = team(short);
  const evs = A.cpEvents.filter((e) => e.kind === 'pl' && (!t?.region || e.region === t.region)).sort((a, b) => b.start.localeCompare(a.start));
  for (const e of evs) { const r = e.rows.find((x) => x.short === short); if (r) return { name: e.label, pos: r.pos, cp: r.cp }; }
  return evs[0] ? { name: evs[0].label } : null;
}
// 진행 중 대회에서 팀의 성적. 없으면 null
function eventNow(short) {
  const recent = (B, end) => B.started && (!B.done || now() - new Date(B.f?.start || end) < 3 * 864e5);
  const stage = (B, title, key, base, q) => {
    const sts = B.list.filter((x) => (x.teams || []).includes(short));
    if (!sts.length) return null;
    // 지금 단계: 진행 중 → 결과가 나온 마지막 단계 → 다음 단계
    const cur = sts.find((x) => x.status === 'live') || sts.filter((x) => x.status === 'completed').at(-1) || sts[0];
    const r = cur.s?.results?.find((x) => x.short === short);
    const p = r ? ptsOf(r.pts, r.kills) : null;
    const dest = !r ? '' : cur.key === 'f' ? (r.won ? '우승' : cur.top && cur.status === 'completed' && r.pos <= cur.top ? '챔피언십 진출' : r.mpe ? '매치 포인트' : '') : cur.cut ? lcqDest(cur, r.pos) : '';
    const nextSt = sts.find((x) => x !== cur && x.status !== 'completed' && B.list.indexOf(x) > B.list.indexOf(cur));
    return { title, key, link: qsLink(base, q, { m: cur.key }),
      boxes: [
        { big: r ? `${r.pos}위` : '–', label: `${cur.ko}<br>${stageState(cur)}` },
        { big: p ? `${p.tp}점` : '–', label: p ? `순위 ${p.pp} / 킬 ${p.kp}` : '종합 점수' },
        { big: dest || (nextSt ? nextSt.tab : '–'), label: dest ? (cur.status === 'completed' ? '결과' : '현재 기준') : '다음 경기' },
      ],
      next: (nextSt || (cur.status !== 'completed' ? cur : null))?.s || null };
  };
  // 챔피언십
  if (champsTimeline()) {
    const C = champsBracket();
    if (recent(C, C.tl.end)) { const x = stage(C, '챔피언십', `ev:${C.ss[0].eventId}`, champsMain() ? '/standings' : '/standings/champs', new URLSearchParams()); if (x) return x; }
  }
  // LCQ
  for (const e of lcqEvents()) {
    const B = lcqBracket(e);
    if (recent(B, e.end)) { const x = stage(B, `${REGION[e.region]} LCQ`, `ev:${e.eventId}`, '/standings', new URLSearchParams({ r: e.region })); if (x) return x; }
  }
  // 플레이오프 (진행 중 국제전)
  if (intlCurrent() && !champsNow()) {
    const B = bracket(), g = A.intl.rows.find((x) => x.short === short);
    if (!g) return null;
    let last = null;
    for (const st of B.list.slice(1)) if (st.teams?.includes(short)) last = st;
    const r = last ? last.s?.results?.find((x) => x.short === short) : g;
    const p = r ? ptsOf(r.pts, r.kills) : null;
    const st = last || B.gs;
    const dest = last ? (r ? (last.key === 'f' ? (r.won ? '우승' : r.mpe ? '매치 포인트' : '') : r.pos <= last.cut ? last.up : last.down) : '') : ko(g.next, PHASE_KO);
    return { title: ko(A.intl.name, EVENT_KO), key: intlKey(), link: '#/standings',
      boxes: [
        { big: r ? `${r.pos}위` : '–', label: `${st.ko}<br>${stageState(st)}` },
        { big: p ? `${p.tp}점` : '–', label: p ? `순위 ${p.pp} / 킬 ${p.kp}` : '종합 점수' },
        { big: dest || '–', label: last?.status === 'completed' ? '결과' : '다음 단계' },
      ], next: krStageInfo(short).next };
  }
  return null;
}
// 대회 전: 팀이 나갈 LCQ·챔피언십 첫 경기
function teamUpcoming(short) {
  const Bs = [...lcqEvents().map((e) => lcqBracket(e)), ...(champsTimeline() ? [champsBracket()] : [])];
  for (const B of Bs) { const st = B.list.find((x) => x.status !== 'completed' && x.s && (x.teams || []).includes(short)); if (st) return st.s; }
  return null;
}
// 대표 팀 카드 맨 위 한 줄: 챔피언십으로 가는 길 (직행권 / LCQ). 챔피언십이 시작되면 대회 성적이 대신한다
function heroState(short) {
  if (champsMain()) return '';
  const c = cpStanding().find((r) => r.short === short);
  if (!c) return '';
  const locked = (A.season.timeline || []).filter((e) => /^s\dp[lo]$/.test(e.key)).every((e) => tlState(e) === 'done'); // CP가 걸린 대회가 모두 끝났는가
  const cut = A.season.cpDirectSlots;
  const box = (cls, icon, title, sub) => `<div class="hero-state ${cls}"><i aria-hidden="true">${icon}</i><span><b>${esc(title)}</b><small>${esc(sub)}</small></span></div>`;
  if (c.direct) return box('direct', '★', locked ? '챔피언십 직행 확정' : '챔피언십 직행권', `CP ${c.rank}위 · ${cut}위까지 직행${locked ? '' : ' · 지금 기준'}`);
  const l = lcqEvents().length ? lcqState(short) : null;
  if (l) return box('lcq', '▲', l, `CP ${c.rank}위 · 지역마다 상위 2팀이 챔피언십으로`);
  return '';
}
function heroCard(k) {
  const t = team(k.short);
  const ev = eventNow(k.short);
  const si = !ev && A.intl ? krStageInfo(k.short) : { text: '', next: null };
  const next = ev ? ev.next : (A.intl && si.text ? si.next : k.nextSeries) || teamUpcoming(k.short);
  const roster = (t?.roster?.filter((p) => p.r !== 'k').map((p) => p.n).join(', ') || k.krPlayers.join(', ')) + (t?.roster?.some((p) => p.r === 'k') ? ' · 코치 ' + t.roster.filter((p) => p.r === 'k').map((p) => p.n).join(', ') : '');
  const box = (b) => `<div><b${String(b.big).length > 5 ? ' class="sm"' : ''}>${esc(b.big)}</b><span>${b.label}</span></div>`;
  let stats, key;
  if (ev) {
    stats = `<p class="kr-ev"><a href="${esc(ev.link)}">${esc(ev.title)}</a> <span class="tag live">대회 중</span></p><div class="kr-stats">${ev.boxes.map((b) => ({ big: b.big, label: b.label.split('<br>').map(esc).join('<br>') })).map(box).join('')}</div>`;
    key = ev.key;
  } else {
    const cp = cpOfTeam(k.short) || k.cp, li = lastIntl(k.short), ll = lastLeague(k.short);
    stats = `<div class="kr-stats">
      ${box({ big: cp ? `${cp.rank}위` : '–', label: `챔피언십 포인트<br>${cp ? `${fmt(cp.total)} CP` : ''}` })}
      ${box({ big: li?.pos ? `${li.pos}위` : '–', label: li ? `${esc(li.name)}<br>${li.pos ? (li.cp ? `+${fmt(li.cp)} CP` : '최종 순위') : '미출전'}` : '국제전 기록 없음' })}
      ${box({ big: ll?.pos ? `${ll.pos}위` : '–', label: ll ? `${esc(ll.name.replace(/ · (APAC North|APAC South|EMEA|Americas)$/, ''))}<br>${ll.pos ? (ll.cp ? `+${fmt(ll.cp)} CP` : plOpen() ? '현재 순위' : '최종 순위') : '미출전'}` : '지역 리그 기록 없음' })}
    </div>`;
    key = intlKey();
  }
  return `<section class="kr-hero" aria-labelledby="h-hero">
    <span class="flag ${CAT[k.level] || ''}">${mainId() && team(k.short)?.id === mainId() ? '★ 대표 응원 팀' : opt.mode === 'kr' ? KR_LABEL[k.level] || '' : ML().label}</span>${outTag(k.short)}
    <div class="hero-id">${logo(k.short, 'xl', true)}<h1 id="h-hero"><a href="#/teams/${encodeURIComponent(k.short)}" style="text-decoration:none">${esc(k.name)}</a></h1></div>
    <p class="roster">${esc(roster)}</p>
    ${spoil(`${ev ? '' : heroState(k.short)}${stats}${si.text ? `<p class="kr-where">지금 위치 · ${esc(si.text)}</p>` : ''}`, key, '성적')}
    ${next ? `<div class="kr-next"><span>${next.live || next.status === 'live' ? '진행 중' : '다음 경기'} · ${esc(ko(next.name, PHASE_KO))}<br><span style="opacity:.7">${next.timeTbd ? '시각 미정' : `${dateTime(next.start)} ${TZL}`}</span></span><b>${next.timeTbd ? '' : rt(next.start)}</b></div>` : ''}
  </section>`;
}

// 챔피언십 포인트 순위 위의 관심 팀 위치 (이 사이트의 대표 시각 요소)
// 그림은 실제 화면 폭(px)에 맞춰 브라우저에서 그린다(fitRing): 글자 크기가 화면 폭에 따라 커지거나 작아지지 않고,
// 이름표가 겹치지 않게 줄(최대 3줄)을 나눠 놓다가 자리가 모자라면 가장 가까운 팀끼리 묶어 'n팀 a~b위'로 보여 준다.
// 묶인 팀이 있으면 그림 아래에 전체 팀을 순위 칩(직행권 / LCQ)으로 나열한다.
let RING = null;
function ringLine(krs) {
  const N = A.cp.length, cut = A.season.cpDirectSlots;
  if (!N) return '';
  const mid = mainId();
  const pts = krs.filter((k) => k.cp).sort((a, b) => a.cp.rank - b.cp.rank)
    .map((k) => ({ short: k.short, rank: k.cp.rank, level: k.level, main: !!mid && team(k.short)?.id === mid }));
  RING = { N, cut, pts };
  return `<section class="ringline" aria-label="챔피언십 포인트 순위에서 ${esc(ML().group)} 팀 위치">
    <div class="rl-box" data-ring></div>
    <p class="caption">챔피언십 포인트 ${N}팀 중 위치 (${board().state === 'live' ? '실시간 정산' : board().state === 'pending' ? '최종 순위 정산' : '공식'} 기준). 굵은 선 안쪽(${cut}위까지)이 챔피언십 직행입니다.</p>
  </section>`;
}
const RING_COL = { team: 'var(--kr-team)', member: 'var(--kr-member)', coach: 'var(--coach)' };
let ringCtx = null;
function ringTextW(s, weight = 700, size = 11.5) {
  try {
    ringCtx ||= document.createElement('canvas').getContext('2d');
    ringCtx.font = `${weight} ${size}px ${getComputedStyle(document.body).fontFamily}`;
    return ringCtx.measureText(s).width;
  } catch { return s.length * size * 0.62; }
}
// 이름표 놓기: 왼쪽부터 빈 줄을 찾고(위 줄의 세로선이 아래 줄 글자를 뚫지 않게), 못 놓으면 가장 가까운 두 묶음을 합쳐 처음부터 다시
function ringLayout(W) {
  const { N, pts } = RING, L = 14, R = W - 14, LANES = 3, GAP = 8;
  const x = (rank) => L + ((rank - 1) / Math.max(1, N - 1)) * (R - L);
  const tr = (s) => I.t(s);
  let groups = pts.map((p) => ({ items: [p] }));
  const label = (g) => {
    const it = g.items;
    if (it.length === 1) return { a: `${it[0].short} ${it[0].rank}`, b: '' };
    return { a: tr(`${it.length}팀`), b: tr(`${it[0].rank}~${it[it.length - 1].rank}위`) };
  };
  for (let guard = 0; guard < 200; guard++) {
    const lanes = Array(LANES).fill(-1e9), placed = [], stems = [];
    let fail = -1;
    for (let gi = 0; gi < groups.length; gi++) {
      const g = groups[gi], it = g.items;
      g.x0 = x(it[0].rank); g.x1 = x(it[it.length - 1].rank);
      const lb = label(g);
      g.la = lb.a; g.lb = lb.b;
      g.w = ringTextW(lb.a) + (lb.b ? 4 + ringTextW(lb.b, 500, 10.5) : 0);
      const mx = it.reduce((s, p) => s + x(p.rank), 0) / it.length;
      g.cx = Math.min(Math.max(mx, g.w / 2 + 2), W - g.w / 2 - 2);
      const lo = g.cx - g.w / 2, hi = g.cx + g.w / 2;
      g.lane = -1;
      for (let k = 0; k < LANES; k++) {
        if (lo - GAP <= lanes[k]) continue;
        if (stems.some((s) => s.lane > k && s.x >= lo - 3 && s.x <= hi + 3)) continue; // 위 줄 세로선을 덮지 않게
        if (placed.some((p) => p.lane < k && g.cx >= p.lo - 3 && g.cx <= p.hi + 3)) continue; // 내 세로선이 아래 줄 글자를 뚫지 않게
        g.lane = k; break;
      }
      if (g.lane < 0) { fail = gi; break; }
      lanes[g.lane] = hi;
      placed.push({ lane: g.lane, lo, hi });
      stems.push({ lane: g.lane, x: g.cx });
    }
    if (fail < 0) return { groups, x, L, R, lanes: Math.max(1, ...groups.map((g) => g.lane + 1)) };
    // 가장 가까운(점 사이 거리) 이웃 묶음 둘을 합친다. 대표 응원 팀은 따로 남기고, 직행선(cut)을 넘어서 묶지 않는다
    let best = -1, bd = Infinity;
    for (let i = 0; i < groups.length - 1; i++) {
      const a = groups[i], b = groups[i + 1];
      if (a.items.some((p) => p.main) || b.items.some((p) => p.main)) continue;
      if ((a.items[0].rank <= RING.cut) !== (b.items[0].rank <= RING.cut)) continue; // 직행권과 LCQ 권은 섞지 않는다
      const d = x(b.items[0].rank) - x(a.items[a.items.length - 1].rank);
      if (d < bd) { bd = d; best = i; }
    }
    if (best < 0) return { groups: groups.map((g) => ({ ...g, lane: Math.max(0, g.lane) })), x, L, R, lanes: LANES };
    groups.splice(best, 2, { items: [...groups[best].items, ...groups[best + 1].items] });
  }
  return null;
}
function ringSvg(W) {
  const { N, cut } = RING;
  const lay = ringLayout(W);
  if (!lay) return '';
  const { groups, x, L, R } = lay, LH = 17;
  const y = 14 + lay.lanes * LH + 14, H = y + 26;
  const ly = (lane) => y - 18 - lane * LH;
  const marks = groups.map((g) => {
    const it = g.items, multi = it.length > 1, top = ly(g.lane);
    const tip = it.map((p) => `#${p.rank} ${p.short}`).join(', ');
    const dots = it.map((p) => {
      const px = x(p.rank), col = RING_COL[p.level] || RING_COL.team;
      return `<circle cx="${px.toFixed(1)}" cy="${y}" r="${p.main ? 6.5 : multi ? 4.5 : 5.5}" fill="${col}" stroke="var(--paper)" stroke-width="${p.main ? 2 : 1}"${p.main ? ' class="rl-main"' : ''}/>`;
    }).join('');
    const stemTo = multi ? y - 10 : y - 6;
    const bracket = multi ? `<path d="M${(g.x0).toFixed(1)} ${y - 7}V${y - 10}H${(g.x1).toFixed(1)}V${y - 7}" class="rl-br"/>` : '';
    const stemX = multi ? Math.min(Math.max(g.cx, g.x0), g.x1) : x(it[0].rank);
    const main = it.some((p) => p.main);
    return `<g class="marker${multi ? ' grp' : ''}${main ? ' main' : ''}"><title>${esc(tip)}</title>${bracket}<path d="M${g.cx.toFixed(1)} ${top + 4}L${stemX.toFixed(1)} ${stemTo}" class="rl-stem"${multi ? '' : ` style="stroke:${RING_COL[it[0].level] || RING_COL.team}"`}/>${dots}
      <text x="${g.cx.toFixed(1)}" y="${top}" text-anchor="middle" class="rl-lb"><tspan class="a">${esc(g.la)}</tspan>${g.lb ? `<tspan class="b" dx="4">${esc(g.lb)}</tspan>` : ''}</text></g>`;
  }).join('');
  const tickR = [...new Set([1, cut, 60, 90, N])].filter((r) => r >= 1 && r <= N);
  const ticks = tickR.filter((r, i) => i === 0 || r === cut || r === N || (Math.abs(x(r) - x(cut)) > 34 && Math.abs(x(N) - x(r)) > 34))
    .map((r) => `<text x="${x(r).toFixed(1)}" y="${y + 21}" text-anchor="middle" class="rl-tk">${r}위</text>`).join('');
  const svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="챔피언십 포인트 ${N}팀 중 ${esc(ML().group)} 팀 위치, ${cut}위까지 직행">
      <rect x="${L}" y="${y - 2}" width="${(x(cut) - L).toFixed(1)}" height="4" rx="2" fill="var(--ink)"/>
      <rect x="${x(cut).toFixed(1)}" y="${y - 1}" width="${(R - x(cut)).toFixed(1)}" height="2" rx="1" fill="var(--rule)"/>
      <line x1="${(x(cut) + 0.5).toFixed(1)}" y1="${y - 10}" x2="${(x(cut) + 0.5).toFixed(1)}" y2="${y + 10}" stroke="var(--ink)" stroke-width="1.5" stroke-dasharray="2 2"/>
      ${ticks}${marks}
    </svg>`;
  // 묶인 팀이 있으면 전체 팀을 순위 칩으로 (직행권 / LCQ)
  if (!groups.some((g) => g.items.length > 1)) return svg;
  const chip = (p) => `<a class="rl-chip${p.main ? ' main' : ''}" href="#/teams/${encodeURIComponent(p.short)}" style="--c:${RING_COL[p.level] || RING_COL.team}"><i>${p.rank}</i>${esc(p.short)}</a>`;
  const inn = RING.pts.filter((p) => p.rank <= cut), out = RING.pts.filter((p) => p.rank > cut);
  const row = (h, sub, list) => (list.length ? `<div class="rl-row"><span class="rl-h"><b>${h}</b> <small>${sub ? `${sub} · ` : ''}${list.length}팀</small></span><div class="rl-chips">${list.map(chip).join('')}</div></div>` : '');
  return `${svg}<div class="rl-list">${row('직행권', `1~${cut}위`, inn)}${row('LCQ', '', out)}</div>`;
}
let ringW = 0;
function fitRing() {
  const box = app.querySelector('.ringline [data-ring]');
  if (!box || !RING) return;
  const w = Math.round(box.clientWidth);
  if (!w) return;
  if (box.firstChild && Math.abs(w - ringW) < 2 && box.dataset.k === ringKey()) return;
  ringW = w; box.dataset.k = ringKey();
  box.innerHTML = ringSvg(w);
  I.tree(box);
}
const ringKey = () => `${RING.N}|${RING.cut}|${RING.pts.map((p) => `${p.short}${p.rank}${p.level}${p.main ? '*' : ''}`).join(',')}`;

function intlMini() {
  const rows = A.intl.rows;
  const show = rows.filter((r, i) => i < 5 || isF(r.short));
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>팀</th>${PTS_TH}<th class="r">다음 단계</th></tr></thead><tbody>
    ${show.map((r) => `<tr class="${rowCls(r)}"><td class="rank">${r.pos}</td><td class="team">${krDot(r.kr, r.short)}${teamLink(r.short, r.name)}${coachBadge(r.kr, r.short)}</td>${ptsTd(r.pts, r.kills)}<td class="r small muted">${esc(ko(r.next, PHASE_KO))}</td></tr>`).join('')}
  </tbody></table></div>
  <p class="lead">조별 리그 누적 기준. 상위 ${A.intl.winnersCut}팀은 승자 라운드, 나머지는 패자부활 라운드로 갑니다.</p>`;
}

/* ---------- 경기 ---------- */
// 관심 팀 경기: 결과·출전 명단에 관심 팀이 있거나, 관심 팀이 뛰는 지역 리그·국제전 결승
// 한 번 그릴 때 같은 시리즈를 여러 번 묻는다(필터·카드 태그·다시보기 목록). 그리기마다(RGEN) 한 번만 계산
const krsCache = new WeakMap();
function isKrSeries(s) {
  const c = krsCache.get(s);
  if (c && c.g === RGEN) return c.v;
  const v = isKrSeries0(s);
  krsCache.set(s, { g: RGEN, v });
  return v;
}
function isKrSeries0(s) {
  if ((s.results || []).some((r) => isF(r.short)) || (s.lineup || []).some(isF)) return true;
  if (s.results?.length || s.lineup?.length) return false; // 출전 팀이 정해진 시리즈는 명단으로만 판단
  if (s.status !== 'completed') {
    if (focusList().some((k) => k.intl && s.eventId === A.intl?.eventId && k.intl.next === s.name)) return true;
    if (s.eventId === A.intl?.eventId && s.mp && focusList().length) return true;
    const regions = new Set(focusList().map((k) => team(k.short)?.region));
    if (opt.mode === 'kr' ? s.region === 'apac-n' : ML().region ? s.region === ML().region : regions.has(s.region)) return true;
  }
  return false;
}

// 경기 탭 카드의 남은 시간 (시각 아래 작게): 하루 넘게 남으면 D-n(날짜 기준), 1시간 넘게 남으면 'n시간 후', 그 안은 'n분 후'(빨강)
function schCd(s) {
  if (s.status === 'completed' || s.live || s.status === 'live' || s.timeTbd) return '';
  const ms = new Date(s.start) - now();
  if (ms <= 0) return '<small class="cd soon">시작 대기</small>';
  if (ms < 3.6e6) return `<small class="cd soon">${Math.max(1, Math.floor(ms / 6e4))}분 후</small>`;
  if (ms < 864e5) return `<small class="cd">${Math.floor(ms / 3.6e6)}시간 후</small>`;
  const d = Math.round((Date.parse(dayKey(s.start)) - Date.parse(dayKey(new Date(now()).toISOString()))) / 864e5);
  return `<small class="cd">D-${Math.max(1, d)}</small>`;
}
// o.cd: 경기 탭 — 남은 시간을 시각 아래로 옮기고 설명 줄은 ' · ' 로 나눈다 (홈 카드는 그대로)
function matchItem(s, o = {}) {
  const state = o.cd ? '' : seriesState(s);
  const tags = [s.mp ? '<span class="tag mp">매치 포인트</span>' : '', s.live ? `<span class="tag live">LIVE</span> ${gameNow(s)}${watchBtn()}` : '', s.liveFinal ? '<span class="tag">공식 결과 반영</span>' : '', isKrSeries(s) ? `<span class="tag kr">${ML().tag}</span>` : ''].join(' ');
  let res = '';
  if (s.results?.length) {
    const top = s.results[0];
    const krs = s.results.filter((r) => isF(r.short));
    const mpTag = (r) => (r.won ? ' <span class="tag mpe">우승</span>' : r.mpe ? ' <span class="tag mpe">MP</span>' : '');
    const inner = `<span><b>1위 ${teamLink(top.short)}</b> ${ptsLine(top.pts, top.kills)}${mpTag(top)}</span>${krs.filter((r) => r !== top).map((r) => `<span>${krDot(r.kr, r.short)}${teamLink(r.short)}${coachBadge(r.kr, r.short)} ${r.pos}위 · ${ptsLine(r.pts, r.kills)}${mpTag(r)}</span>`).join('')}${s.liveAt ? `<span class="upd">${ago(s.liveAt)} 공식 API 확인</span>` : ''}`;
    const full = s.results.length > 5 ? `<details class="lz"><summary>${s.eventSlug.includes('pro-league') ? `상위 3팀과 ${ML().group} 팀 표` : `전체 ${s.results.length}팀 결과`}</summary><div${lazy(() => resultTable(s.results))}></div></details>` : ''; // 표는 펼칠 때 만든다
    res = spoil(`<div class="res">${inner}</div>${full}`, seriesKey(s)) + `<a class="more rp-link" href="#/schedule/replay?s=${s.id}">게임 다시보기</a>`;
  }
  const mt = mainTeam(), mine = !!mt && ((s.lineup || []).includes(mt.short) || (s.results || []).some((r) => r.short === mt.short));
  return `<article class="match${mine ? ' mine' : ''}">
    <time datetime="${s.start}"${s.timeTbd ? ' class="tbd"' : ''}>${sTime(s)}${o.cd ? schCd(s) : ''}</time>
    <div><div class="what">${olink(officialUrl(s), esc(ko(s.name, PHASE_KO)))} ${gameCount(s)} ${mine ? '<span class="tag mine-tag">내 팀</span>' : ''}${tags}</div>
      <div class="meta">${esc([ko(s.event, EVENT_KO), s.name === 'Regional Finals' ? '' : ko(s.phase, PHASE_KO), REGION[s.region], s.status !== 'completed' ? state : ''].filter(Boolean).join(o.cd ? ' · ' : ', '))}</div>
      ${res || lineupLine(s)}</div>
  </article>`;
}

const resultTable = (rows) => `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>팀</th>${PTS_TH}</tr></thead><tbody>${rows.map((r) => `<tr class="${rowCls(r)}"><td class="rank">${r.pos}</td><td class="team">${krDot(r.kr, r.short)}${teamLink(r.short)}${coachBadge(r.kr, r.short)}</td>${ptsTd(r.pts, r.kills)}</tr>`).join('')}</tbody></table></div>`;

/* ---------- 게임 다시보기: 공식 게임 결과로 탈락 순서를 재생 ---------- */
// 공식 API는 게임 중 위치를 주지 않으므로, 게임별 최종 순위(= 탈락 순서)·킬·레전드·밴과 VOD 시점으로 다시 본다.
const RP = {};
async function loadReplay(sid) {
  if (RP[sid]?.loading) return;
  RP[sid] = { ...(RP[sid] || {}), loading: true }; // 다시 받는 동안에도 지난 값을 보여 준다
  const api = LIVE.api, j = (u) => fetch(api + u).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const [m, vt, v] = await Promise.all([j(`/series/${sid}/matches`), j(`/series/${sid}/vods/timeline`), j(`/series/${sid}/vods`)]);
  if (!m) { // 공식 API 실패: 지난 값이 있으면 그대로 두고, 없으면 '불러오지 못함'(다시 불러오기 버튼)
    RP[sid] = RP[sid]?.matches ? { ...RP[sid], loading: false } : { err: true, at: Date.now() };
    if (parseHash().parts[1] === 'replay') render();
    return;
  }
  const matches = (m?.matches || []).filter((x) => x.status === 'completed' || x.status === 'live' || x.inGameStatus === 'postmatch');
  const stats = await Promise.all(matches.map((x) => j(`/stats/series/${sid}/match/number/${x.matchNumber}`)));
  RP[sid] = { matches, stats, segs: vt?.segments || [], vods: v?.vods || [], at: Date.now() };
  if (parseHash().parts[1] === 'replay') render();
}
const ytAt = (id, ms) => `https://www.youtube.com/watch?v=${encodeURIComponent(id)}&t=${Math.max(0, Math.floor(ms / 1000))}s`;
function vodLinks(D, num, shorts) {
  const seg = D.segs.find((x) => x.type === 'match' && x.matchNumber === num);
  if (!seg) return '';
  const main = D.vods.find((x) => x.vodType === 'main' && x.vodProvider === 'youtube');
  const out = [];
  if (main) out.push(`<a class="chip youtube" href="${esc(ytAt(main.vodProviderId, seg.start))}" target="_blank" rel="noopener"><i></i>메인 중계 (이 게임부터)</a>`);
  for (const sh of shorts) {
    const tv = D.vods.find((x) => x.vodType === 'multiview_team' && apiShort(x.team) === sh && x.vodProvider === 'youtube');
    const s0 = tv?.segments?.[0];
    if (tv) out.push(`<a class="chip youtube" href="${esc(ytAt(tv.vodProviderId, s0 ? seg.start - s0.start + (s0.offset || 0) : 0))}" target="_blank" rel="noopener"><i></i>${esc(sh)} 팀 시점</a>`);
  }
  return out.join('');
}
function replayView(q) {
  const list = A.series.filter((x) => x.status === 'completed' || x.live || x.status === 'live').sort((a, b) => b.start.localeCompare(a.start));
  if (!list.length) return '<h1 class="title">게임 다시보기</h1><p class="empty">끝난 경기가 아직 없습니다.</p>';
  const s = list.find((x) => x.id === q.get('s')) || list.find((x) => isKrSeries(x)) || list[0];
  const opts = list.slice(0, 80).map((x) => `<option value="${x.id}"${x === s ? ' selected' : ''}>${dayLabel(dayKey(x.start))} · ${esc(ko(x.event, EVENT_KO))} · ${esc(ko(x.name, PHASE_KO))}${REGION[x.region] && x.region !== 'global' ? ' · ' + REGION[x.region] : ''}${isKrSeries(x) ? ' ★' : ''}</option>`).join('');
  const head = `<h1 class="title">게임 다시보기</h1>
    <p class="lead">게임마다 탈락 순서를 재생합니다. 재생바를 움직이면 그 시점까지 탈락한 팀과 남은 팀이 바뀝니다. 공식 데이터에는 게임 중 위치가 없어 지도 동선은 아직 없습니다.</p>
    <div class="controls"><label class="rp-pick"><span class="visually-hidden">시리즈 고르기</span><select id="rpSeries">${opts}</select></label></div>`;
  const D = RP[s.id];
  if (D?.err) return head + `<div class="rp-err" role="alert"><p>공식 경기 기록을 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.</p><button type="button" class="rp-retry" data-rp-retry="${esc(s.id)}">다시 불러오기</button></div>`;
  if (!D || (D.loading && !D.matches)) { loadReplay(s.id); return head + '<p class="empty">공식 경기 기록을 불러오는 중…</p>'; }
  if (!D.matches.length) return head + '<p class="empty">이 시리즈의 게임 기록이 아직 없습니다.</p>';
  const g = Math.min(Math.max(1, +(q.get('g') || 1)), D.matches.length);
  const m = D.matches.at(g - 1), st = D.stats.at(g - 1);
  const tabs = `<div class="seg rp-games" role="group" aria-label="게임">${D.matches.map((x, i) => `<a href="${qsLink('/schedule/replay', q, { s: s.id, g: i + 1 })}" aria-current="${i + 1 === g}">G${x.matchNumber} <small>${esc(x.map?.name || '')}</small></a>`).join('')}</div>`;
  if (!st?.teams?.length) return head + tabs + '<p class="empty">이 게임의 결과가 아직 없습니다.</p>';
  const teams = st.teams.map((t) => ({ short: apiShort(t), name: t.name, place: t.placement, kills: t.kills, pts: t.points, players: (t.players || []).map((p) => ({ n: p.name, k: p.kills, lg: p.character?.name || '' })), kr: krOf(t.shortName) }));
  const N = teams.length;
  // 탈락 순서: 낮은 순위부터. step = 지금까지 탈락한 팀 수 (N-1이면 우승 확정)
  const order = teams.slice().sort((a, b) => b.place - a.place);
  window.__rp = { order: order.map((t) => t.short), N };
  const krs = teams.filter((t) => isF(t.short)).map((t) => t.short);
  const bans = (m.bannedCharacters || []).map((b) => b.character?.name).filter(Boolean);
  const dur = m.playStartedAt && m.completedAt ? Math.round((new Date(m.completedAt) - new Date(m.playStartedAt)) / 60000) : null;
  const cards = teams.slice().sort((a, b) => a.short.localeCompare(b.short)).map((t) => `<div class="rp-team ${rowCls(t)}" data-team="${esc(t.short)}">${logo(t.short)}<b>${esc(t.short)}</b><small class="rp-state">생존</small></div>`).join('');
  const log = order.map((t, i) => `<li class="rp-ev ${rowCls(t)}" data-step="${i + 1}" hidden><span class="rp-place">${t.place}위</span> ${teamLink(t.short)} ${t.place === 1 ? '<b class="rp-win">챔피언</b>' : '탈락'} <span class="muted">· ${ptsLine(t.pts, t.kills)}</span></li>`).reverse().join('');
  const detail = `<details class="rp-detail"><summary>팀별 레전드·킬 보기</summary><div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>팀</th><th>선수 (레전드, 킬)</th>${PTS_TH}</tr></thead><tbody>
    ${teams.slice().sort((a, b) => a.place - b.place).map((t) => `<tr class="${rowCls(t)}"><td class="rank">${t.place}</td><td class="team">${teamLink(t.short)}</td><td class="small">${t.players.map((p) => `${esc(p.n)} <span class="muted">(${esc(p.lg)}, ${p.k})</span>`).join(', ')}</td>${ptsTd(t.pts, t.kills, t.place)}</tr>`).join('')}
    </tbody></table></div></details>`;
  return head + tabs + `
    <section class="sec rp">
      <div class="rp-meta"><b>${esc(ko(s.name, PHASE_KO))} · 게임 ${m.matchNumber}</b> <span class="muted">${esc(m.map?.name || '')}${dur ? ` · ${dur}분` : ''}${m.playStartedAt ? ` · ${dateTime(m.playStartedAt)} ${TZL}` : ''}</span>${bans.length ? `<span class="rp-bans">밴: ${bans.map(esc).join(', ')}</span>` : ''}</div>
      <div class="rp-bar"><button type="button" class="rp-btn" id="rpPlay" aria-label="재생">▶</button><button type="button" class="rp-btn" id="rpBack" aria-label="한 단계 뒤로">‹</button>
        <input type="range" id="rpSlider" min="0" max="${N - 1}" value="0" aria-label="탈락 순서 재생바"><button type="button" class="rp-btn" id="rpFwd" aria-label="한 단계 앞으로">›</button><button type="button" class="rp-btn" id="rpEnd" aria-label="끝으로">⏭</button>
        <span class="rp-count" id="rpCount">${N}팀 생존</span></div>
      <div class="rp-grid">${cards}</div>
      <ol class="rp-log" id="rpLog">${log}</ol>
      ${spoil(detail, seriesKey(s), '팀별 결과')}
      <div class="chips rp-vods">${vodLinks(D, m.matchNumber, krs)}</div>
    </section>`;
}
function bindReplay() {
  const sel = document.getElementById('rpSeries');
  if (sel) sel.addEventListener('change', () => { location.hash = `#/schedule/replay?s=${sel.value}&g=1`; });
  app.querySelector('[data-rp-retry]')?.addEventListener('click', (e) => { delete RP[e.currentTarget.dataset.rpRetry]; render(); });
  const sl = document.getElementById('rpSlider');
  if (!sl || !window.__rp) return;
  const { order, N } = window.__rp;
  const pos = new Map(order.map((sh, i) => [sh, i]));
  let timer = null;
  const show = (step) => {
    sl.value = step;
    app.querySelectorAll('.rp-team').forEach((el) => {
      const i = pos.get(el.dataset.team);
      const out = i < step, win = step === N - 1 && i === N - 1;
      el.classList.toggle('out', out); el.classList.toggle('win', win);
      el.querySelector('.rp-state').textContent = I.t(win ? '챔피언' : out ? `${N - i}위 탈락` : '생존');
    });
    app.querySelectorAll('.rp-ev').forEach((li) => { li.hidden = +li.dataset.step > step + (step === N - 1 ? 1 : 0); });
    document.getElementById('rpCount').textContent = I.t(step === N - 1 ? '게임 종료' : `${N - step}팀 생존`);
  };
  const stop = () => { clearInterval(timer); timer = null; document.getElementById('rpPlay').textContent = '▶'; };
  sl.addEventListener('input', () => { stop(); show(+sl.value); });
  document.getElementById('rpPlay').addEventListener('click', () => {
    if (timer) return stop();
    if (+sl.value >= N - 1) show(0);
    document.getElementById('rpPlay').textContent = '❚❚';
    timer = setInterval(() => { const v = +sl.value + 1; show(v); if (v >= N - 1) stop(); }, 900);
  });
  document.getElementById('rpBack').addEventListener('click', () => { stop(); show(Math.max(0, +sl.value - 1)); });
  document.getElementById('rpFwd').addEventListener('click', () => { stop(); show(Math.min(N - 1, +sl.value + 1)); });
  document.getElementById('rpEnd').addEventListener('click', () => { stop(); show(N - 1); });
  show(0);
}

const SCH_REG = { 'apac-n': 'APAC N', 'apac-s': 'APAC S', emea: 'EMEA', americas: 'Americas', global: '국제전' };
const SCH_DAYS = 3; // 지난 결과: 처음에 보여 줄 날 수 (나머지는 '이전 결과 더 보기'를 누르면 그린다)
function schedule(parts, q) {
  if (parts[1] === 'replay') return replayView(q);
  const view = q.get('view') === 'results' ? 'results' : 'upcoming';
  const kronly = q.get('kr') === '1';
  let list = A.series.filter((s) => (view === 'results' ? s.status === 'completed' : s.status !== 'completed'));
  if (kronly) list = list.filter(isKrSeries);
  // 지역 칩: 지금 목록에 있는 지역만 (한 지역뿐이면 칩을 내지 않는다)
  const regs = Object.keys(SCH_REG).filter((r) => list.some((s) => s.region === r));
  const reg = regs.length > 1 && regs.includes(q.get('r')) ? q.get('r') : null;
  if (reg) list = list.filter((s) => s.region === reg);
  list.sort((a, b) => (view === 'results' ? b.start.localeCompare(a.start) : a.start.localeCompare(b.start)));
  const days = {}, xdays = {};
  for (const s of list) (days[s.timeTbd && view !== 'results' ? 'tbd' : dayKey(s.start)] ||= []).push(s);
  if (view === 'upcoming') for (const x of extrasUpcoming().filter((x) => (!kronly || isKrExtra(x)) && (!reg || !x.region || x.region === reg))) { const d = dayKey(x.start); (xdays[d] ||= []).push(x); days[d] ||= []; }
  const order = Object.keys(days).filter((d) => d !== 'tbd').sort(); if (days.tbd) order.push('tbd');
  // 공식 시각이 임시값인 시리즈(LCQ 일부 지역)는 날짜도 확실하지 않아 맨 뒤 '시각 미정'에 모은다
  const keys = view === 'results' ? Object.keys(days) : order;
  const day = (d) => { const ss = days[d], xs = xdays[d] || []; return `<section class="day"><h2 class="day-h">${d === 'tbd' ? '시각 미정' : dayLabel(d)}<small>${[ss.length ? `${ss.length}시리즈` : '', xs.length ? `일정 ${xs.length}` : ''].filter(Boolean).join(' · ')}</small></h2>${timedItems(ss, xs, { cd: true })}</section>`; };
  const shown = view === 'results' ? keys.slice(0, SCH_DAYS) : keys, rest = view === 'results' ? keys.slice(SCH_DAYS) : [];
  const more = rest.length ? `<div class="days sch-more" id="schMore" hidden${lazy(() => rest.map(day).join(''))}></div><button type="button" class="more-days" data-toggle="schMore" aria-expanded="false">이전 결과 더 보기 (${rest.length}일)</button>` : '';
  const chip = (patch, on, label, cls = '') => `<a${cls ? ` class="${cls}"` : ''} href="${qsLink('/schedule', q, patch)}" aria-current="${on}">${label}</a>`;
  return `<h1 class="title">경기</h1>
    <div class="sch-bar">
      <div class="sch-chips" role="group" aria-label="경기 필터">${chip({ kr: kronly ? null : '1' }, kronly, `<i aria-hidden="true">★</i> ${ML().only}`, 'kr')}${regs.length > 1 ? `<span class="sep" aria-hidden="true"></span>${chip({ r: null }, !reg, '전체 지역')}${regs.map((r) => chip({ r }, reg === r, SCH_REG[r])).join('')}` : ''}</div>
      <div class="sch-note"><span>한국 시간(KST) 기준 · 한 시리즈는 보통 6게임</span>${refreshNote(true)}</div>
    </div>
    ${keys.length ? `<div class="days">${shown.map(day).join('')}</div>${more}` : '<p class="empty">조건에 맞는 경기가 없습니다. 필터를 끄면 전체 경기를 볼 수 있습니다.</p>'}`;
}

/* ---------- 순위 (진행 중 국제전) ---------- */
// 결승이 시작됐거나 끝났으면 순위 탭은 결승부터 보여 준다
function finalsFirstTab() { const B = A.intl ? bracket() : null; return !!B?.f?.s && (B.f.status === 'live' || B.f.status === 'completed'); }
// 진행 중인 국제전: 결승이 끝나기 전까지. 끝나면 순위 탭은 다음 대회(LCQ)로 넘어가고, 이 대회는 '이전 결과'로 간다
function intlCurrent() { if (!A.intl?.eventId) return false; return bracket()?.f?.status !== 'completed'; }
function standings(parts, q) {
  if (parts[1] === 'past') return pastView(q);
  if (parts[1] === 'champs' && champsTab()) return `<h1 class="title">순위</h1>${champsView(q, '/standings/champs')}`;
  if (champsMain()) return `<h1 class="title">순위</h1>${champsView(q, '/standings')}`;
  if (intlCurrent()) {
    const view = ['finals', 'bracket', 'group'].includes(parts[1]) ? parts[1] : finalsFirstTab() ? 'finals' : 'bracket';
    return `<h1 class="title">순위</h1>${intlBody(A.intl, view, (v) => `#/standings/${v}`, intlKey())}`;
  }
  if (lcqEvents().length) return `<h1 class="title">순위</h1>${lcqBody(q, '/standings')}`;
  return `<h1 class="title">순위</h1><p class="empty">진행 중인 대회가 없습니다. ${(A.past || []).length ? '<a href="#/standings/past">이전 결과</a>에서 지난 대회를 볼 수 있습니다.' : '<span>이번 시즌 국제전이 열리면 여기에 표시됩니다.</span>'}</p>${pastSeasons()}`;
}

// 국제전(플레이오프·챔피언십) 결승·브래킷·조별 리그. L(view) = 그 화면 주소
function intlBody(ev, view, L, key) {
  const B = bracket(ev), cur = ev === A.intl;
  const phases = B.list.map((st) => `<li class="${st.status === 'completed' ? 'done' : st.status === 'live' ? 'now' : ''}"><span>${st.s ? olink(officialUrl(st.s), esc(st.ko)) : esc(st.ko)}</span><span class="when">${st.start ? dateTime(st.start) : ''}</span></li>`).join('');
  const what = view === 'finals' && B.f.s ? '매치 포인트 결승 20팀의 점수입니다.' : B.started && view !== 'group' ? '위는 승자조, 아래는 패자조입니다.' : '조별 리그 누적 점수입니다.';
  const head = `<p class="lead">${cur ? `${esc(ko(ev.name, EVENT_KO))}. ` : ''}${what}</p>
    ${cur ? refreshNote() : ''}
    <section class="sec"><ol class="timeline tl-row">${phases}</ol></section>`;
  if (!B.started || view === 'group') return head + spoil(`<section class="sec">${groupTable(ev)}</section>${B.started ? `<section class="sec"><h2 class="h2">조별 리그 시리즈</h2>${B.gs.series.slice().reverse().map(matchItem).join('')}</section>` : ''}`, key, '조별 리그 순위');
  const f = B.f;
  const finals = f.s ? `<section class="sec bk bk-final" aria-labelledby="h-f"><h2 class="h2 bk-h" id="h-f">매치 포인트 결승</h2>${stageTable(f)}</section>` : '<p class="empty">결승 일정이 아직 없습니다.</p>';
  if (view === 'finals') return head + spoil(finals + `<section class="sec past-link"><a class="btn-link ghost" href="${L('bracket')}">결승까지 온 길: 브래킷 보기</a></section>`, key, '결승 결과');
  return head + spoil(`
    <section class="sec bk bk-upper" aria-labelledby="h-up2"><h2 class="h2 bk-h" id="h-up2"><span class="bk-badge up">승자조</span></h2>${stageTable(B.wr)}</section>
    <section class="sec bk bk-lower" aria-labelledby="h-lo"><h2 class="h2 bk-h" id="h-lo"><span class="bk-badge low">패자조</span></h2>
      <div class="bk-cols">${stageTable(B.er1)}${stageTable(B.er2)}</div></section>
    ${f.s ? `<section class="sec past-link"><a class="btn-link ghost" href="${L('finals')}">다음: 매치 포인트 결승 보기</a></section>` : ''}
    <section class="sec past-link"><a class="btn-link ghost" href="${L('group')}">지난 결과: 조별 리그 순위와 시리즈 결과 보기</a></section>`, key, '브래킷 결과');
}

/* ---------- LCQ (지역별 Last Chance Qualifier) ---------- */
// 지역마다 40팀. 시드 = 프로리그 팀은 챔피언십 포인트(CP) 순, 그 뒤 2부(챌린저 서킷) 팀은 서킷 포인트(CCP) 순
// 그룹 A·B(각 20팀): 시드 지그재그 (A 1·4·5·8·9…, B 2·3·6·7·10…). 공식 배정이 나오면 그 배정
// 승자 1R 그룹 A·B → 그룹별 상위 10 승자 2R, 하위 10 패자부활 1R
// 승자 2R: 상위 10 결승, 하위 10 패자부활 2R / 패자부활 1R: 상위 10 패자부활 2R, 하위 10 탈락
// 패자부활 2R: 상위 10 결승, 하위 10 탈락 / 매치 포인트 결승 20팀 중 상위 2팀 챔피언십
// 단계 표(LCQ_STAGES)와 진출 규칙(LCQ_FLOW)은 규칙 파일 brackets.lcq 에 있다. 그 표를 고치면 탭·점수표·다음 경기 배정이 함께 바뀐다
const lcqEvents = () => A.lcq || [];
// CP 순위 (CP 탭과 같은 기준: 대회 중·직후는 정산 순위)
function cpStanding() {
  const BD = board();
  return BD.state === 'live' || BD.state === 'pending'
    ? BD.rows.map((r) => ({ id: r.id, short: r.short, name: r.name, region: r.region, rank: r.prank, total: r.min, direct: r.pstatus === 'direct' }))
    : A.cp.map((r) => ({ id: r.id, short: r.short, name: r.name, region: r.region, rank: r.rank, total: r.total, total0: r.total0 ?? r.total, direct: r.status === 'direct' }));
}
// 시드 순번(0부터) → 그룹: 지그재그
const lcqGroupOf = (i) => (Math.floor(i / 2) % 2 ? (i % 2 ? 'a' : 'b') : (i % 2 ? 'b' : 'a'));
// 출전 팀과 시드: 공식 명단이 나오면 그 명단(공식 시드 순), 아직이면 예상 명단
//   예상 명단 = 그 지역 프로리그 팀 중 직행권 밖 팀(CP 순) + 남은 자리(40 − 프로리그 팀 수)는 챌린저 서킷 팀
//   2부 팀은 서킷 우승팀부터 자리를 받고(Liquipedia), 시드는 CCP 순
function lcqEntrants(ev) {
  const cp = cpStanding();
  const ss = A.series.filter((s) => s.eventId === ev.eventId);
  const lobby = { a: ss.find((s) => s.name === LCQ_STAGES[0].name)?.lineup || null, b: ss.find((s) => s.name === LCQ_STAGES[1].name)?.lineup || null };
  let E;
  if (ev.teams?.length) {
    // 공식 명단. 시드가 아직 없으면 계산한다: 프로리그 팀은 시드 CP 순, 그다음 2부 팀은 서킷 포인트(CCP) 순
    //   시드 CP: 로스터 변경을 반영한 CP (선수가 빠지면 내려가고, 들어오면 그 선수 CP만큼 오른다. 2026-11-14 주최 측 확정 조 편성에서 확인)
    const seedCp = (r) => r.total;
    const list = ev.teams.map((t) => { const r = cp.find((x) => x.id === t.id), c = t.ccKey ? (ev.cc || []).find((x) => x.short === t.ccKey) : null; return { ...t, cp: r, ...(c ? { cc: c } : {}), ...(t.pl && r ? { seedCp: seedCp(r) } : {}) }; })
      .sort((a, b) => (a.seed ?? 999) - (b.seed ?? 999) || (b.pl ? 1 : 0) - (a.pl ? 1 : 0) || (b.seedCp ?? -1) - (a.seedCp ?? -1) || (a.cp?.rank ?? 999) - (b.cp?.rank ?? 999) || (b.cc?.pts ?? -1) - (a.cc?.pts ?? -1) || (a.cc?.rank ?? 999) - (b.cc?.rank ?? 999));
    E = { src: 'official', seedSrc: list.every((t) => t.seedFixed) ? 'fixed' : list.every((t) => t.seed != null) ? 'official' : 'calc', list, pl: list.filter((t) => t.pl).length, ccN: list.filter((t) => !t.pl).length };
  } else {
    // 시드 CP: 로스터 변경을 반영한 CP
    const seedCp = (r) => r.total;
    const pl = cp.filter((r) => r.region === ev.region && !r.direct).sort((a, b) => seedCp(b) - seedCp(a) || a.rank - b.rank)
      .map((r) => ({ id: r.id, short: r.short, name: r.name, pl: true, cp: r, seedCp: seedCp(r) }));
    const cc = ev.cc || [];
    const n = Math.max(0, 40 - pl.length);
    const order = [...cc.filter((c) => c.win), ...cc.filter((c) => !c.win)];
    const pick = order.slice(0, n), next = order[n];
    const tie = !!(next && pick.length && !pick.at(-1).win && pick.at(-1).pts === next.pts);
    const ccSeeded = pick.slice().sort((x, y) => y.pts - x.pts || x.rank - y.rank);
    E = { src: 'projected', pl: pl.length, ccN: pick.length, tie, list: [...pl, ...ccSeeded.map((c) => ({ id: null, short: c.short, name: c.name, pl: false, cc: c }))] };
  }
  E.groupSrc = lobby.a?.length || lobby.b?.length ? 'official' : 'snake';
  const off = E.groupSrc === 'official';
  // 확정 시드가 있으면 조는 그 시드의 지그재그 자리다(확정본이 곧 조 편성이므로, 공식 API 조 명단의 오류·지연보다 우선한다)
  const gOf = (t, i) => { if (t.seedFixed) return lcqGroupOf(t.seed - 1); const a = !!lobby.a?.includes(t.short), b = !!lobby.b?.includes(t.short); return a !== b ? (a ? 'a' : 'b') : off ? null : lcqGroupOf(i); };
  E.list = E.list.map((t, i) => ({ ...t, seedN: t.seed ?? i + 1, group: gOf(t, i) }));
  if (off) { // 공식 조 명단에 두 조 모두 적혔거나 어느 조에도 없는 팀(공식 자료 오류): 자리가 남는 조에 넣고 표시한다
    const half = Math.ceil(E.list.length / 2), n = { a: E.list.filter((t) => t.group === 'a').length, b: E.list.filter((t) => t.group === 'b').length };
    for (const t of E.list) if (!t.group) { t.group = n.a < half && (n.a <= n.b || n.b >= half) ? 'a' : 'b'; n[t.group]++; t.groupGuess = true; }
  }
  // 공식 시드는 아직 없고 공식 조만 나온 경우: 조 안의 순서는 계산값을 쓰되, 시드 번호는 공식 조에 맞는 자리(A: 1·4·5·8…, B: 2·3·6·7…)로 매긴다
  if (off && E.seedSrc === 'calc') {
    const slots = { a: [], b: [] }, k = { a: 0, b: 0 };
    E.list.forEach((_, i) => slots[lcqGroupOf(i)].push(i + 1));
    for (const t of E.list) t.seedN = slots[t.group][k[t.group]++] ?? t.seedN;
    E.list.sort((x, y) => x.seedN - y.seedN);
  }
  return E;
}
const ccLabel = (c) => (c.win > 0 ? `CC #${c.win} 우승` : c.win ? 'CC 우승' : `CC 종합 ${c.rank}위`);
const seedLabel = (t) => (t.seed ? `${t.seed}번 시드` : t.cp ? `CP ${t.cp.rank}위` : t.cc ? ccLabel(t.cc) : '2부');
// 단계별 상태와 출전 팀: 결과 > 공식 출전 명단 > 앞 경기 결과로 계산한 배정(LCQ_FLOW) / 그룹은 시드 배정
function lcqBracket(ev) {
  const ss = A.series.filter((s) => s.eventId === ev.eventId);
  const E = lcqEntrants(ev);
  const bySh = new Map(E.list.map((t) => [t.short, t]));
  const seed = (sh) => { const t = bySh.get(sh); return t ? { n: t.seedN, label: seedLabel(t) } : null; };
  const B = { ev, E, seed, FLOW: LCQ_FLOW };
  for (const S of LCQ_STAGES) {
    const x = ss.find((y) => y.name === S.name || (S.key === 'f' && y.phase === 'Match Point Finals'));
    B[S.key] = { ...S, ev, seed, s: x, start: x?.start, tbd: !!x?.timeTbd, status: !x ? 'none' : x.status === 'completed' ? 'completed' : x.live || x.status === 'live' ? 'live' : 'pending' };
  }
  // 칸(slot): 다음 경기의 자리마다 '어느 경기 몇 위'가 오는지, 앞 경기가 끝났으면 그 팀
  for (const S of LCQ_STAGES) {
    const st = B[S.key];
    st.slots = LCQ_FLOW[S.key]
      ? LCQ_FLOW[S.key].flatMap(([k, a, b]) => Array.from({ length: b - a + 1 }, (_, i) => {
        const p = a + i, src = B[k];
        const r = src.s?.status === 'completed' ? src.s.results?.find((y) => y.pos === p) : null;
        return { short: r?.short || null, label: `${src.tab} ${p}위` };
      }))
      : E.list.filter((t) => t.group === S.key).map((t) => ({ short: t.short, label: `${t.seedN}번 시드` }));
    if (!LCQ_FLOW[S.key]) st.from = `<span>그룹 ${S.key.toUpperCase()} ${S.n}팀(시드 지그재그)</span>`;
  }
  for (const S of LCQ_STAGES) {
    const st = B[S.key], x = st.s;
    const filled = st.slots.filter((y) => y.short).map((y) => y.short);
    if (x?.results?.length) { st.teams = x.results.map((r) => r.short); st.src = 'results'; }
    else if (x?.lineup?.length) { st.teams = x.lineup; st.src = 'official'; }
    else if (filled.length === st.slots.length && filled.length) { st.teams = filled; st.src = LCQ_FLOW[S.key] ? 'projected' : E.groupSrc === 'official' ? 'official' : 'seeded'; }
    else { st.teams = filled; st.src = filled.length ? 'partial' : null; }
  }
  B.list = LCQ_STAGES.map((S) => B[S.key]);
  B.started = B.list.some((st) => st.status === 'live' || st.status === 'completed');
  B.done = B.f.status === 'completed';
  return B;
}
// 순위 → 다음 경기
const lcqDest = (st, pos) => (st.top ? (pos <= st.top ? st.up : '') : pos <= st.cut ? st.up : st.down);
const lcqRegionDefault = () => {
  if (opt.mode === 'custom') { const t = Object.values(A.teams).find((x) => x.id === mainId()) || Object.values(A.teams).find((x) => opt.fav.includes(x.id)); if (t?.region) return t.region; }
  return ML().region || 'apac-n';
};

// 조 편성 탭: 그룹 A·B 시드 표
// 선수 명단 한 줄: 선수 · 코치. 프로리그 팀은 공식 로스터(로스터 이동 반영), 2부 팀은 Liquipedia LCQ 참가 명단
//   한국 선수는 점 표시, 서브는 (서브)
function rosterLine(t, ev) {
  const ps = t.pl ? (team(t.short)?.roster || []).map((p) => [p.n, p.c, 0, p.r]) : (t.cc?.players || ev.cc?.find((c) => c.short === t.short || c.name === t.name)?.players || []);
  if (!ps.length) return '';
  const nm = (p) => `<span${p[1] === 'KR' ? ' class="kr-p"' : ''}>${p[1] === 'KR' ? '<span class="krdot k-team"></span>' : ''}${esc(p[0])}${p[2] ? ' <span class="sub">(서브)</span>' : ''}</span>`;
  const co = ps.filter((p) => p[3] === 'k');
  return `<small class="lcq-roster">${ps.filter((p) => p[3] !== 'k').map(nm).join(' · ')}${co.length ? ` · 코치 ${co.map(nm).join(', ')}` : ''}</small>`;
}
const rosterOpen = new Set(); // 조 편성에서 선수 이름을 펼친 그룹 ('a', 'b')
function lcqGroups(B) {
  const E = B.E;
  const row = (t) => `<tr class="${rowCls(t)}"><td class="rank">${t.seedN}</td><td class="team">${krDot(null, t.short)}${teamLink(t.short, t.name)}${t.cc?.was || team(t.short)?.was ? `<small>구 ${esc(t.cc?.was || team(t.short).was)}</small>` : t.off ? `<small>공식 표기 ${esc(t.off)}</small>` : ''}${t.groupGuess ? '<small class="warn">공식 조 표기 확인 필요</small>' : ''}${rosterLine(t, B.ev)}</td><td class="r num">${t.cp ? `${fmt(t.seedCp ?? t.cp.total)}<small class="unit">CP</small>${t.seedCp != null && t.seedCp !== t.cp.total ? `<small class="seedcp" title="로스터 변경 뒤 팀 CP">변경 뒤 ${fmt(t.cp.total)}</small>` : ''}` : t.cc ? `${fmt(t.cc.pts)}<small class="unit">CCP</small>` : '–'}</td><td class="r small muted">${esc(seedLabel(t))}</td></tr>`;
  const col = (g) => {
    const st = B[g];
    let ts = E.list.filter((t) => t.group === g);
    const nF = ts.filter((t) => isF(t.short)).length;
    if (opt.krOnly) ts = ts.filter((t) => isF(t.short));
    const open = rosterOpen.has(g);
    return `<section class="lcq-g${open ? ' roster-on' : ''}" aria-label="${esc(st.ko)}"><h3 class="h3">그룹 ${g.toUpperCase()} <small class="muted">${E.list.filter((t) => t.group === g).length}팀${nF ? ` · ${esc(ML().tag)} ${nF}` : ''}${st.start ? ` · ${esc(stWhen(st))}` : ''}</small><button type="button" class="link-btn roster-btn" data-roster="${g}" aria-pressed="${open}">${open ? '선수 접기' : '선수 보기'}</button></h3>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>시드</th><th>팀</th><th class="r">포인트</th><th class="r">근거</th></tr></thead><tbody>${ts.map(row).join('')}</tbody></table></div></section>`;
  };
  // 문장마다 <span>: 번역 사전이 문장 단위로 맞춘다
  const basis = E.src === 'official' ? (E.seedSrc === 'fixed' ? '<span>공식 출전 명단이며, 시드는 주최 측이 확정한 조 편성 순서입니다.</span>' : E.seedSrc === 'official' ? '<span>공식 API가 공개한 출전 명단입니다(공식 시드 순).</span>'
      : '<span>공식 API가 공개한 출전 명단입니다.</span> <span>시드 번호는 공식 값이 나오기 전이라 추정입니다: 공식 조 편성에 맞춰, 조 안에서는 프로리그 팀 시드 CP 순, 그다음 2부 팀 챌린저 서킷 포인트 순으로 매겼습니다.</span> <span>실제 시드는 로스터 변경과 2부 팀의 챌린저 시리즈 포인트까지 반영해 정해지므로, 2부 팀이 프로리그 팀 사이에 들어가는 등 달라질 수 있습니다.</span>')
    : `<span>시드는 프로리그 ${E.pl}팀(챔피언십 포인트 직행권 ${A.season.cpDirectSlots}위 밖, CP 순) 다음에 2부 ${E.ccN}팀(Split ${lastSplit()} 챌린저 서킷 우승팀과 종합 포인트 상위 팀, 서킷 포인트 CCP 순)입니다.</span>${E.tie ? ' <span>2부 마지막 자리는 포인트 동점 팀이 있어 바뀔 수 있습니다.</span>' : ''} <span>실제 시드는 로스터 변경과 2부 팀의 챌린저 시리즈 포인트까지 반영해 정해지므로, 2부 팀이 프로리그 팀 사이에 들어가는 등 달라질 수 있습니다.</span>`;
  const grp = E.groupSrc === 'official' ? '<span>그룹은 공식 배정입니다.</span>' : '<span>그룹은 시드 지그재그 배정(A: 1·4·5·8·9…, B: 2·3·6·7·10…)이며, 공식 배정이 나오면 바뀝니다.</span>';
  const src = E.src !== 'official' && E.ccN ? `<p class="caption">2부 팀 포인트는 챌린저 서킷 포인트(CCP)입니다. 출처: <a href="https://liquipedia.net/apexlegends/Apex_Legends_Global_Series/${A.meta?.year || 2026}/Split_${lastSplit()}/Challenger_Circuits/${{ 'apac-n': 'APAC_North', 'apac-s': 'APAC_South', emea: 'EMEA', americas: 'Americas' }[B.ev.region]}" target="_blank" rel="noopener">Liquipedia</a> (CC-BY-SA)</p>` : '';
  const how = `<section class="sec" aria-labelledby="h-lcq-how"><h2 class="h2" id="h-lcq-how">진행 방식</h2>${stageFlow(B, LCQ_FLOW_L, (k) => qsLink(B.base, B.q, { m: k }), 'LCQ 진행 방식')}</section>`;
  return `${how}${schedTable(B)}<p class="caption">${basis} ${grp} <span>관심 팀은 선수 이름을 늘 보여 주고, 나머지 팀은 '선수 보기'로 펼칩니다.</span></p>${jumpBar(E.list.map((t) => ({ short: t.short })))}<div class="lcq-gcols">${col('a')}${col('b')}</div>${src}`;
}

// 일정표 (LCQ·챔피언십 조 편성 탭)
const schedTable = (B) => `<section class="sec" aria-labelledby="h-st-sch"><h2 class="h2" id="h-st-sch">일정</h2>
  <div class="tbl-wrap"><table class="tbl lcq-sch"><thead><tr><th>경기</th><th>시각</th><th class="r">게임</th><th class="r">상태</th></tr></thead><tbody>
  ${B.list.map((st) => `<tr class="${st.status === 'live' ? 'live' : st.status === 'completed' ? 'done' : ''}"><td class="sn"><a href="${qsLink(B.base, B.q, { m: st.key })}">${esc(st.ko)}</a></td><td class="num sw">${esc(stWhen(st))}</td><td class="r sg">${st.key === 'gs' ? '' : gameCount(st.s, st.key === 'f')}</td><td class="r small ss">${esc(stageState(st))}</td></tr>`).join('')}
  </tbody></table></div></section>`;

// 점수창의 진행 상황: 'N매치 진행 중'(게임 중) / 'N매치 완료'(게임 사이·끝) — 게임별 상태를 아직 모르면 'N게임째'
function gameNow(s) {
  if (!s) return '';
  if (s.status === 'completed' && !s.live) return s.matches ? `<span class="gnow done">${s.matches}매치 완료</span>` : '';
  if (!(s.live || s.status === 'live')) return '';
  const g = GAMES[s.id]?.by, nums = g ? Object.keys(g).map(Number) : [];
  const done = s.gDone ?? (nums.length ? nums.filter((n) => g[n].st === 'completed').length : null);
  const live = s.gLive ?? (nums.length ? nums.find((n) => g[n].st === 'live') || 0 : null);
  if (done == null) return s.games ? `<span class="gnow live">${s.games}게임째</span>` : '';
  return live ? `<span class="gnow live"><i></i>${live}매치 진행 중</span>` : `<span class="gnow wait">${done}매치 완료</span>`;
}
// 그림(SVG) 안에 넣을 게임 수 글자 (gameCount 와 같은 규칙)
const gcText = (st) => { const s = st.s, done = st.status === 'completed', played = done ? s?.matches || 0 : st.status === 'live' ? s?.games || 0 : 0; return st.key === 'f' ? (played ? `<tspan>결승</tspan> · ${played}G` : '<tspan>결승</tspan>') : `${played}/${s?.matches || 6}`; };
// 진행 방식 그림 (LCQ·챔피언십 공통). 상자 = 경기(상태·시각·관심 팀), 화살표 = 진출. 상자를 누르면 그 경기 탭
//   L = { h: 그림 높이, nodes: { 단계: [x, y, 제목] }, edges: [[출발, 도착, 출발 y, 도착 y, 라벨]], notes: [[단계, 글]] (상자 아래 한 줄) }
function stageFlow(B, L, href, label) {
  const W = 170, H = 96;
  const st = (k) => B[k] || B.list.find((x) => x.key === k);
  const nextKey = B.list.find((x) => L.nodes[x.key] && (x.status === 'pending' || x.status === 'live' || x.status === 'none'))?.key;
  const adv = (x, sh) => { if (x.status !== 'completed') return null; const r = x.s?.results?.find((y) => y.short === sh); return !r ? null : x.key === 'f' ? !!r.won : r.pos <= x.cut; };
  const edge = ([a, b, oy, iy, lab]) => {
    const [ax, ay] = L.nodes[a], [bx, by] = L.nodes[b];
    const x1 = ax + W, y1 = ay + oy, x2 = bx, y2 = by + iy, mx = (x1 + x2) / 2;
    const k = /하위/.test(lab) ? 'down' : 'up';
    return `<path d="M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2 - 3} ${y2}" class="bf-edge ${k}" marker-end="url(#sfArrow-${k})"/><text x="${x1 + 6}" y="${y1 - 5}" class="bf-elab ${k}">${esc(lab)}</text>`;
  };
  const node = (k) => {
    const x0 = st(k); if (!x0) return '';
    const [x, y, title] = L.nodes[k];
    const cls = ['bf-node', x0.status === 'completed' ? 'done' : '', x0.status === 'live' ? 'live' : '', k === nextKey && x0.status !== 'live' ? 'next' : ''].join(' ');
    const ks = krIn(x0.teams || []);
    let cx = x + 12;
    const chips = ks.slice(0, 4).map((sh) => {
      const w = sh.length * 7.4 + 12, a = adv(x0, sh);
      const out = `<g class="bf-chip ${CAT[krOf(sh)]} ${a === false ? 'out' : a ? 'up' : ''}"><rect x="${cx}" y="${y + 66}" width="${w}" height="18" rx="9"/><text x="${cx + w / 2}" y="${y + 79}" text-anchor="middle">${esc(sh)}</text></g>`;
      cx += w + 4; return out;
    }).join('') + (ks.length > 4 ? `<text x="${cx}" y="${y + 77}" class="bf-more" dy="2">+${ks.length - 4}</text>` : '');
    const when = stTab(x0);
    return `<a href="${esc(href(k))}" class="${cls}" aria-label="${esc(title)} ${esc(stageState(x0))}${ks.length ? ', ' + ks.join(' ') : ''}">
      <rect x="${x}" y="${y}" width="${W}" height="${H}" rx="10" class="bf-box"/>
      <text x="${x + 12}" y="${y + 21}" class="bf-title">${esc(title)}</text>
      <text x="${x + W - 10}" y="${y + 21}" text-anchor="end" class="bf-gc${x0.status === 'live' ? ' live' : ''}">${gcText(x0)}</text>
      <text x="${x + 12}" y="${y + 38}" class="bf-state">${esc(stageState(x0))}</text>
      <text x="${x + 12}" y="${y + 53}" class="bf-sub">${x0.n}팀${when ? ' · ' + esc(when) : ''}</text>
      ${ks.length ? chips : `<text x="${x + 12}" y="${y + 79}" class="bf-sub2">${x0.teams?.length ? esc(ML().none) : '출전 팀 미정'}</text>`}</a>`;
  };
  const note = ([k, t]) => { const [x, y] = L.nodes[k]; return `<text x="${x + 12}" y="${y + H + 16}" class="bf-note ${/탈락/.test(t) ? 'out' : /챔피언십/.test(t) ? 'champ' : ''}">${/탈락/.test(t) ? '✕ ' : /챔피언십/.test(t) ? '★ ' : ''}${esc(t)}</text>`; };
  const notes = Object.fromEntries(L.notes || []);
  const vert = flowV(flowOrder(Object.keys(L.nodes).filter((k) => st(k)), L.nodes).map((k) => { const x0 = st(k); return { key: k, title: L.nodes[k][2], st: x0, cls: [x0.status === 'completed' ? 'done' : '', x0.status === 'live' ? 'live' : '', k === nextKey && x0.status !== 'live' ? 'next' : ''].join(' '), href: href(k), when: stTab(x0), adv: (sh) => adv(x0, sh), outs: L.edges.filter((e) => e[0] === k).map((e) => [e[4], e[1]]), note: notes[k] }; }), label);
  return `<div class="bf-both"><div class="bf-wrap"><svg class="bf" viewBox="0 0 880 ${L.h}" role="group" aria-label="${esc(label)}">
    <defs>${['up', 'down'].map((k) => `<marker id="sfArrow-${k}" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L8 4 L0 8 z" class="bf-arrow ${k}"/></marker>`).join('')}</defs>
    ${L.edges.map(edge).join('')}${Object.keys(L.nodes).map(node).join('')}${(L.notes || []).map(note).join('')}</svg></div>${vert}</div>`;
}
// 홈 점수표: 지금(진행 중 → 마지막으로 끝난 → 출전 팀이 정해진 다음) 경기. 같은 시각에 함께 열리는 경기(예: 그룹 A·B)도 함께
const homeStages = (B) => {
  const ms = B.list.filter((x) => x.key !== 'gs');
  const c = ms.find((x) => x.status === 'live') || ms.filter((x) => x.status === 'completed').at(-1) || ms.find((x) => x.teams?.length === x.n);
  return !c ? [] : c.start ? ms.filter((x) => x.start === c.start && x.status === c.status) : [c];
};

// 경기 시작 전 출전 명단 (순위 탭 경기 화면): 시드(또는 자리) 순 두 줄 목록. 번호는 시드, 시드가 아닌 자리 이름(예: 승자 1R A 11~20위)은 작은 글씨
function preGrid(B, st, rows) {
  const known = rows.filter((r) => r.short).length;
  const item = (r, i) => {
    const sd = r.short ? B.seed(r.short) : null, n = sd?.n ?? (/^(\d+)번 시드$/.exec(r.label || '') || [])[1];
    const lab = r.label && !/^\d+번 시드$/.test(r.label) ? `<small>${esc(r.label)}</small>` : '';
    return `<li class="${r.short ? rowCls(r) : 'slot'}"><span class="pg-n">${n ?? i + 1}</span><span class="pg-t">${r.short ? `${krDot(null, r.short)}${teamLink(r.short)}` : '<span class="muted">미정</span>'}${lab}</span></li>`;
  };
  return `${jumpBar(rows)}<p class="caption pg-cap"><span>경기 전이라 시드 순 출전 명단입니다.</span> <span>경기가 시작되면 순위·킬·종합 점수표로 바뀝니다.</span>${known < st.n ? ` <span class="muted">${known}/${st.n}팀 확정</span>` : ''}</p><ol class="pre-grid">${rows.map(item).join('')}</ol>`;
}
// 긴 표(10줄 넘음)에 관심 팀이 있으면 '내 팀으로 이동' 단추. 누를 때마다 다음 관심 팀 줄로 (아래 클릭 처리)
const jumpBar = (rows) => (rows.length > 10 && rows.some((r) => r.short && isF(r.short)) ? `<div class="st-tools"><button type="button" class="link-btn st-jump" data-jump-mine>${mainId() ? '내 팀으로 이동' : '관심 팀으로 이동'}</button></div>` : '');

// 점수표 (LCQ·챔피언십 공통): 경기 전에는 자리 칸, 결과가 들어오면 순위 / 킬 / 종합
//   다음(결과) 칸: 진출 규칙(cut)이 있는 단계와 결승만
//   mini: 홈 요약 — 상위 3팀 + 컷 경계 두 팀 + 관심 팀만, 시드 글자·게임별 칸 없이. 결과가 아직 없으면 출전 관심 팀만 (stageMini 참고)
function stageGrid(B, st, limit = 0, mini = false) {
  const x = st.s, res = x?.results?.some((r) => r.pos) ? x.results : null;
  if (mini && !res) {
    const fs = (st.teams || x?.lineup || []).filter(isF);
    return `<p class="lvm-wait">${st.status === 'live' ? '첫 매치가 끝나면 순위가 나옵니다.' : '아직 결과가 없습니다.'}</p>${fs.length ? `<p class="lvm-chips">${fs.map((sh) => `<span class="evc ${CAT[krOf(sh)] || ''}">${esc(sh)}</span>`).join('')}</p>` : ''}`;
  }
  const slotOf = new Map(st.slots.filter((y) => y.short).map((y) => [y.short, y.label]));
  let rows;
  if (res) rows = res.map((r) => ({ ...r, label: slotOf.get(r.short) || B.seed(r.short)?.label || '' }));
  else if (x?.lineup?.length) rows = x.lineup.map((sh) => ({ short: sh, label: slotOf.get(sh) || B.seed(sh)?.label || '' })).sort((a, b) => (B.seed(a.short)?.n ?? 999) - (B.seed(b.short)?.n ?? 999));
  else rows = st.slots.map((y) => ({ short: y.short, label: y.label }));
  while (rows.length < st.n) rows.push({ short: null, label: '' });
  if (opt.krOnly) rows = rows.filter((r) => r.short && isF(r.short));
  if (limit) rows = rows.filter((r, i) => i < limit || (r.short && isF(r.short)));
  if (mini) rows = rows.filter((r) => r.pos && (r.pos <= 3 || (st.cut && st.status !== 'completed' && (r.pos === st.cut || r.pos === st.cut + 1)) || isF(r.short))).map((r) => ({ ...r, label: '' }));
  const hasDest = !!st.cut || st.key === 'f';
  // 순위 탭의 경기 화면(limit 없음)에서 시작 전이면: 빈 점수 칸 없이 시드 순 출전 명단을 두 줄로 (시작하면 아래 점수표)
  if (!limit && !res && st.status !== 'live') return preGrid(B, st, rows);
  const G = mini ? null : gameCols(x, st.key === 'f');
  // 진행 중: 컷 라인과의 점수 차 (위는 바로 아래 팀(cut+1위)보다 몇 점 앞서는지, 아래는 cut위까지 몇 점 모자라는지). 동점 규칙은 따지지 않은 단순 점수 차
  const tp = (pos) => { const y = res?.find((z) => z.pos === pos); return y ? ptsOf(y.pts, y.kills).tp : null; };
  const lineIn = st.cut && st.status === 'live' ? tp(st.cut) : null, lineOut = st.cut && st.status === 'live' ? tp(st.cut + 1) : null;
  const gap = (r) => {
    const me = ptsOf(r.pts, r.kills).tp;
    if (me == null || lineIn == null || lineOut == null) return '';
    const d = r.pos <= st.cut ? me - lineOut : me - lineIn;
    return ` <small class="cutgap ${d >= 0 ? 'in' : 'out'}" title="컷 라인과 점수 차"><span>컷</span> ${d > 0 ? '+' : d < 0 ? '−' : '±'}${Math.abs(d)}</small>`;
  };
  const dest = (r) => {
    if (!r.pos) return '';
    if (st.key === 'f') return r.won ? '<span class="tag mpe">우승</span>' : st.top && st.status === 'completed' && r.pos <= st.top ? '<span class="tag ok">챔피언십 진출</span>' : r.mpe ? '<span class="tag mpe">MP</span>' : '';
    const d = lcqDest(st, r.pos);
    return `<span class="adv ${r.pos <= st.cut ? 'up' : d === '탈락' ? 'out' : 'down'}">${d === '탈락' ? '탈락' : `→ ${esc(d)}`}</span>${gap(r)}`;
  };
  const body = rows.map((r, i) => {
    const skip = mini && i > 0 && r.pos > rows[i - 1].pos + 1 ? `<tr class="gap"><td colspan="${hasDest ? 4 : 3}" aria-hidden="true">⋯</td></tr>` : '';
    const cutHere = !opt.krOnly && st.cut && (res ? r.pos === st.cut : false);
    const gx = !mini && r.short && r.pos && gamesOk(x), open = gx && gxOpen(x, r.short);
    return `${skip}<tr class="${r.short ? rowCls(r) : 'slot'} ${cutHere && !open ? 'cut' : ''}${gx ? ' gx' : ''}"${gx ? gxAttr(x, r.short) : ''}><td class="rank">${r.pos ?? '–'}${gx ? '<i class="gx-chev" aria-hidden="true"></i>' : ''}</td><td class="team">${r.short ? `${krDot(null, r.short)}${teamLink(r.short)}` : '<span class="muted">미정</span>'}${r.label ? `<small>${esc(r.label)}</small>` : ''}</td>${mini ? `<td class="r num"><b>${ptsOf(r.pts, r.kills).tp ?? '–'}</b></td>` : ptsTd(r.pts, r.kills)}${G && r.short && r.pos ? G.td(r.short) : G ? `<td class="gc" colspan="${G.n}"></td>` : ''}${hasDest ? `<td class="r small dest">${dest(r)}</td>` : ''}</tr>${gx ? gxRow(B, x, G, r.short, open, `${rowCls(r)} ${cutHere ? 'cut' : ''}`) : ''}${cutHere ? `<tr class="cut-label"><td colspan="${(hasDest ? 6 : 5) - (mini ? 2 : 0) + (G ? G.n : 0)}">여기까지 ${esc(st.up)}, 아래는 ${esc(st.down)}</td></tr>` : ''}`;
  }).join('');
  const cap = res && x.liveAt ? `${ago(x.liveAt)} 공식 API 확인` : st.computed ? '조별 리그 경기 결과를 사이트에서 합산한 순위입니다.' : '';
  const table = `<div class="tbl-wrap${G ? ' gtab' : ''}"><table class="tbl lcq-grid${mini ? ' mini' : ''}"><thead><tr><th>#</th><th>팀</th>${mini ? '<th class="r pts-h" title="종합 점수" data-tr="종합 점수 칸">종합</th>' : PTS_TH}${G ? G.th : ''}${hasDest ? `<th class="r dest">${st.status === 'completed' ? '결과' : '다음'}</th>` : ''}</tr></thead><tbody>${body}</tbody></table></div>`;
  return `${limit || mini ? '' : jumpBar(rows)}${mini ? table : gview(x, G, table)}${cap && !mini ? `<p class="caption">${esc(cap)}</p>` : ''}`;
}
// 단계 시각 (LCQ·챔피언십 공통): 'MM.DD (요일) HH:mm KST'. 공식 시각이 임시값이면 '시각 미정', 날짜만 알면 날짜
const stWhen = (st) => (st.whenText ? st.whenText : st.start && !st.tbd ? `${dateTime(st.start)} ${TZL}` : st.date ? `${dayLabel(st.date)} 시각 미정` : st.tbd ? '시각 미정' : '일정 미정');
const stTab = (st) => (st.tabText != null ? st.tabText : st.start && !st.tbd ? `${dayLabel(dayKey(st.start)).slice(0, 5)} ${hhmm(st.start)}` : st.date ? dayLabel(st.date).slice(0, 5) : st.tbd ? '시각 미정' : '');
// 경기 탭 머리 (LCQ·챔피언십 공통): 이름·상태·시각, 출전과 진출 규칙 한 줄, 점수표
function stageMatch(B, st) {
  const x = st.s;
  const tag = (st.status === 'live' ? `<span class="tag live">LIVE</span>${watchBtn()}` : st.status === 'completed' ? '<span class="tag">종료</span>' : `<span class="tag">${esc(stageState(st))}</span>`) + ` ${gameCount(x, st.key === 'f')} ${gameNow(x)}`;
  const flow = B.FLOW[st.key];
  const from = st.from || (flow ? flow.map(([k, a, b]) => `<span>${esc(`${B[k].tab} ${a}~${b}위`)}</span>`).join(' + ') : '');
  const rule = st.key === 'f' ? `매치 포인트 ${x?.mpThreshold || 50}점 도달 후 게임 1위를 하면 우승${st.top ? ` · 상위 ${st.top}팀 챔피언십 진출` : ''}` : st.cut ? `1~${st.cut}위 → ${st.up} · ${st.cut + 1}~${st.n}위 → ${st.down}` : '';
  const main = `<section class="sec lcq-m"><div class="bk-stage-h"><h2 class="h2">${x?.id ? olink(officialUrl(x), esc(st.ko)) : esc(st.ko)}</h2> ${tag}${x?.mp ? ' <span class="tag mp">매치 포인트</span>' : ''}<span class="when">${esc(stWhen(st))}</span></div>
    ${from || rule ? `<p class="bk-rule lcq-rule">${from ? `<span>출전: ${from}</span>` : ''}${rule ? `<span>${esc(rule)}</span>` : ''}</p>` : ''}${stageGrid(B, st)}</section>`;
  const poi = poiSection(B, st);
  // 넓은 화면(본문 1160px 이상)에서는 점수표 왼쪽, POI 지도 오른쪽 (CSS 컨테이너 쿼리). 좁으면 지금처럼 위아래
  return poi ? `<div class="st-split"><div class="st-split-in">${main}${poi}</div></div>` : main;
}
// POI 드래프트 (scripts/poi-maps.mjs → A.poi): 팀별 낙하 지점 선택. 공식 사이트의 'Map View'와 같은 자료다.
//   바탕 지도(poi/base)는 모든 드래프트가 같이 쓰고, 팀 핀은 좌표(%)로 화면에서 얹는다.
//   핀에 마우스를 올리거나(키보드 포커스·휴대폰은 누르기) 팀 로고·이름·낙하 지점이 뜨고, 같은 번호의 표 줄이 함께 강조된다.
//   끝난 드래프트는 빌드가 확정해 둔 목록(A.poi[시리즈].maps)을 쓴다. 아직 안 끝난 드래프트는 앞 라운드가 끝난 때(after)부터 2시간, 또는 드래프트 시각 15분 전부터, 그 구역을 보고 있는 동안만
//   브라우저가 공식 API에서 직접 받아 선택이 나오는 대로 보여 주고(경기 점수 실시간과 같은 방식), 끝나면 멈춘다. 빌드가 확정한 목록이 오면 그것으로 바뀐다.
let poiBig = false; // 크게 보기: 좁은 화면은 지도를 가로로 밀어서 보고, 넓은 화면(900px 이상)은 화면 전체에 왼쪽 지도·오른쪽 팀 목록
const POI_LIVE = {}; // 시리즈 ID → { maps, picked, total, done, active, missed } (공식 API에서 직접 받은 진행 상황)
let poiWatch = null, poiAsked = null; // 지금 화면에 있는 안 끝난 드래프트 { id, draft, date, after } / 방금 바로 확인을 요청한 시리즈
const poiSlug = (x) => String(x || '').toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); // scripts/poi-maps.mjs 와 같은 규칙
const poiInit = (name) => { const w = String(name || '').split(/[^A-Za-z0-9]+/).filter(Boolean); return (w.length > 1 ? w.map((x) => x[0]).join('').slice(0, 3) : (w[0] || '').slice(0, 3) || '?').toUpperCase(); };
// 공식 API의 드래프트 선택(/poi-drafts/{id}/pick) → 화면용 지도별 핀 목록. 아직 못 고른 줄(낙하 지점이 비어 있음)은 뺀다
function poiFromApi(d, picks) {
  const ok = (p) => p.map?.name && p.spawnLocation?.name && p.spawnLocation.x != null;
  const chosen = picks.filter(ok);
  const order = [...new Set(chosen.slice().sort((a, b) => a.actualPickNumber - b.actualPickNumber).map((p) => p.map.name))];
  const maps = order.map((name) => ({ map: name, base: `poi/base/${poiSlug(name)}.webp`, picks: chosen.filter((p) => p.map.name === name).sort((a, b) => a.pickNumber - b.pickNumber).map((p) => [p.pickNumber, p.team?.id, p.team?.name, p.spawnLocation.name, Number(p.spawnLocation.x), Number(p.spawnLocation.y)]) }));
  const done = !!d?.completed;
  return { maps, picked: chosen.length, total: picks.length, done, active: picks.find((p) => p.isActivePick && !ok(p))?.team?.name || null,
    missed: done ? [...new Map(picks.filter((p) => !ok(p)).map((p) => [p.team?.id, p.team?.name])).entries()] : [] };
}
// 드래프트는 앞 라운드가 끝나고 1시간 안에 열린다(운영자 확인). 공식 API의 드래프트 시각은 경기 시각을 넣어 둔 값이라 보조로만 쓴다
const poiOpen = (w, n = Date.now()) => { const a = Date.parse(w.after || ''), t0 = Date.parse(w.date || '');
  return (a && n >= a && n <= a + 2 * 3600e3) || (t0 && n >= t0 - 15 * 60e3 && n <= t0 + 6 * 3600e3); }; // 앞 라운드 종료 ~ 2시간 뒤, 또는 드래프트 시각 15분 전 ~ 6시간 뒤
async function poiTick() {
  const w = poiWatch;
  if (!w || document.hidden || LIVE.mode === 'off' || !w.draft) return;
  if (!poiOpen(w)) return;
  if (A.poi?.[w.id]?.done || POI_LIVE[w.id]?.done) return; // 끝났으면 더 받지 않는다
  const get = (u) => fetch(LIVE.api + u, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const [d, p] = await Promise.all([get(`/poi-drafts/${w.draft}`), get(`/poi-drafts/${w.draft}/pick`)]);
  if (!d || !p) return;
  POI_LIVE[w.id] = poiFromApi(d.poiDraft, p.picks || []);
  if (poiWatch?.id === w.id) render(); // 아직 이 구역을 보고 있을 때만 (그림은 내용이 바뀐 때만 다시 그려진다)
}
(function poiLoop() { setTimeout(() => { poiTick().catch(() => {}).finally(poiLoop); }, (C.livePollMs || 10000) + Math.random() * 3000); })(); // 요청이 몰리지 않게 무작위 지연
document.addEventListener('visibilitychange', () => { if (!document.hidden) poiTick().catch(() => {}); });

function poiSection(B, st) {
  const id = st.s?.id, P = A.poi?.[id];
  if (!P) return '';
  const L = POI_LIVE[id];
  const src = P.done ? P : L;
  const when = P.date || st.s?.start || null; // 드래프트 시작 시각(없으면 시리즈 시작 시각)
  if (!P.done) { poiWatch = { id, draft: P.draft, date: when, after: P.after || null }; if (poiAsked !== id) { poiAsked = id; setTimeout(() => poiTick().catch(() => {}), 50); } } // 이 구역을 열면 바로 한 번 확인
  const head = `<section class="sec poi" aria-labelledby="h-poi"><h2 class="h2" id="h-poi">POI 드래프트</h2>`;
  if (!src?.maps?.length) { // 아직 시작 전이거나, 시작했지만 첫 선택이 나오기 전
    const soon = poiOpen({ date: when, after: P.after }); // 드래프트 시각은 믿을 수 없어 안내에 쓰지 않는다
    return `${head}<p class="caption">${soon ? '<span>POI 드래프트가 곧 시작되거나 진행 중입니다.</span> <span>선택이 나오면 이곳에 바로 나타납니다.</span>' : '<span>POI 드래프트는 앞 라운드가 끝나고 1시간 안에 진행됩니다.</span> <span>선택이 나오면 이곳에 바로 나타납니다.</span>'}</p></section>`;
  }
  const cur = src.maps.find((m) => poiSlug(m.map) === poiSlug(B.q.get('pm'))) || src.maps[0]; // 이름('Storm Point')이든 경로용 이름('storm-point')이든
  const byId = new Map(B.E.list.map((t) => [t.id, t]));
  const hasLogo = (t) => { const lg = t && xteam(t.short)?.logo; return !!(lg && (lg[0] || lg[1])); };
  const teamCell = (t, name) => (t ? `${krDot(null, t.short)}${teamLink(t.short, t.name)}` : esc(name));
  const row = ([n, tid, name, spot]) => { const t = byId.get(tid); return `<tr class="${t ? rowCls(t) : ''}" data-n="${n}"><td class="rank">${n}</td><td class="team">${teamCell(t, name)}</td><td>${esc(spot)}</td></tr>`; };
  const missed = (src.missed || []).map(([tid, name]) => `<tr class="muted"><td class="rank">–</td><td class="team">${teamCell(byId.get(tid), name)}</td><td><span>미선택 (시간 초과)</span></td></tr>`);
  // 핀: 지도 폭에 비례해 커지고(cqw), 가장자리 가까이면 툴팁이 안쪽으로 열린다
  const pin = ([n, tid, name, spot, x, y]) => {
    const t = byId.get(tid), disp = t?.name || name;
    const ic = (cls) => (hasLogo(t) ? logo(t.short, cls, true) : `<span class="poi-ph ${cls}">${esc(poiInit(disp))}</span>`);
    const pos = `${y < 28 ? 'b' : 't'}${x < 30 ? 'l' : x > 70 ? 'r' : 'c'}`;
    return `<button type="button" class="poi-pin p-${pos}" style="left:${x}%;top:${y}%" data-n="${n}" aria-label="${esc(`#${n} ${disp} · ${spot}`)}"><span class="poi-dot">${ic('poi')}</span><i class="poi-num">${n}</i>
      <span class="poi-tip" role="tooltip">${ic('lg')}<span class="poi-tt"><b>${esc(disp)}</b><small>#${n} · ${esc(spot)}</small></span></span></button>`;
  };
  const seg = src.maps.length > 1 ? `<div class="seg" role="group" aria-label="지도">${src.maps.map((m) => `<a href="${qsLink(B.base, B.q, { pm: m.map })}" data-keep-scroll aria-current="${m === cur}">${esc(m.map)}</a>`).join('')}</div>` : '';
  const status = P.done ? '' : !L ? '' : L.done ? '<p class="poi-live"><span class="tag">종료</span> <span>드래프트가 끝났습니다. 공식 기록으로 곧 확정됩니다.</span></p>'
    : `<p class="poi-live"><span class="tag live">LIVE</span> <span>POI 드래프트 진행 중</span> <small class="muted">${L.picked}/${L.total}</small>${L.active ? ` <span>지금 고르는 팀:</span> <b>${esc(L.active)}</b>` : ''}</p>`;
  return `${poiBig ? head.replace('class="sec poi"', 'class="sec poi big"') : head}${status}
    <p class="caption"><span>팀별 낙하 지점(POI) 선택입니다.</span> <span>핀의 번호는 드래프트 선택 순서입니다. 핀에 마우스를 올리거나 누르면 팀과 낙하 지점이 보입니다.</span> <span>출처: ALGS 공식 사이트</span></p>
    <div class="poi-bar">${seg}<button type="button" class="link-btn poi-zoom" data-poi-zoom aria-pressed="${poiBig}">${poiBig ? '작게 보기' : '크게 보기'}</button>${poiBig ? '<button type="button" class="poi-close" data-poi-zoom aria-label="닫기">✕</button>' : ''}</div>
    <figure class="poi-fig"><div class="poi-scroll${poiBig ? ' big' : ''}"><div class="poi-map"><img class="poi-base" src="${esc(cur.base)}" width="1255" height="1255" alt="${esc(cur.map)}" loading="lazy" decoding="async" onerror="this.style.visibility='hidden'">${cur.picks.map(pin).join('')}</div></div></figure>
    <div class="tbl-wrap"><table class="tbl poi-tbl"><thead><tr><th>#</th><th>팀</th><th>낙하 지점</th></tr></thead><tbody>${cur.picks.map(row).join('')}${missed.join('')}</tbody></table></div></section>`;
}
// 핀 ↔ 표 줄 강조(같은 번호), 휴대폰·터치에서 핀 누르면 툴팁 열기, 크게 보기 전환
{
  const hl = (e, on) => { const el = e.target.closest?.('.poi [data-n]'); if (el) el.closest('.poi').querySelectorAll(`[data-n="${el.dataset.n}"]`).forEach((x) => x.classList.toggle('hl', on)); };
  document.addEventListener('mouseover', (e) => hl(e, true));
  document.addEventListener('mouseout', (e) => hl(e, false));
  document.addEventListener('focusin', (e) => hl(e, true));
  document.addEventListener('focusout', (e) => hl(e, false));
  document.addEventListener('click', (e) => {
    const pin = e.target.closest?.('.poi-pin');
    document.querySelectorAll('.poi-pin.on').forEach((x) => { if (x !== pin) x.classList.remove('on'); });
    if (pin) pin.classList.toggle('on');
    // 팀 목록 줄을 누르면(팀 이름 링크 말고) 지도에서 그 팀 핀의 설명을 연다
    const tr = !pin && !e.target.closest?.('a') && e.target.closest?.('.poi-tbl tr[data-n]');
    if (tr) tr.closest('.poi').querySelector(`.poi-pin[data-n="${tr.dataset.n}"]`)?.classList.add('on');
    if (e.target.closest?.('[data-poi-zoom]')) { poiBig = !poiBig; animNext = 'soft'; render(); }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (document.querySelector('.poi-pin.on')) document.querySelectorAll('.poi-pin.on').forEach((x) => x.classList.remove('on'));
    else if (poiBig && document.querySelector('.poi.big')) { poiBig = false; render(); } // 크게 보기 닫기
  });
  // 다른 경기·지역·화면으로 가면 크게 보기를 닫는다 (지도(pm)만 바꿀 때는 그대로)
  let poiKey = location.hash.replace(/([?&])pm=[^&]*/, '$1');
  addEventListener('hashchange', () => { const k = location.hash.replace(/([?&])pm=[^&]*/, '$1'); if (k !== poiKey) poiBig = false; poiKey = k; });
}
/* ---------- 순위 탭: 선택줄 고정 · 넘침 표시 · 탭 전환 스크롤 · 관심 팀 이동 · 선수 이름 펼치기 ---------- */
// 지역·경기 선택줄은 스크롤해도 머리말 아래에 붙어 있다. 앞의 빈 표시(.st-stick-at)는 선택줄이 원래 있던 자리
let stickT = 0;
const stickNav = (html) => { clearTimeout(stickT); stickT = setTimeout(() => stickInit(), 0); return `<i class="st-stick-at" aria-hidden="true"></i><div class="st-stick">${html}</div>`; };
// 가로로 넘치는 선택줄: 고른 항목을 가운데로, 더 있는 쪽 끝을 흐리게
const stickFade = (el) => { const max = el.scrollWidth - el.clientWidth; el.classList.toggle('fade-r', max > 2 && el.scrollLeft < max - 2); el.classList.toggle('fade-l', max > 2 && el.scrollLeft > 2); };
function stickInit(root = app) {
  root.querySelectorAll?.('.st-stick .seg').forEach((el) => {
    const on = el.querySelector('[aria-current="true"]');
    if (on && !el.dataset.c && el.scrollWidth > el.clientWidth) { const a = el.getBoundingClientRect(), b = on.getBoundingClientRect(); el.scrollLeft += b.left - a.left - (a.width - b.width) / 2; }
    el.dataset.c = '1';
    stickFade(el);
  });
  const bar = app.querySelector('.st-stick');
  document.documentElement.style.setProperty('--st-h', `${bar?.offsetHeight || 0}px`);
}
document.addEventListener('scroll', (e) => { if (e.target.matches?.('.st-stick .seg')) stickFade(e.target); }, { capture: true, passive: true });
addEventListener('resize', () => stickInit());
const stickY = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--stick')) || 0;
document.addEventListener('click', (e) => {
  // 선택줄에서 지역·경기를 바꿀 때 맨 위로 올리지 않는다. 선택줄 아래까지 내려와 있었다면 새 내용이 선택줄 바로 아래에서 시작하게
  //   (hashchange 처리의 keepY 를 함께 쓴다. 공유 링크·새 탭 열기는 건드리지 않음)
  const a = e.target.closest?.('.st-stick a[href^="#"]');
  if (a && !e.defaultPrevented && !e.button && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
    const at = app.querySelector('.st-stick-at'), href = a.getAttribute('href');
    if (at && href !== location.hash) {
      e.preventDefault();
      const home = Math.max(0, at.getBoundingClientRect().top + scrollY - stickY());
      keepY = Math.min(scrollY, home); clearTimeout(keepT); keepT = setTimeout(() => { keepY = null; }, 600);
      location.hash = href;
    }
    return;
  }
  // '내 팀으로 이동': 누를 때마다 다음 관심 팀 줄로 (대표 팀 줄이 먼저)
  const j = e.target.closest?.('[data-jump-mine]');
  if (j) {
    const scope = j.closest('.lcq-m') || app;
    const rows = [...scope.querySelectorAll('tr.kr, li.kr')].filter((r) => !r.closest('.poi'));
    rows.sort((x, y) => y.classList.contains('main') - x.classList.contains('main'));
    if (!rows.length) return;
    const i = (+j.dataset.i || 0) % rows.length, row = rows[i];
    j.dataset.i = String(i + 1);
    const top = row.getBoundingClientRect().top + scrollY - stickY() - (app.querySelector('.st-stick')?.offsetHeight || 0) - 12;
    window.scrollTo({ top, behavior: motionOK() ? 'smooth' : 'auto' });
    row.classList.remove('flash'); void row.offsetWidth; row.classList.add('flash');
    return;
  }
  // 조 편성: 그룹마다 선수 이름 펼치기·접기 (다시 그리지 않고 바로 바꾼다)
  const rb = e.target.closest?.('[data-roster]');
  if (rb) {
    const g = rb.dataset.roster, on = !rosterOpen.has(g);
    on ? rosterOpen.add(g) : rosterOpen.delete(g);
    rb.closest('.lcq-g')?.classList.toggle('roster-on', on);
    rb.setAttribute('aria-pressed', String(on)); rb.textContent = I.t(on ? '선수 접기' : '선수 보기');
  }
});

// LCQ 화면. base: 이 화면의 주소 (순위 탭 또는 이전 결과). 경기마다 탭(m=groups|a|b|wr2|er1|er2|f)
function lcqBody(q, base) {
  const evs = lcqEvents();
  const region = evs.some((e) => e.region === q.get('r')) ? q.get('r') : lcqRegionDefault();
  const ev = evs.find((e) => e.region === region) || evs[0];
  const B = lcqBracket(ev);
  B.base = base; B.q = q;
  const key = B.started && now() - new Date(ev.end) < 7 * 864e5 ? `ev:${ev.eventId}` : null;
  const focusIn = evs.flatMap((e) => lcqEntrants(e).list.filter((t) => isF(t.short)).map((t) => ({ ...t, region: e.region }))).sort((a, b) => (team(b.short)?.id === mainId()) - (team(a.short)?.id === mainId()));
  const seg = `<div class="seg" role="group" aria-label="지역">${evs.map((e) => { const n = focusIn.filter((t) => t.region === e.region).length; return `<a href="${qsLink(base, q, { r: e.region })}" aria-current="${e === ev}">${REGION[e.region]}${n ? ` <span class="seg-n">${n}</span>` : ''}</a>`; }).join('')}</div>`;
  const focusLine = focusIn.length ? `<p class="lcq-focus"><b>${esc(ML().group)} ${focusIn.length}팀 출전</b> ${focusIn.map((t) => `<a class="lcq-chip ${CAT[lvlOf(t.short)] || ''}" href="${qsLink(base, q, { r: t.region })}">${logo(t.short)}<span>${esc(t.short)}</span>${outTag(t.short)}<small>${esc(REGION[t.region])}</small></a>`).join('')}</p>` : '';
  // 기본 탭: 진행 중 경기 → 출전 팀이 정해진 다음 경기 → 마지막으로 끝난 경기 → 조 편성
  const live = B.list.find((st) => st.status === 'live');
  const nextUp = B.list.find((st) => st.status !== 'completed' && st.teams.length === st.n);
  const def = live?.key || (B.started ? (nextUp || B.list.filter((st) => st.status === 'completed').at(-1))?.key : null) || 'groups';
  const m = q.get('m') === 'groups' || B[q.get('m')] ? q.get('m') : def;
  const tabs = [['groups', '조 편성', null], ...B.list.map((st) => [st.key, st.tab, st])];
  const tabBar = `<nav class="lcq-tabs" aria-label="LCQ 경기"><div class="seg">${tabs.map(([k, n, st]) => `<a href="${qsLink(base, q, { m: k })}" aria-current="${k === m}">${esc(n)}${st?.status === 'live' ? ' <span class="tab-live" aria-label="LIVE"></span>' : st?.status === 'completed' ? ' <small class="tab-done">종료</small>' : st && stTab(st) ? ` <small class="tab-when">${esc(stTab(st))}</small>` : ''}</a>`).join('')}</div></nav>`;
  return `<p class="lead">${esc(REGION[ev.region])} LCQ · ${esc(dayLabel(dayKey(B.a.start || ev.start)))} 시작. 지역마다 40팀이 겨뤄 상위 2팀이 챔피언십에 갑니다.</p>
    ${!B.done ? refreshNote() : ''}
    ${focusLine}
    ${(A.extras || []).filter((x) => x.eventId === ev.eventId && new Date(x.start) > now() - 3 * 3600e3).map((x) => `<p class="xnote"><span class="tag xk">${esc(extraName(x))}</span> <b>${esc(dayLabel(dayKey(x.start)))} ${hhmm(x.start)}</b> 시작 <span class="when">${esc(until(x.start) || '')}</span></p>`).join('')}
    ${stickNav(`<div class="controls">${seg}</div>${tabBar}`)}
    ${!B.done && B.list.some((st) => st.s?.startFix === 'rules') ? '<p class="caption">경기 시각은 공식 규정의 지역별 일정표(현지 시각) 기준입니다. 공식 페이지에는 아직 임시 시각이 들어 있어 실제 시작 시각은 달라질 수 있습니다.</p>' : ''}
    ${spoil(m === 'groups' ? lcqGroups(B) : stageMatch(B, B[m]), key, 'LCQ 결과')}`;
}

/* ---------- 챔피언십 조 편성 (사이트 계산) ---------- */
// 직행 32팀을 CP 순위대로 A→B→C→D→D→C→B→A→A→B… 지그재그로 4개 조(10팀씩)에 넣는다.
// 33~40번 자리는 LCQ 8팀(지역별 2팀). 네 지역 LCQ가 모두 끝나면 그 8팀을 CP 순서대로 같은 방식으로 이어 넣는다.
const champsTimeline = () => A.season.timeline.find((t) => t.key === 'champs');
// 챔피언십 탭: 시작되기 전까지 (시작하면 순위 탭의 기본 화면이 된다). CP 순위가 아직 없는 시즌 초에는 감춘다
const champsTab = () => !!champsTimeline() && !champsMain() && A.cp.length > 0;
// 챔피언십이 끝났는가 (시즌 종료). 끝난 뒤에도 순위 탭 기본 화면과 홈의 시즌 결과로 계속 남는다
const champsDone = () => !!champsTimeline() && champsSeries().some((x) => x.phase === 'Match Point Finals' && x.status === 'completed');
const champsMain = () => champsNow() || champsDone();
// 시즌 일정표 한 줄의 상태(끝남·진행 중·예정)와 사이트 안에서 그 단계를 보는 곳
//   공식 경기가 있으면 시각 기준: 첫 경기 시작 시각부터 마지막 경기 시작 12시간 뒤까지(공식 중계 표시 기간 regionEventOn 과 같은 규칙).
//   모든 경기가 끝났으면 그때 끝. 마지막 날 경기가 아직 공식에 없을 수 있어, 끝은 마지막 날(미국 서부 날짜)이 시작되기 전으로는 당기지 않는다.
//   경기가 없으면 날짜 기준(미국 서부 날짜)
const TL_SLUG = { open: /^online-open/, lcq: /^last-chance-qualifier/, champs: /^champs/ };
const tlSeries = (e) => { const m = /^s(\d)(pl|po)$/.exec(e.key); const re = m ? new RegExp(`^split-${m[1]}-${m[2] === 'pl' ? 'pro-league' : 'playoffs'}`) : TL_SLUG[e.key]; return re ? A.series.filter((s) => s.start && re.test(s.eventSlug || '')) : []; };
const tlState = (e) => {
  const ss = tlSeries(e), t = now();
  if (!ss.length) { const d = new Date(t).toLocaleDateString('sv-SE', { timeZone: 'America/Los_Angeles' }); return d > e.end ? 'done' : d >= e.start ? 'now' : 'next'; }
  const ms = ss.map((s) => Date.parse(s.start)), a = Math.min(...ms), b = Math.max(...ms);
  if (t < a) return 'next';
  if (ss.every((s) => s.status === 'completed') && !ss.some((s) => s.live)) return 'done';
  return t > Math.max(b + 432e5, Date.parse(`${e.end}T00:00:00-08:00`)) ? 'done' : 'now';
};
function stageHref(e) {
  let m;
  if ((m = /^s(\d)pl$/.exec(e.key))) return A.pl && Object.values(A.pl).some((p) => p.split === +m[1]) ? `#/points/pl?s=${m[1]}` : null;
  if ((m = /^s(\d)po$/.exec(e.key))) {
    if (A.intl && new RegExp(`^split-${m[1]}-playoffs`).test(A.intl.slug || '') && intlCurrent()) return '#/standings';
    const ev = (A.past || []).find((x) => new RegExp(`^split-${m[1]}-playoffs`).test(x.slug || ''));
    return ev ? `#/standings/past?e=${ev.eventId}` : null;
  }
  if (e.key === 'lcq') return !lcqEvents().length ? null : intlCurrent() || champsDone() ? '#/standings/past?e=lcq' : '#/standings';
  if (e.key === 'champs') return champsMain() ? '#/standings' : champsTab() ? '#/standings/champs' : null;
  return null;
}
// 가장 최근 Split 프로리그가 아직 끝나지 않았는가 (시즌 일정표 기준). 끝나기 전의 순위는 '현재 순위'로 적는다
const plOpen = () => { const r = (A.season.timeline || []).find((x) => x.key === `s${lastSplit()}pl`); return !!r?.end && new Date(r.end + 'T23:59:59-08:00') > now(); };
const GROUPS = ['A', 'B', 'C', 'D'];
const snakeGroup = (i) => { const r = Math.floor(i / 4), k = i % 4; return GROUPS[r % 2 ? 3 - k : k]; };
const REGION_S = { 'apac-n': 'APN', 'apac-s': 'APS', emea: 'EMEA', americas: 'AMER' };
// 지역별 LCQ 결승 상위 2팀 (끝난 지역만)
function lcqQualifiers() {
  return lcqEvents().map((e) => {
    const B = lcqBracket(e);
    const top = B.done ? (B.f.s?.results || []).filter((r) => r.pos <= 2).map((r) => r.short) : [];
    return { region: e.region, done: B.done && top.length === 2, teams: top };
  });
}
function champsSeeds() {
  const cp = cpStanding();
  const direct = cp.filter((r) => r.direct).sort((a, b) => a.rank - b.rank).map((r) => ({ ...r, via: 'cp' }));
  const Q = lcqQualifiers();
  const allDone = Q.length === 4 && Q.every((x) => x.done);
  const cpOf = (sh) => cp.find((r) => r.short === sh);
  const lcq = allDone ? Q.flatMap((x) => x.teams.map((sh, i) => ({ id: cpOf(sh)?.id, short: sh, name: xteam(sh)?.name || sh, region: x.region, total: cpOf(sh)?.total || 0, rank: cpOf(sh)?.rank ?? null, lcqPos: i + 1, via: 'lcq' })))
    .sort((a, b) => b.total - a.total || cpTie(a, b) || a.lcqPos - b.lcqPos) : Array.from({ length: A.season.lcqSlots }, () => ({ via: 'lcq', tbd: true }));
  return { seeds: [...direct, ...lcq].map((t, i) => ({ ...t, seed: i + 1, group: snakeGroup(i) })), Q, allDone };
}
/* ---------- 챔피언십: 조 편성 · 조별 리그 · 브래킷 · 결승 (LCQ와 같은 탭 형식) ---------- */
// 공식 시리즈가 나오기 전 기본 일정: Split 2 플레이오프와 같은 형식·순서
//   1일차 조별 리그 A-B · C-D · B-D, 2일차 A-C · B-C · A-D (각 6게임, 조마다 다른 세 조와 한 번씩)
//   조별 리그 누적 1~20위 → 승자 라운드, 21~40위 → 패자부활 1라운드
//   3일차 브래킷: 패자부활 1R(상위 10 → 패자 2R) · 승자 라운드(상위 10 → 결승, 하위 10 → 패자 2R) · 패자부활 2R(상위 10 → 결승)
//   4일차 매치 포인트 결승 20팀
// 공식 시리즈(Group X vs Y, Winners Round …)가 생기면 공식 이름·순서·시각·결과를 쓴다
// 조별 리그 대진(CH_GS)·단계(CH_BK)·진출 규칙(CH_FLOW)은 규칙 파일 brackets.championship 에 있다
const addDay = (ymd, n) => { const d = new Date(ymd + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const champsSeries = () => A.series.filter((s) => (s.eventSlug || '').startsWith('champs'));
const champsNow = () => intlCurrent() && /champs/.test(A.intl?.slug || '');
function champsBracket() {
  const tl = champsTimeline();
  const ss = champsSeries();
  // 공식 조별 리그 누적 (공식 조 배정 포함): 진행 중에는 실시간 값, 끝난 뒤에는 보관된 값
  const pastCh = (A.past || []).find((e) => /^champs/.test(e.slug || ''));
  const off = champsNow() ? A.intl.rows : pastCh?.rows?.length ? pastCh.rows : null;
  const { seeds: raw, Q, allDone } = champsSeeds();
  // 조별 리그 시리즈 (공식 일정이 나왔으면 공식 이름·순서)
  const offGs = ss.filter((x) => /^Group [A-D] vs [A-D]$/.test(x.name)).sort((a, b) => a.start.localeCompare(b.start));
  // 시작 전: 조별 리그 시리즈마다 공식 출전 명단이 나와 있으면 거기서 조를 읽는다 (A조 팀 = 'A vs …' 경기에만 나오는 팀)
  const lineG = (() => {
    if (off || offGs.length < 3 || offGs.some((x) => !x.lineup?.length)) return null;
    const m = new Map();
    for (const x of offGs) { const gs = x.name.match(/^Group ([A-D]) vs ([A-D])$/).slice(1); for (const sh of x.lineup) m.set(sh, (m.get(sh) || GROUPS).filter((g) => gs.includes(g))); }
    return [...m.values()].every((g) => g.length === 1) ? m : null;
  })();
  const offG = (sh) => off?.find((r) => r.short === sh)?.group || lineG?.get(sh)?.[0];
  const seeds = raw.map((t) => (t.tbd ? t : { ...t, group: offG(t.short) || t.group }));
  const bySh = new Map(seeds.filter((t) => !t.tbd).map((t) => [t.short, t]));
  const seed = (sh) => { const t = bySh.get(sh), g = offG(sh) || t?.group; return t ? { n: t.seed, label: `${g}조 · ${t.seed}번 시드` } : g ? { n: 999, label: `${g}조` } : null; };
  const slotOfSeed = (t) => ({ short: t.tbd ? null : t.short, label: t.tbd ? `${t.group}조 · LCQ 진출 팀` : `${t.group}조 · ${t.seed}번 시드` });
  const B = { kind: 'champs', FLOW: CH_FLOW, seed, seeds, Q, allDone, tl, ss, official: !!off || !!lineG };
  const day = (i) => (tl ? addDay(tl.start, i) : null);
  const stOf = (S, x) => ({ ...S, s: x, start: x?.start, tbd: !!x?.timeTbd, status: !x ? 'none' : x.status === 'completed' ? 'completed' : x.live || x.status === 'live' ? 'live' : 'pending' });
  const pairs = offGs.length ? offGs.map((x) => x.name.match(/^Group ([A-D]) vs ([A-D])$/).slice(1)) : CH_GS;
  const gsl = pairs.map(([g1, g2], i) => {
    const st = stOf({ key: `g${i + 1}`, ko: `조별 리그 ${g1}조 vs ${g2}조`, tab: `${g1} vs ${g2}`, n: 20, date: day(i < pairs.length / 2 ? 0 : 1) }, offGs[i]);
    st.slots = seeds.filter((t) => t.group === g1 || t.group === g2).map(slotOfSeed);
    st.from = `<span>${g1}조 10팀 + ${g2}조 10팀</span>`;
    return st;
  });
  // 조별 리그 누적: 공식 누적 순위, 없으면 끝난·진행 중 조별 리그 결과를 합산 (점수 → 킬 → 시드)
  let rows = off ? off.map((r) => ({ pos: r.pos, short: r.short, pts: r.pts, kills: r.kills, kr: krOf(r.short) })) : null;
  let computed = false;
  const played = gsl.filter((st) => st.s?.results?.length);
  if (!rows && played.length) {
    const sum = new Map(seeds.filter((t) => !t.tbd).map((t) => [t.short, { short: t.short, pts: 0, kills: 0 }]));
    for (const st of played) for (const r of st.s.results) { const o = sum.get(r.short) || { short: r.short, pts: 0, kills: 0 }; o.pts += r.pts; o.kills += r.kills; sum.set(r.short, o); }
    rows = [...sum.values()].sort((a, b) => b.pts - a.pts || b.kills - a.kills || (seed(a.short)?.n ?? 999) - (seed(b.short)?.n ?? 999)).map((o, i) => ({ ...o, pos: i + 1, kr: krOf(o.short) }));
    computed = true;
  }
  const gsDone = gsl.length > 0 && gsl.every((st) => st.status === 'completed');
  const gs = { key: 'gs', ko: '조별 리그 순위', tab: '조별 순위', n: 40, cut: 20, up: '승자 라운드', down: '패자 1R', computed,
    s: rows ? { results: rows, status: gsDone ? 'completed' : 'live' } : null,
    status: gsDone ? 'completed' : gsl.some((st) => st.status === 'live') ? 'live' : played.length ? 'pending' : 'none',
    whenText: tl ? `${dayLabel(day(0))} ~ ${dayLabel(day(1))}` : '', tabText: '', date: day(0),
    slots: seeds.map(slotOfSeed), from: `<span>40팀 (조별 리그 ${gsl.length}경기 합산)</span>` };
  B.gs = gs;
  for (const st of gsl) B[st.key] = st;
  // 브래킷·결승
  for (const S of CH_BK) B[S.key] = stOf({ ...S, date: day(S.day) }, ss.find((y) => y.name === S.name || (S.key === 'f' && y.phase === 'Match Point Finals')));
  const srcDone = (k) => (k === 'gs' ? gsDone && !!rows : B[k].status === 'completed');
  const srcRes = (k) => (k === 'gs' ? rows : B[k].s?.results);
  for (const S of CH_BK) {
    B[S.key].slots = CH_FLOW[S.key].flatMap(([k, a, b]) => Array.from({ length: b - a + 1 }, (_, i) => {
      const p = a + i, r = srcDone(k) ? srcRes(k)?.find((y) => y.pos === p) : null;
      return { short: r?.short || null, label: `${k === 'gs' ? '조별' : B[k].tab} ${p}위` };
    }));
  }
  const bk = CH_BK.map((S) => B[S.key]);
  if (bk.every((st) => st.start)) bk.sort((a, b) => a.start.localeCompare(b.start)); // 공식 일정 순서
  B.list = [...gsl, gs, ...bk];
  for (const st of B.list) {
    const x = st.s, filled = st.slots.filter((y) => y.short).map((y) => y.short);
    st.teams = x?.results?.length ? x.results.map((r) => r.short) : x?.lineup?.length ? x.lineup : filled;
  }
  B.started = gsl.some((st) => st.status === 'live' || st.status === 'completed');
  B.done = B.f.status === 'completed';
  return B;
}
function champsView(q, base) {
  const BD = board();
  const B = champsBracket();
  B.base = base; B.q = q;
  const { seeds, Q, allDone, tl } = B;
  const key = B.started ? `ev:${B.ss[0].eventId}` : BD.state === 'live' || BD.state === 'pending' ? intlKey() : Q.some((x) => x.done) && lcqEvents().some((e) => now() - new Date(e.end) < 7 * 864e5) ? `ev:${lcqEvents()[0].eventId}` : null;
  const basis = BD.state === 'live' ? '진행 중 대회 정산 순위' : BD.state === 'pending' ? '최종 순위 정산' : '현재 챔피언십 포인트 순위';
  // 기본 탭: 진행 중 경기 → 출전 팀이 다 정해진 다음 경기 → 마지막으로 끝난 경기 → 조 편성
  const live = B.list.find((st) => st.status === 'live' && st.key !== 'gs');
  const nextUp = B.list.find((st) => st.status !== 'completed' && st.key !== 'gs' && st.teams.length === st.n);
  const def = live?.key || (B.started ? (nextUp || B.list.filter((st) => st.status === 'completed').at(-1))?.key : null) || 'groups';
  const m = q.get('m') === 'groups' || B.list.some((st) => st.key === q.get('m')) ? q.get('m') : def;
  const tabs = [['groups', '조 편성', null], ...B.list.map((st) => [st.key, st.tab, st])];
  const tabBar = `<nav class="lcq-tabs" aria-label="챔피언십 경기"><div class="seg">${tabs.map(([k, n, st]) => `<a href="${qsLink(base, q, { m: k })}" aria-current="${k === m}">${esc(n)}${st?.status === 'live' ? ' <span class="tab-live" aria-label="LIVE"></span>' : st?.status === 'completed' ? ' <small class="tab-done">종료</small>' : st && stTab(st) ? ` <small class="tab-when">${esc(stTab(st))}</small>` : ''}</a>`).join('')}</div></nav>`;
  const row = (t) => t.tbd
    ? `<li class="cg-row tbd"><span class="cg-seed">${t.seed}</span><span class="cg-team"><span class="tag lcq">LCQ</span></span><small class="cg-reg">미정</small><span class="cg-cp"></span></li>`
    : `<li class="cg-row ${rowCls(t)}"><span class="cg-seed">${t.seed}</span><span class="cg-team">${krDot(null, t.short)}${teamLink(t.short, team(t.short) ? t.short : undefined)}${t.via === 'lcq' ? ' <span class="tag lcq">LCQ</span>' : ''}</span><small class="cg-reg">${esc(REGION_S[t.region] || '')}</small><span class="cg-cp num">${t.total ? fmt(t.total) : '–'}</span></li>`;
  const groupsHtml = `<div class="cg-grid">${GROUPS.map((g) => { const ts = seeds.filter((t) => t.group === g); const nF = ts.filter((t) => !t.tbd && isF(t.short)).length; return `<section class="cg" aria-label="${g}조"><h3 class="cg-h"><b>${g}조</b><small>${ts.filter((t) => !t.tbd).length}팀 확정${ts.some((t) => t.tbd) ? ` · LCQ ${ts.filter((t) => t.tbd).length}자리` : ''}${nF ? ` · ${esc(ML().tag)} ${nF}` : ''}</small></h3><ol class="cg-list">${ts.map(row).join('')}</ol></section>`; }).join('')}</div>`;
  const qBox = `<section class="sec" aria-labelledby="h-cq"><h2 class="h2" id="h-cq">LCQ 진출 팀 <small class="muted">지역별 2팀</small></h2>
    <div class="cq-grid">${Q.map((x) => `<div class="cq"><b>${esc(REGION[x.region])}</b>${x.done ? x.teams.map((sh) => `<span>${teamLink(sh)}</span>`).join('') : `<span class="muted">${lcqEvents().find((e) => e.region === x.region) && lcqBracket(lcqEvents().find((e) => e.region === x.region)).started ? 'LCQ 진행 중' : 'LCQ 전'}</span>`}</div>`).join('')}</div>
    <p class="caption">${allDone ? 'LCQ 진출 8팀을 CP 순서대로 33~40번 자리에 넣었습니다. CP가 같으면 LCQ 결승 순위가 높은 팀이 앞입니다.' : '네 지역 LCQ가 모두 끝나면 진출 8팀을 CP 순서대로 33~40번 자리에 넣습니다.'}</p></section>`;
  const how = `<section class="sec" aria-labelledby="h-ch-how"><h2 class="h2" id="h-ch-how">진행 방식</h2>${stageFlow(B, CH_FLOW_L, (k) => qsLink(base, q, { m: k }), '챔피언십 진행 방식')}</section>`;
  const groupsTab = `${how}${schedTable(B)}
    <section class="sec"><h2 class="h2">조 편성</h2><p class="caption">${B.official ? '공식 조 배정입니다.' : `챔피언십 포인트 직행 ${A.season.cpDirectSlots}팀을 순위대로 A→B→C→D→D→C→B→A 순서로 지그재그 배정한 조 편성입니다 (${basis} 기준, 사이트 계산이라 공식 발표와 다를 수 있습니다).`}</p>${groupsHtml}</section>${qBox}`;
  return `<section class="sec past-ev"><h2 class="h2">챔피언십</h2><p class="lead">${tl ? `${esc(tl.start.slice(0, 4))}.${esc(tl.start.slice(5).replace('-', '.'))} – ${esc(tl.end.slice(5).replace('-', '.'))} · ${esc(tl.where)}` : ''}</p></section>
    ${B.started && !B.done ? refreshNote() : ''}
    ${stickNav(tabBar)}
    ${spoil(m === 'groups' ? groupsTab : stageMatch(B, B.list.find((st) => st.key === m)), key, '챔피언십 결과')}`;
}

/* ---------- 이전 결과: 끝난 대회 ---------- */
function pastEvents() {
  const list = (A.past || []).filter((e) => !(intlCurrent() && e.eventId === A.intl.eventId) && !(champsMain() && /^champs/.test(e.slug || '')));
  // 다음 국제전이 진행 중이거나 챔피언십이 끝났으면 LCQ도 이전 결과로 간다
  if ((intlCurrent() || champsDone()) && lcqEvents().some((e) => A.series.some((s) => s.eventId === e.eventId && s.results))) list.unshift({ eventId: 'lcq', kind: 'lcq', name: 'Last Chance Qualifier', start: lcqEvents()[0].start, end: lcqEvents()[0].end });
  return list;
}
const evPlace = (ev) => A.season.timeline.find((t) => ev.start.slice(0, 10) <= t.end && ev.end.slice(0, 10) >= t.start);
function pastView(q) {
  const list = pastEvents();
  if (!list.length) return '<h1 class="title">순위</h1><p class="empty">아직 끝난 대회가 없습니다.</p>';
  const ev = list.find((e) => e.eventId === q.get('e')) || list[0];
  const tl = evPlace(ev);
  const evSeg = list.length > 1 ? `<div class="seg" role="group" aria-label="대회">${list.map((e) => `<a href="#/standings/past?e=${e.eventId}" aria-current="${e === ev}">${esc(ko(e.name, EVENT_KO))}</a>`).join('')}</div>` : '';
  const plSplits = [...new Set(Object.values(A.pl || {}).map((p) => p.split))].sort();
  const plLine = plSplits.length ? `<p class="caption">지역 프로리그 결과: ${plSplits.map((n) => `<a href="#/points/pl?s=${n}">Split ${n} 프로리그</a>`).join(' · ')}</p>` : '';
  const head = `<h1 class="title">순위</h1>${evSeg ? `<div class="controls">${evSeg}</div>` : ''}${plLine}
    <section class="sec past-ev"><h2 class="h2">${esc(ko(ev.name, EVENT_KO))}</h2><p class="lead">${esc(dayLabel(dayKey(ev.start)))} – ${esc(dayLabel(dayKey(ev.end)))}${tl ? ` · ${esc(tl.where)}` : ''}${tl?.url ? ` · ${olink(tl.url, '공식 페이지')}` : ''}</p></section>`;
  if (ev.kind === 'lcq') return head + lcqBody(q, '/standings/past');
  const key = now() - new Date(ev.end) < 7 * 864e5 ? `ev:${ev.eventId}` : null;
  if (ev.format === 'bracket') {
    const view = ['finals', 'bracket', 'group'].includes(q.get('v')) ? q.get('v') : 'finals';
    const L = (v) => `#/standings/past?e=${ev.eventId}&v=${v}`;
    const vSeg = `<div class="controls"><div class="seg" role="group" aria-label="화면">${[['finals', '결승'], ['bracket', '브래킷'], ['group', '조별 리그']].map(([v, n]) => `<a href="${L(v)}" aria-current="${v === view}">${n}</a>`).join('')}</div></div>`;
    return head + vSeg + intlBody(ev, view, L, key);
  }
  const view = ['finals', 'bracket', 'group'].includes(q.get('v')) ? q.get('v') : 'finals';
  const L = (v) => `#/standings/past?e=${ev.eventId}&v=${v}`;
  const vSeg = `<div class="controls"><div class="seg" role="group" aria-label="화면">${[['finals', '결승'], ['bracket', '브래킷'], ['group', '조별 리그']].map(([v, n]) => `<a href="${L(v)}" aria-current="${v === view}">${n}</a>`).join('')}</div></div>`;
  return head + vSeg + stagesBody(ev, view, L, key);
}

// Split 1 플레이오프 형식: 조별 리그 상위 N팀 결승 직행 / 다음 M팀 서바이벌 스테이지(상위 K팀 결승) / 나머지 탈락
function stagesBody(ev, view, L, key) {
  const S = ev.stages || {};
  const ss = A.series.filter((s) => s.eventId === ev.eventId).sort((a, b) => a.start.localeCompare(b.start));
  const groups = ss.filter((s) => s.phase === 'Group Stage');
  const mid = ss.find((s) => s.phase !== 'Group Stage' && s.phase !== 'Match Point Finals');
  const fin = ss.find((s) => s.phase === 'Match Point Finals');
  const stat = (x) => (!x ? 'none' : x.status === 'completed' ? 'completed' : x.live || x.status === 'live' ? 'live' : 'pending');
  const mk = (x, extra) => ({ key: 'x', ev, s: x, start: x?.start, status: stat(x), teams: (x?.results || []).map((r) => r.short), src: 'results', ...extra });
  const fSt = mk(fin, { key: 'f', ko: '매치 포인트 결승' });
  const mSt = mk(mid, { ko: ko(mid?.phase || S.midPhase, PHASE_KO), n: S.midN || mid?.results?.length || 20, cut: S.midTop, up: '결승 진출', down: '탈락' });
  const dSt = { key: 'd', ko: '결승 직행', ev, status: groups.every((x) => x.status === 'completed') ? 'completed' : 'pending', teams: ev.rows.filter((r) => S.direct && r.pos <= S.direct).map((r) => r.short), src: 'direct',
    caption: `조별 리그 상위 ${S.direct}팀은 서바이벌 스테이지 없이 결승으로 바로 갔습니다.` };
  const gsStatus = !groups.length ? 'none' : groups.every((x) => x.status === 'completed') ? 'completed' : groups.some((x) => x.status !== 'pending') ? 'live' : 'pending';
  const tl = [['조별 리그', groups[0], gsStatus], [mSt.ko, mid, stat(mid)], ['매치 포인트 결승', fin, stat(fin)]].filter(([, x]) => x);
  const head = `<p class="lead">${view === 'finals' ? '매치 포인트 결승 20팀의 점수입니다.' : view === 'bracket' ? `조별 리그 상위 ${S.direct || '–'}팀은 결승 직행, 그 아래 ${S.midN || 20}팀은 ${esc(mSt.ko)}에서 상위 ${S.midTop || '–'}팀만 결승에 합류했습니다.` : '조별 리그 누적 점수입니다.'}</p>
    <section class="sec"><ol class="timeline tl-row">${tl.map(([n, x, st]) => `<li class="${st === 'completed' ? 'done' : st === 'live' ? 'now' : ''}"><span>${olink(officialUrl(x), esc(n))}</span><span class="when">${dateTime(x.start)}</span></li>`).join('')}</ol></section>`;
  if (view === 'group') return head + spoil(`${ev.rows.length ? `<section class="sec">${groupTable(ev)}</section>` : ''}
    ${groups.length ? `<section class="sec"><h2 class="h2">조별 리그 시리즈</h2>${groups.slice().reverse().map(matchItem).join('')}</section>` : ''}`, key, '조별 리그 순위');
  if (view === 'finals') return head + spoil(`${fin ? `<section class="sec bk bk-final"><h2 class="h2 bk-h">매치 포인트 결승</h2>${stageTable(fSt)}</section>` : '<p class="empty">결승 결과가 없습니다.</p>'}
    <section class="sec past-link"><a class="btn-link ghost" href="${L('bracket')}">결승까지 온 길: 브래킷 보기</a></section>`, key, '결승 결과');
  return head + spoil(`
    <section class="sec bk bk-upper"><h2 class="h2 bk-h"><span class="bk-badge up">결승 직행</span></h2>${stageTable(dSt)}</section>
    ${mid ? `<section class="sec bk bk-lower"><h2 class="h2 bk-h"><span class="bk-badge low">${esc(mSt.ko)}</span></h2>${stageTable(mSt)}</section>` : ''}
    <section class="sec past-link"><a class="btn-link ghost" href="${L('finals')}">다음: 매치 포인트 결승 보기</a></section>
    <section class="sec past-link"><a class="btn-link ghost" href="${L('group')}">지난 결과: 조별 리그 순위와 시리즈 결과 보기</a></section>`, key, '브래킷 결과');
}

function groupTable(ev) {
  let rows = ev.rows;
  if (opt.krOnly) rows = rows.filter((r) => isF(r.short));
  const nx = ev.rows.some((r) => r.next);
  // 다음 단계가 바뀌는 순위 뒤에 컷 선 (예: 20위 뒤 승자 라운드 / 패자부활 1라운드)
  const cutAt = {};
  ev.rows.forEach((r, i) => { const n = ev.rows[i + 1]; if (nx && n && n.next !== r.next) cutAt[r.pos] = `여기까지 ${ko(r.next, PHASE_KO)}${r.next === 'Match Point Finals' ? ' 직행' : ''}, 아래는 ${ko(n.next, PHASE_KO)}`; });
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>팀</th><th class="c opt">조</th>${PTS_TH}${nx ? '<th class="r">다음 단계</th>' : ''}</tr></thead><tbody>
      ${rows.map((r) => { const cut = !opt.krOnly && cutAt[r.pos]; return `<tr class="${rowCls(r)} ${cut ? 'cut' : ''}"><td class="rank">${r.pos}</td><td class="team">${krDot(r.kr, r.short)}${teamLink(r.short, r.name)}${coachBadge(r.kr, r.short)}<small>${esc(REGION[r.region] || '')}</small></td><td class="c opt">${esc(r.group)}</td>${ptsTd(r.pts, r.kills)}${nx ? `<td class="r small muted">${esc(ko(r.next, PHASE_KO))}</td>` : ''}</tr>${cut ? `<tr class="cut-label"><td colspan="${nx ? 7 : 6}">${esc(cut)}</td></tr>` : ''}`; }).join('')}
    </tbody></table></div>`;
}

// 브래킷 한 단계: 결과가 있으면 점수표, 없으면 출전 명단(확정 또는 예상)
function stageTable(st) {
  const x = st.s;
  const tag = (st.status === 'live' ? `<span class="tag live">LIVE</span>${watchBtn()}` : st.status === 'completed' ? '<span class="tag">종료</span>' : `<span class="tag">${esc(stageState(st))}</span>`) + ` ${gameCount(x, st.key === 'f')} ${gameNow(x)}`;
  const top = `<div class="bk-stage-h"><h3 class="h3">${x ? olink(officialUrl(x), esc(st.ko)) : esc(st.ko)}</h3> ${tag}${x?.mp ? ' <span class="tag mp">매치 포인트</span>' : ''}<span class="when">${st.start ? dateTime(st.start) + ' ' + TZL : ''}</span></div>`;
  const res = x?.results;
  let body;
  if (res?.length) {
    let rows = res;
    if (opt.krOnly) rows = rows.filter((r) => isF(r.short));
    const G = gameCols(x, st.key === 'f');
    const out = (r) => (st.cut ? (r.pos <= st.cut ? `<span class="adv up">${esc(st.up)}</span>` : `<span class="adv ${st.down === '탈락' ? 'out' : 'down'}">${esc(st.down)}</span>`)
      : st.top && st.status === 'completed' && r.pos <= st.top ? `<span class="tag ok">챔피언십 진출</span>${r.won ? ' <span class="tag mpe">우승</span>' : ''}` : r.won ? '<span class="tag mpe">우승</span>' : r.mpe ? '<span class="tag mpe">MP</span>' : '');
    body = gview(x, G, `<div class="tbl-wrap${G ? ' gtab' : ''}"><table class="tbl"><thead><tr><th>#</th><th>팀</th>${PTS_TH}${G ? G.th : ''}<th class="r dest">${st.cut ? (st.status === 'completed' ? '결과' : '현재 기준') : ''}</th></tr></thead><tbody>
      ${rows.map((r) => `<tr class="${rowCls(r)} ${!opt.krOnly && st.cut && r.pos === st.cut && !gxOpen(x, r.short) ? 'cut' : ''} gx"${gxAttr(x, r.short)}><td class="rank">${r.pos}<i class="gx-chev" aria-hidden="true"></i></td><td class="team">${krDot(r.kr, r.short)}${teamLink(r.short)}${coachBadge(r.kr, r.short)}</td>${ptsTd(r.pts, r.kills)}${G ? G.td(r.short) : ''}<td class="r small dest">${out(r)}</td></tr>${gxRow(st.B || null, x, G, r.short, gxOpen(x, r.short), `${rowCls(r)} ${!opt.krOnly && st.cut && r.pos === st.cut ? 'cut' : ''}`)}${!opt.krOnly && st.cut && r.pos === st.cut ? `<tr class="cut-label"><td colspan="${6 + (G ? G.n : 0)}">여기까지 ${esc(st.up)}</td></tr>` : ''}`).join('')}
    </tbody></table></div>`) + (x.liveAt ? `<p class="caption">${ago(x.liveAt)} 공식 API 확인</p>` : '');
  } else if (st.teams?.length) {
    const seedOf = st.seed || ((sh) => { const g = (st.ev || A.intl)?.rows?.find((r) => r.short === sh); return g ? { n: g.pos, label: `조별 ${g.pos}위` } : null; });
    let ts = st.teams.map((sh) => ({ short: sh, kr: krOf(sh), g: seedOf(sh) }));
    ts.sort((a, b) => (a.g?.n ?? 999) - (b.g?.n ?? 999));
    if (opt.krOnly) ts = ts.filter((r) => isF(r.short));
    body = `<p class="caption">${st.caption ? esc(st.caption) : `${st.src === 'official' ? '공식 출전 명단' : '앞 단계 결과로 계산한 예상 명단'} ${st.teams.length}팀. 경기가 시작되면 점수표로 바뀝니다.`}</p>
      <div class="lineup-grid">${ts.map((r) => `<span class="lu ${rowCls(r)}">${krDot(r.kr, r.short)}${teamLink(r.short)}${coachBadge(r.kr, r.short)}<small>${r.g ? esc(r.g.label) : ''}</small></span>`).join('')}</div>`;
  } else body = '<p class="empty">앞 단계가 끝나면 출전 팀이 정해집니다.</p>';
  const rule = st.cut ? `<p class="bk-rule">상위 ${st.cut}팀 ${esc(st.up)} · 하위 ${st.n - st.cut}팀 ${esc(st.down)}</p>` : st.key === 'f' ? `<p class="bk-rule">매치 포인트 ${x?.mpThreshold || 50}점 도달 후 게임 1위를 하면 우승${st.top ? ` · 상위 ${st.top}팀 챔피언십 진출` : ''}</p>` : '';
  return `<div class="bk-stage ${st.status}">${top}${rule}${body}</div>`;
}

/* ---------- 포인트 ---------- */
function points(parts, q) {
  const sub = ['pl', 'events'].includes(parts[1]) ? parts[1] : 'cp';
  return `<h1 class="title">포인트</h1>
    ${sub === 'cp' ? cpView(q) : sub === 'events' ? cpEventsView(q) : plView(q)}`;
}

/* ---------- 챔피언십 포인트 내역 ---------- */
// 선수 id → 그 선수가 CP를 받은 대회 결과 목록
let CPIX = null;
function cpHistory(pid) {
  if (!CPIX || CPIX.src !== A.cpEvents) {
    const m = new Map();
    for (const e of A.cpEvents || []) for (const r of e.rows) if (r.id) for (const [id] of r.players) { if (!m.has(id)) m.set(id, []); m.get(id).push({ e, r }); }
    CPIX = { src: A.cpEvents, m };
  }
  return CPIX.m.get(pid) || [];
}
// 선수 한 명의 CP 내역 한 줄: 대회 약칭 · 순위 · CP
// 진행 중인 국제전 결과가 공식 합계에 이미 들어갔는지 (공식 합계는 순위 확정 뒤 조금 늦게 바뀜)
function intlCounted(pid, total) {
  const h = cpHistory(pid);
  const live = h.find((x) => x.e.id === A.api?.intlEventId);
  if (!live || total == null) return { live: null, counted: true };
  const others = h.filter((x) => x !== live).reduce((a, x) => a + x.r.cp, 0);
  return { live, counted: total !== others, others };
}
// 공식 합계에 실제로 들어간 대회 조합 찾기 (CP는 선수에게 귀속되지만, 그 대회에서 팀과 12경기 이상 뛰어야 팀 합계에 들어감)
// 대회 수가 10개 안팎이라 모든 조합을 확인한다. 답이 하나로 정해지지 않으면 표시하지 않는다.
function countedEvents(list, total) {
  const n = list.length;
  if (total == null || n > 14) return null;
  const all = list.reduce((a, x) => a + x.r.cp, 0);
  if (all === total) return new Set(list);
  let found = null, count = 0;
  for (let m = 0; m < 1 << n; m++) {
    let sum = 0;
    for (let i = 0; i < n; i++) if (m & (1 << i)) sum += list.at(i).r.cp;
    if (sum === total) { count++; found = m; if (count > 1) return null; }
  }
  return count === 1 ? new Set(list.filter((_, i) => found & (1 << i))) : null;
}
function cpBreak(pid, name, total, curShort) {
  const h = cpHistory(pid);
  const ic = intlCounted(pid, total);
  const pendItem = ic.live && !ic.counted ? h.find((x) => x.e.id === ic.live.e.id) : null;
  const base = h.filter((x) => x !== pendItem);
  const counted = countedEvents(base, total);
  const sum = base.reduce((a, x) => a + x.r.cp, 0);
  const items = h.map((x) => {
    const { e, r } = x, pend = x === pendItem, nPlayed = played(e.id, pid), excl = nPlayed != null ? nPlayed < MIN_MATCHES : counted && !pend && !counted.has(x);
    const other = curShort && r.short && r.short !== curShort;
    const tip = `${e.label} · ${r.name || r.short} ${r.pos}위${nPlayed != null ? ` · ${nPlayed}경기 출전` : ''}${pend ? ' · 공식 합계에 아직 반영 안 됨' : ''}${excl ? ` · CP 없음 (${MIN_MATCHES}경기 미만 출전)` : ''}${other ? ' · 다른 팀 소속 때 받은 CP (선수에게 귀속)' : ''}`;
    return `<span class="cpb-i ${e.kind}${pend ? ' pend' : ''}${excl ? ' excl' : ''}" title="${esc(tip)}"><i>${esc(e.short)}${other ? ` · ${esc(r.short)}` : ''}</i> ${r.pos}위 <b>${pend ? '+' : ''}${fmt(r.cp)}</b>${pend ? ' <small>반영 대기</small>' : excl ? ` <small>${nPlayed != null ? nPlayed + '경기 · 제외' : '합산 제외'}</small>` : ''}</span>`;
  });
  if (total != null && !counted && total - sum > 0) items.push(`<span class="cpb-i etc" title="이 사이트가 모으지 않은 대회"><i>기타</i> <b>${fmt(total - sum)}</b></span>`);
  if (total != null && !counted && total - sum < 0) items.push(`<span class="cpb-i etc" title="일부 대회 CP가 팀 합계에서 빠졌지만 어느 대회인지 하나로 정할 수 없음"><i>합산 제외</i> <b>${fmt(total - sum)}</b></span>`);
  return `<div class="cpb"><span class="cpb-n">${pid ? `<a class="plink" href="#/players/${encodeURIComponent(pid)}">${esc(name)}</a>` : esc(name)} <b class="num">${fmt(total ?? sum)}</b></span><span class="cpb-items">${items.join('') || '<span class="muted">내역 없음</span>'}</span></div>`;
}
// 진행 중인 플레이오프: 이미 순위가 정해진 팀은 공식 합계에 들어가 있고, 남은 팀은 남은 순위 중 가장 낮은 CP를 최소로 보장받는다
function settle() {
  const e = (A.cpEvents || []).find((x) => x.id === A.api?.intlEventId);
  if (!e) return null;
  const open = e.rows.filter((r) => !r.id);
  const placed = new Map(e.rows.filter((r) => r.id).map((r) => [r.id, r]));
  const field = new Set((A.intl?.rows || []).map((r) => r.id));
  return { e, open: open.length, minCp: open.length ? Math.min(...open.map((r) => r.cp)) : 0, maxCp: open.length ? Math.max(...open.map((r) => r.cp)) : 0, placed, alive: (id) => open.length > 0 && field.has(id) && !placed.has(id) };
}

// 기본으로 보여줄 챔피언십 포인트 순위: 진행 중 국제전을 최소 보장으로 정산한 값.
// state: live(대회 진행 중) · pending(대회 끝, 공식 합계 반영 대기) · confirmed(공식 합계와 대조 일치 → 공식 값으로 확정)
// 그 대회에서 선수가 뛴 경기 수 (공식 게임 기록에서 셈). 기록이 없으면 null
const MIN_MATCHES = 12;
const played = (eventId, pid) => { const t = A.mc?.[eventId]; return t ? t[pid] || 0 : null; };
const eligible = (eventId, pid) => { const n = played(eventId, pid); return n == null || n >= MIN_MATCHES; };

// 결승(매치 포인트 결승)이 시작됐으면 지금 순위 { 팀 약칭 → 순위 }, 아니면 null
function finalsLivePos() {
  if (!A.intl?.eventId) return null;
  const f = A.series.find((s) => s.eventId === A.intl.eventId && (s.phase === 'Match Point Finals' || s.name === 'Match Point Finals'));
  if (!f?.results?.length || !(f.live || f.status === 'live' || f.status === 'completed' || f.games)) return null;
  return new Map(f.results.map((r) => [r.short, r.pos]));
}
const finalsSig = () => { const m = finalsLivePos(); return m ? [...m].map((x) => x.join(':')).join(',') : ''; };

// 이번 스플릿 프로리그에서 그 팀으로 뛴 경기 수
function splitGames(pid, short) {
  const sp = Math.max(...(A.cpEvents || []).filter((e) => e.kind === 'pl').map((e) => e.split));
  let n = 0;
  for (const e of A.cpEvents || []) if (e.kind === 'pl' && e.split === sp) for (const r of e.rows) if (r.short === short && r.players.some(([id]) => id === pid)) n += played(e.id, pid) ?? MIN_MATCHES;
  return n;
}

// 선수 단위 정산. CP는 선수에게 귀속된다 (그 대회에서 12경기 이상 뛴 선수만 받음):
//  - 이번 대회에 실제로 뛴 선수(공식 출전 로스터, 대체 선수 포함)만 그 팀 순위의 CP를 받는다
//  - 비자 문제 등으로 빠진 선수(config cpSubs.out)는 받지 않는다
//  - 대체 선수(cpSubs.in)는 출전 팀 순위의 CP를 받아 원래 소속팀(home) 합계에 들어간다
//  - 팀 CP = 후보 선수(공식 상위 3인 + 이번 대회 CP를 받은 소속 선수) 중 상위 3인 합
//  대체가 있었던 팀(운영자 기준, cpSubs):
//   1) 대체되지 않은 기존 인원: 이전 CP + 이번 대회 CP
//   2) 대체된(결장) 기존 인원: 이번 대회 CP는 없고, 이전 CP는 팀 CP 정산에 그대로 들어감
//   3) 다른 팀에서 대체로 들어간 선수: 이번 대회 CP를 받고, 자기 원래 팀의 정산값에 들어감
function settleRows(ST) {
  const nk = (n) => String(n || '').trim().toLowerCase();
  const subs = A.cpSubs?.[ST.e.slug] || [];
  const outOf = new Map(subs.map((x) => [x.team, new Set((x.out || []).map(nk))]));
  const credit = new Map(); // 선수ID → { min, max, team, pos }
  const give = (pid, c) => { if (pid) credit.set(pid, c); };
  const rosterOf = (short) => (A.poRosters?.[short] || []);
  for (const r of ST.e.rows) if (r.id) for (const [pid, n] of r.players) if (!outOf.get(r.short)?.has(nk(n)) && eligible(ST.e.id, pid)) give(pid, { min: r.cp, max: r.cp, team: r.short, pos: r.pos });
  // 결승이 시작되면 결승 실시간 순위의 CP를, 시작 전에는 최소 보장 CP를 준다
  const fpos = finalsLivePos();
  const cpAt = (pos) => ST.e.rows.find((r) => r.pos === pos)?.cp ?? ST.minCp;
  for (const ir of A.intl?.rows || []) {
    if (!ST.alive(ir.id)) continue;
    const lp = fpos?.get(ir.short);
    const got = lp ? cpAt(lp) : ST.minCp;
    // 이미 12경기를 채운 선수만 지금 값(최소 보장 또는 결승 실시간 순위)을 받고, 못 채운 선수는 남은 경기를 다 뛰었을 때만(최대값)
    for (const [pid, n, role] of rosterOf(ir.short)) if (role !== 'k' && !outOf.get(ir.short)?.has(nk(n))) give(pid, { min: eligible(ST.e.id, pid) ? got : 0, max: ST.maxCp, team: ir.short, short12: !eligible(ST.e.id, pid), livePos: lp || null });
  }
  // 대체 선수: 공식 로스터에서 코치 등으로 잘못 들어가 있어도 운영자 명단대로 CP를 준다
  const homeExtra = new Map();
  const subIn = new Set();
  for (const sb of subs) {
    const placed = ST.e.rows.find((r) => r.id && r.short === sb.team);
    const alive = (A.intl?.rows || []).some((ir) => ir.short === sb.team && ST.alive(ir.id));
    for (const x of sb.in || []) {
      const pid = rosterOf(sb.team).find(([, n]) => nk(n) === nk(x.name))?.[0] || pidOf(x.name);
      if (!pid) continue;
      subIn.add(pid);
      if (placed) { if (eligible(ST.e.id, pid)) give(pid, { min: placed.cp, max: placed.cp, team: sb.team, pos: placed.pos }); }
      else if (alive) { const lp = fpos?.get(sb.team); give(pid, { min: eligible(ST.e.id, pid) ? (lp ? cpAt(lp) : ST.minCp) : 0, max: ST.maxCp, team: sb.team, short12: !eligible(ST.e.id, pid), livePos: lp || null }); }
      if (x.home) { if (!homeExtra.has(x.home)) homeExtra.set(x.home, []); homeExtra.get(x.home).push({ pid, name: x.name, team: sb.team }); }
    }
    for (const n of sb.out || []) { const pid = pidOf(n); if (pid && credit.get(pid)?.team === sb.team) credit.delete(pid); }
  }
  // 선수의 이번 대회 전 CP: 공식 값이 있으면 그 값(이번 대회가 이미 들어갔으면 뺌), 없으면 대회 기록 합
  const base = (pid, official) => {
    const h = cpHistory(pid), live = h.find((x) => x.e.id === ST.e.id);
    if (official == null) return h.filter((x) => x !== live && eligible(x.e.id, pid)).reduce((a, x) => a + x.r.cp, 0);
    const ic = intlCounted(pid, official);
    return official - (live && ic.counted ? live.r.cp : 0);
  };
  const nameOf = new Map();
  for (const e of A.cpEvents || []) for (const r of e.rows) for (const [id, n] of r.players) nameOf.set(id, n);
  const subTeams = new Set(subs.map((x) => x.team));
  return A.cp.map((r) => {
    const cands = new Map();
    for (const [n, p, id] of r.players) if (id) cands.set(id, { n, off: p });
    // 대체가 있었던 팀: 기존 로스터 전원(결장 선수 포함)을 이전 CP와 함께 후보로
    if (subTeams.has(r.short)) for (const p of team(r.short)?.roster || []) {
      if (p.r === 'k') continue;
      const pid = pidOf(p.n);
      // 공식 팀 CP 규정: 이번 스플릿 프로리그에서 이 팀으로 12경기 이상 뛴 선수만 팀 CP에 들어감 (결장 선수도 같은 기준)
      if (pid && splitGames(pid, r.short) < MIN_MATCHES) continue;
      if (pid && !cands.has(pid) && !subIn.has(pid)) cands.set(pid, { n: p.n, off: null, hist: true });
    }
    // 이 팀 소속으로 이번 대회 CP를 받은 선수(정규 로스터가 그대로 출전) + 다른 팀에 대체로 나간 소속 선수
    for (const [pid, c] of credit) if (c.team === r.short && !cands.has(pid) && !subIn.has(pid)) cands.set(pid, { n: nameOf.get(pid) || '', off: null });
    const notes = [];
    for (const x of homeExtra.get(r.short) || []) {
      if (!cands.has(x.pid)) cands.set(x.pid, { n: x.name, off: null, hist: true });
      const c = credit.get(x.pid);
      notes.push(`${x.name} ${x.team} 대체 출전${c ? (c.pos ? ` ${c.pos}위 +${fmt(c.min)}` : ` 최소 +${fmt(c.min)}`) : ''}`);
    }
    const sb = subs.find((x) => x.team === r.short);
    if (sb) notes.push(`${(sb.out || []).join('·') || '로스터 일부'} ${sb.reason || ''} 결장 → ${(sb.in || []).map((x) => x.name).join('·')} 대체`);
    const vals = [...cands].map(([pid, v]) => {
      // 공식 상위 3인 밖의 선수는 지금까지 이 팀 합계에 들어간 CP가 없다고 본다 (12경기 규정 등으로 빠진 선수 포함). 이번 대회 CP만 더함
      // 공식 상위 3인 밖이면: 대체 관련 선수(기존 로스터·대체 선수)는 이전 CP 기록 합을, 그 밖은 0(12경기 규정 등)으로 본다
      const b = v.off != null ? base(pid, v.off) : v.hist ? base(pid, null) : 0, c = credit.get(pid);
      // 대체 선수가 소속팀 합계에 들어가려면 그 선수가 이 팀 소속이어야 함: 다른 팀(출전 팀)의 후보에서는 제외
      const away = c && c.team !== r.short && !(homeExtra.get(r.short) || []).some((x) => x.pid === pid);
      return { pid, n: v.n, min: b + (c && !away ? c.min : 0), max: b + (c && !away ? c.max : 0), got: c && !away ? c : null };
    });
    const top = (k) => vals.slice().sort((a, b) => b[k] - a[k]).slice(0, 3).reduce((a, x) => a + x[k], 0);
    const min = top('min'), max = top('max');
    const alive = ST.alive(r.id), pl = ST.placed.get(r.id);
    const parts = vals.slice().sort((a, b) => b.min - a.min).slice(0, 3);
    return { ...r, alive, livePos: alive ? fpos?.get(r.short) || null : null, donePos: pl?.pos, pend: min !== r.total && !alive && !!pl, notes, min, max, gain: min - r.total, parts, others: vals.filter((v) => !parts.includes(v)) };
  });
}

// CP 동률 (공식 규정 부록 C7.3): (A) Split 2 플레이오프 최종 순위가 좋은 팀 → (B) 프로리그 Split 2 최종 순위가 좋은 팀
// → 그래도 같으면 C7.2(프로리그 Split 2 안의 세부 기준). C7.2는 프로리그 Split 2 정규 시즌 포인트 → 킬 순으로 근사하고, 마지막은 공식 순위.
// (A)는 대회 최종 순위, 진행 중이면 정산표의 확정·결승 실시간 순위. 플레이오프 미출전은 출전 팀보다 뒤
let POIX = null;
function poPos(r) {
  if (!POIX || POIX.src !== A.cpEvents) { const e = (A.cpEvents || []).find((x) => x.slug === tieSlug()); POIX = { src: A.cpEvents, m: new Map((e?.rows || []).filter((x) => x.id).map((x) => [x.id, x.pos])) }; }
  return POIX.m.get(r.id) ?? r.donePos ?? r.livePos ?? 999;
}
let PLIX = null;
function plS2(r) {
  if (!PLIX || PLIX.src !== A.pl) { const m = new Map(); for (const p of Object.values(A.pl || {})) if (p.split === lastSplit()) for (const x of p.rows) m.set(x.id, x); PLIX = { src: A.pl, m }; }
  return PLIX.m.get(r.id);
}
const cpTie = (a, b) => { const d = poPos(a) - poPos(b); if (d) return d; const pa = plS2(a), pb = plS2(b); return (pa?.pos ?? 99) - (pb?.pos ?? 99) || (pb?.rs ?? 0) - (pa?.rs ?? 0) || (pb?.kills ?? 0) - (pa?.kills ?? 0); };
// 직행 확정(빌드가 meta.cpLock으로 알려 줌, 규정 3.6.3): 확정된 32팀은 항상 직행권 안, 나머지는 항상 밖. 그 안에서만 CP 순으로 줄을 세운다
let LOCKIX = null;
const cpLock = () => { const ids = A.meta?.cpLock; if (!ids?.length) return null; if (!LOCKIX || LOCKIX.src !== ids) LOCKIX = { src: ids, set: new Set(ids) }; return LOCKIX.set; };
const lockSide = (r) => { const L = cpLock(); return L && !L.has(r.id) ? 1 : 0; };
const cpOrder = (a, b) => lockSide(a) - lockSide(b) || b.total - a.total || cpTie(a, b) || a.rank - b.rank;

// 운영자 로스터 보정 (config overrides: rosterMoves → cpRosterOut·cpRosterAdd, 그리고 cpRosterAdd):
// 공식 현재 로스터에 아직 반영되지 않은 이적을 팀 CP에 반영하고 순위를 다시 매긴다.
//   빠진 선수(out)는 그 팀 합계에서 빼고, 들어온 선수(in)는 자기 CP(12경기 이상 뛴 대회의 CP 합)를 가지고 온다.
//   팀 CP는 현재 로스터 선수 중 이번 Split 프로리그에서 12경기 이상 뛴 선수의 상위 3인 합 (공식 순위표와 같은 조건)
//   선수를 빼면 공식 상위 3인 밖이던 로스터 선수가 3인 안으로 들어올 수 있어 남은 로스터 전원을 다시 본다.
// 공식 값이 60초마다 새로 들어오면 다시 적용된다(이미 반영된 이적은 두 번 적용되지 않음). 동률 순서도 여기서 맞춘다
const curSplitGames = (pid) => {
  const sp = Math.max(...(A.cpEvents || []).filter((e) => e.kind === 'pl').map((e) => e.split));
  let n = 0, known = false;
  for (const e of A.cpEvents || []) if (e.kind === 'pl' && e.split === sp) { const g = played(e.id, pid); if (g != null) { known = true; n += g; } }
  return known ? n : null;
};
const playerCp = (pid) => cpHistory(pid).filter((x) => eligible(x.e.id, pid)).reduce((a, x) => a + x.r.cp, 0);
function applyCpRoster() {
  const add = A.cpRosterAdd || {}, out = A.cpRosterOut || {};
  if (A.cp.__adj) return;
  for (const short of new Set([...Object.keys(add), ...Object.keys(out)])) {
    const r = A.cp.find((x) => x.short === short);
    if (!r) continue;
    r.total0 ??= r.total; // 공식 합계
    const outK = new Set((out[short] || []).map((n) => String(n).toLowerCase()));
    const before = r.players.map((p) => p[0]);
    r.players = r.players.filter((p) => !outK.has(String(p[0]).toLowerCase()));
    const cand = new Map(r.players.map((p) => [String(p[0]).toLowerCase(), p]));
    // 들어온 선수 + 남은 로스터 선수(공식 상위 3인 밖이던 선수)
    const roster = (team(short)?.roster || []).filter((p) => p.r !== 'k').map((p) => p.n);
    for (const n of [...(add[short] || []), ...(outK.size ? roster : [])]) {
      const k = String(n).toLowerCase();
      if (cand.has(k) || outK.has(k)) continue;
      const pid = pidOf(n);
      const g = pid ? curSplitGames(pid) : null;
      const v = pid && (g == null || g >= MIN_MATCHES) ? playerCp(pid) : 0;
      cand.set(k, [n, v, pid, (add[short] || []).includes(n) ? 'add' : 'roster', g]);
    }
    const all = [...cand.values()].sort((a, b) => b[1] - a[1]);
    r.players = all.slice(0, 3);
    r.bench = all.slice(3);
    r.total = r.players.reduce((a, p) => a + p[1], 0);
    r.moves = { out: before.filter((n) => outK.has(String(n).toLowerCase())), in: (add[short] || []).filter((n) => !before.includes(n)) };
  }
  A.cp.sort(cpOrder);
  A.cp.forEach((r, i) => (r.rank = i + 1));
  const cut = A.season.cpDirectSlots, c32 = A.cp.at(cut - 1)?.total ?? 0, c33 = A.cp.at(cut)?.total ?? 0;
  for (const r of A.cp) { r.status = r.rank <= cut ? 'direct' : 'lcq'; r.gap = r.rank <= cut ? r.total - c33 : c32 - r.total; }
  A.cp.__adj = true;
}
// 로스터 이동 안내 한 줄 (CP 표의 팀 칸)
// 조각마다 따로 감싸 번역이 조각 단위로 맞게 한다 (예: 'Nono 합류', '(공식 840 → 984)')
const moveNote = (r) => (r.moves && (r.moves.out.length || r.moves.in.length) ? `<small class="sub-note"><span>로스터 변경 반영:</span> ${[...r.moves.out.map((n) => `<span>${esc(n)} 이탈</span>`), ...r.moves.in.map((n) => `<span>${esc(n)} 합류</span>`)].join(' · ')}${r.total0 != null && r.total0 !== r.total ? ` <span>(공식 ${fmt(r.total0)} → ${fmt(r.total)})</span>` : ''}</small>` : '');

let BOARD = null;
function board() {
  applyCpRoster();
  if (BOARD && BOARD.cp === A.cp && BOARD.ev === A.cpEvents && BOARD.subs === A.cpSubs && BOARD.fsig === finalsSig()) return BOARD;
  const ST = settle();
  const cut = A.season.cpDirectSlots;
  const rows = ST ? settleRows(ST) : A.cp.map((r) => ({ ...r, alive: false, pend: false, notes: [], min: r.total, max: r.total }));
  rows.sort((a, b) => b.min - a.min || cpTie(a, b) || a.rank - b.rank);
  rows.forEach((r, i) => (r.prank = i + 1));
  const c32 = rows.at(cut - 1)?.min ?? 0, c33 = rows.at(cut)?.min ?? 0;
  for (const r of rows) { r.pstatus = r.prank <= cut ? 'direct' : 'lcq'; r.pgap = r.prank <= cut ? r.min - c33 : c32 - r.min; }
  const state = !ST ? 'none' : ST.open ? 'live' : rows.some((r) => r.pend) ? 'pending' : 'confirmed';
  BOARD = { cp: A.cp, ev: A.cpEvents, subs: A.cpSubs, fsig: finalsSig(), ST, rows, state, pendTeams: rows.filter((r) => r.pend).length };
  // 화면 곳곳(홈 카드, 한국 팀 카드, 팀 목록, 위치 그림)의 CP 순위도 이 값으로 맞춘다
  for (const k of A.kr || []) { const x = rows.find((y) => y.short === k.short); if (x) k.cp = { rank: x.prank, total: x.min, gap: x.pgap, status: x.pstatus, off: { rank: x.rank, total: x.total } }; }
  for (const t of Object.values(A.teams)) { const x = rows.find((y) => y.id === t.id); if (x) t.cp = { rank: x.prank, total: x.min }; }
  return BOARD;
}
const BOARD_NOTE = {
  live: (b) => finalsLivePos() ? `<b>결승 실시간 정산</b> ${esc(b.ST.e.label)} 매치 포인트 결승 진행 중 · 결승 팀은 지금 결승 순위의 CP를, 이미 탈락한 팀은 확정 순위의 CP를 더한 값입니다. 결승 순위가 바뀌면 바로 다시 계산합니다.` : `<b>실시간 정산</b> ${esc(b.ST.e.label)} 진행 중 · 순위가 정해진 팀은 그 CP를, 아직 경기 중인 팀은 최소 보장 CP(1인 ${fmt(b.ST.minCp)})를 더한 값입니다. 결승이 시작되면 결승 실시간 순위로 바뀌고, 대회가 끝나면 최종 순위로 확정됩니다.`,
  pending: (b) => `<b>확정</b> ${esc(b.ST.e.label)} 최종 순위까지 반영한 값입니다.`,
  confirmed: (b) => `<b>확정</b> ${esc(b.ST.e.label)} 최종 순위까지 반영한 값입니다.`,
};
const boardNote = () => {
  const b = board();
  if (!BOARD_NOTE[b.state]) return '';
  const subs = A.cpSubs?.[b.ST.e.slug] || [];
  const subLine = subs.length ? `<br><b>대체 출전 반영</b> ${subs.map((x) => `${esc(x.team)}: ${esc((x.out || []).join('·') || '결장 선수')} → ${esc((x.in || []).map((y) => `${y.name}(${y.home})`).join('·'))}`).join(' / ')}. <span>빠진 선수는 이번 대회 CP를 받지 않고, 대체 선수의 CP는 원래 소속팀 합계에 들어갑니다.</span>` : '';
  return `<p class="board-note ${b.state}">${BOARD_NOTE[b.state](b)}${subLine}</p>`;
};

// 같은 CP 팀이 이웃해 있으면 동률 기준(Split 2 플레이오프 순위)을 작게 표시
// 같은 CP 팀이 이웃해 있으면 순서를 가른 기준을 작게 표시 (S2 플레이오프 순위 → 프로리그 S2 순위 → 프로리그 S2 포인트)
const tieNote = (rows, i, k) => {
  const r = rows[i];
  const tied = rows.filter((x) => x[k] === r[k]);
  if (tied.length < 2) return '';
  const p = poPos(r), pl = plS2(r);
  const byPo = new Set(tied.map(poPos)).size === tied.length;
  const samePl = tied.filter((x) => poPos(x) === p && plS2(x)?.pos === pl?.pos).length > 1;
  const why = p < 999 && (byPo || tied.filter((x) => poPos(x) === p).length === 1) ? `S${tieN()} PO ${p}위` : `PL S${lastSplit()} ${pl?.pos ?? '–'}위${samePl ? ` · ${pl?.rs ?? 0}점` : ''}`;
  return `<small class="tie" title="동률 기준: S${tieN()} 플레이오프 순위 → 프로리그 S${lastSplit()} 순위 → 프로리그 S${lastSplit()} 포인트">동률 · ${why}</small>`;
};
const qualTag = (direct) => direct ? '<span class="tag ok">직행권</span>' : '<span class="tag lcq">LCQ</span>';
const QUAL_REGIONS = ['apac-n', 'apac-s', 'emea', 'americas'];
// 지역별 챔피언십 직행권 팀 수. 아래 표와 같은 기준(대회 중·직후는 정산 순위, 그 밖에는 현재 순위)
function qualStrip(q, region) {
  const BD = board();
  const src = BD.state === 'live' || BD.state === 'pending' ? BD.rows.map((r) => ({ g: r.region, d: r.pstatus === 'direct' })) : A.cp.map((r) => ({ g: r.region, d: r.status === 'direct' }));
  const lcq = Math.round(A.season.lcqSlots / QUAL_REGIONS.length);
  const n = (g) => src.filter((x) => x.g === g && x.d).length;
  const lcqOver = lcqEvents().length > 0 && lcqEvents().every((e) => A.series.some((x) => x.eventId === e.eventId && x.phase === 'Match Point Finals' && x.status === 'completed'));
  const basis = BD.state === 'live' ? (finalsLivePos() ? '결승 실시간 정산 기준' : '최소 보장 정산 기준') : BD.state === 'pending' ? '최종 순위 정산 기준' : cpLock() ? '확정' : '현재 순위 기준';
  return `<section class="qual" aria-label="지역별 챔피언십 직행권 팀 수">
    <div class="qual-h"><b>챔피언십 직행권 ${src.filter((x) => x.d).length}팀</b><span>${basis} · ${lcqOver ? `<span>LCQ에서 지역별 ${lcq}팀이 더해져 ${A.season.cpDirectSlots + A.season.lcqSlots}팀 확정</span>` : `나머지 팀은 지역별 LCQ에서 ${lcq}자리씩`}</span></div>
    <div class="qual-g">${QUAL_REGIONS.map((g) => `<a class="qual-c${region === g ? ' on' : ''}" href="${qsLink('/points/cp', q, { r: region === g ? 'all' : g })}" aria-current="${region === g}"><span class="qual-r">${REGION[g]}</span><b class="num">${n(g)}<small data-tr="${n(g) === 1 ? '팀 (1개)' : '팀 (개수)'}">팀</small></b><span class="qual-s">LCQ ${lcq}팀 더해 챔피언십 ${n(g) + lcq}팀</span></a>`).join('')}</div>
  </section>`;
}

// 표에서 관심 팀 줄로 바로 가기 (117줄 표). 지금 표에 있는 관심 팀만, 대표 응원 팀이 맨 앞
function jumpChips(rows) {
  const here = new Set(rows.map((r) => r.short));
  const mid = mainId();
  const list = focusList().filter((k) => here.has(k.short)).sort((a, b) => (team(b.short)?.id === mid) - (team(a.short)?.id === mid) || (a.cp?.rank ?? 999) - (b.cp?.rank ?? 999)).slice(0, 6);
  if (!list.length) return '';
  return `<div class="cp-jump" role="group" aria-label="표에서 팀 찾기"><span>표에서 찾기</span>${list.map((k) => `<button type="button" class="${CAT[lvlOf(k.short)] || ''}${team(k.short)?.id === mid ? ' main' : ''}" data-cp-jump="${esc(k.short)}">${logo(k.short)}<b>${esc(k.short)}</b></button>`).join('')}</div>`;
}
document.addEventListener('click', (e) => {
  const b = e.target.closest?.('[data-cp-jump]');
  if (!b) return;
  const row = [...document.querySelectorAll('tr[data-cpt]')].find((x) => x.dataset.cpt === b.dataset.cpJump);
  if (!row) return;
  row.scrollIntoView({ block: 'center', behavior: motionOK() ? 'smooth' : 'auto' });
  row.classList.remove('jumped'); void row.offsetWidth; row.classList.add('jumped');
  row.focus({ preventScroll: true });
});

function cpView(q) {
  // 시즌 초: 첫 프로리그가 끝나기 전에는 챔피언십 포인트가 없다
  if (!A.cp.length) return `<p class="empty">아직 챔피언십 포인트가 없습니다. 첫 프로리그가 끝나면 순위가 표시됩니다.</p><p class="lead">${A.season.cpDirectSlots}위까지 챔피언십 직행, 나머지 ${A.season.lcqSlots}자리는 LCQ에서 정합니다. 팀 CP는 현재 로스터에서 CP가 높은 선수 3명의 합입니다.</p>`;
  const mode = q.get('m') === 'players' ? 'players' : 'teams';
  const region = q.get('r') || 'all';
  const cut = A.season.cpDirectSlots;
  const krNames = new Set(Object.values(A.teams).flatMap((t) => t.krPlayers || []));
  const regionSeg = `<div class="seg" role="group" aria-label="지역">${['all', 'apac-n', 'apac-s', 'emea', 'americas'].map((r) => `<a href="${qsLink('/points/cp', q, { r })}" aria-current="${region === r}">${r === 'all' ? '전체' : REGION[r]}</a>`).join('')}</div>`;
  const modeSeg = `<div class="seg" role="group" aria-label="단위"><a href="${qsLink('/points/cp', q, { m: 'teams' })}" aria-current="${mode === 'teams'}">팀</a><a href="${qsLink('/points/cp', q, { m: 'players' })}" aria-current="${mode === 'players'}">선수</a></div>`;
  const krSummary = (focusList()).filter((k) => k.cp).map((k0) => ({ ...k0, cp: q.get('v') === 'now' && k0.cp.off ? { ...k0.cp, ...k0.cp.off } : k0.cp })).sort((a, b) => a.cp.rank - b.cp.rank).map((k) => `<tr class="${rowCls({ kr: k.level, short: k.short })}"><td class="rank">${k.cp.rank}</td><td class="team">${krDot(k.level, k.short)}${teamLink(k.short, k.name)}${coachBadge(k.level, k.short)}${(() => { const d = (k.cp.status || (k.cp.rank <= cut ? 'direct' : 'lcq')) === 'direct'; const gap = k.cp.gap == null ? '' : d ? `${cut + 1}위와 +${fmt(k.cp.gap)}` : `${cut}위까지 −${fmt(k.cp.gap)}`; return `${gap ? `<small class="gap-sm">${gap}</small>` : ''}</td><td class="r num">${fmt(k.cp.total)}</td><td class="r">${qualTag(d)}</td><td class="r small opt muted">${gap}</td>`; })()}</tr>`).join('');

  const BD = board(), ST = BD.ST;
  const settling = BD.state === 'live' || BD.state === 'pending';
  // 기본은 정산값. 대회가 끝나 공식 합계와 대조가 끝나면(confirmed) 공식 값을 그대로 보여 줌
  // 정산값이 곧 표시값. 대회가 끝나면 최종 순위로 정산된 값이 그대로 확정값이 된다 (공식 합계와의 대조는 내부에서만)
  const view = settling && mode === 'teams' ? 'min' : 'now';
  const viewSeg = '';
  let table;
  if (view === 'min') {
    let rows = BD.rows.filter((r) => (region === 'all' || r.region === region) && (!opt.krOnly || isF(r.short)));
    table = `    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>팀</th><th class="r opt">대회 전</th><th class="r opt2">${esc(ST.e.short)}</th><th class="r">${BD.state === 'live' ? (finalsLivePos() ? '정산 (결승 실시간)' : '정산 (최소 보장)') : '정산'}</th><th class="r opt">최대</th><th class="r opt2">상태</th></tr></thead><tbody>
      ${rows.map((r, ri) => { const isCut = region === 'all' && !opt.krOnly && r.prank === cut; return `<tr class="expandable ${rowCls(r)} ${isCut ? 'cut' : ''}" data-toggle="st-${ri}" tabindex="0" aria-expanded="false"><td class="rank">${r.prank}<small class="mv">${r.prank < r.rank ? '▲' + (r.rank - r.prank) : r.prank > r.rank ? '▼' + (r.prank - r.rank) : ''}</small></td><td class="team">${krDot(r.kr, r.short)}${teamLink(r.short, r.name)}${moveNote(r)}<small class="sm-only">${qualTag(r.pstatus === 'direct')} ${r.alive ? (r.livePos ? `결승 ${r.livePos}위 (실시간) +${fmt(r.gain)}` : `${esc(ST.e.short)} 진행 중 · 최소 +${fmt(r.gain)}`) : r.donePos ? `${esc(ST.e.short)} ${r.donePos}위${r.gain > 0 ? ` +${fmt(r.gain)}` : ''}` : r.gain ? `대체 출전 +${fmt(r.gain)}` : ''}${r.notes.length ? `<br>${r.notes.map(esc).join('<br>')}` : ''}</small></td><td class="r opt num">${fmt(r.total)}</td><td class="r small opt2">${r.alive ? (r.livePos ? `<span class="tag live">결승 ${r.livePos}위</span> +${fmt(r.gain)}` : `<span class="tag live">진행 중</span> 최소 +${fmt(r.gain)}`) : r.donePos ? `${r.donePos}위${r.gain > 0 ? ` <span class="muted">+${fmt(r.gain)}</span>` : ''}` : r.gain ? `<span class="muted">+${fmt(r.gain)}</span>` : '<span class="muted">미출전</span>'}${r.notes.length ? `<small class="sub-note">${r.notes.map(esc).join('<br>')}</small>` : ''}</td><td class="r num"><b>${fmt(r.min)}</b>${tieNote(rows, ri, 'min')}</td><td class="r opt num muted">${fmt(r.max)}</td><td class="r opt2">${qualTag(r.pstatus === 'direct')}</td></tr>
        <tr class="detail" id="st-${ri}" hidden><td></td><td colspan="6"><div class="st-parts"><b>합산 선수 (상위 3인)</b> ${(r.parts || []).map((v) => `<span class="cpb-i"><i>${esc(v.n)}</i> <b>${fmt(v.min)}</b>${v.got ? ` <small>이번 ${v.got.pos ? v.got.pos + '위' : v.got.livePos ? '결승 ' + v.got.livePos + '위' : '최소'} +${fmt(v.got.min)}${v.got.short12 ? ' (12경기 미달)' : ''}</small>` : ''}</span>`).join('')}${r.others?.length ? `<br><span class="muted">그 밖: ${r.others.map((v) => `${esc(v.n)} ${fmt(v.min)}`).join(', ')}</span>` : ''}</div></td></tr>${isCut ? `<tr class="cut-label"><td colspan="7">여기까지 ${finalsLivePos() || BD.state !== 'live' ? '' : '최소 보장 기준 '}챔피언십 직행권 · 아래는 LCQ</td></tr>` : ''}`; }).join('')}
    </tbody></table></div>
    <p class="lead">팀 CP는 상위 3인 합이라, 결승 진출 팀은 '1인 최저 CP × 3'을 더했습니다. '최대'는 우승했을 때입니다.</p>`;
  } else if (mode === 'teams') {
    let rows = A.cp.filter((r) => region === 'all' || r.region === region);
    if (opt.krOnly) rows = rows.filter((r) => isF(r.short));
    // CP 막대(넓은 화면): 1위 CP를 끝으로, 세로선은 직행 마지막 자리(${cut}위) CP
    const top = Math.max(1, ...A.cp.map((x) => x.total)), cutCp = A.cp.at(cut - 1)?.total ?? 0;
    const cutAt = Math.min(100, (cutCp / top) * 100).toFixed(1);
    table = `${jumpChips(rows)}<div class="tbl-wrap"><table class="tbl cp-tbl"><thead><tr><th>#</th><th>팀</th><th class="r">CP</th><th class="r cpx">직행선과 차이</th><th class="cpx cp-barh">CP <small>│ <span>${cut}위</span></small></th><th class="r cp-st">상태</th></tr></thead><tbody>
      ${rows.map((r, i) => {
        const isCut = region === 'all' && !opt.krOnly && r.rank === cut;
        const d = r.status === 'direct';
        // 직행 팀은 33위와의 차이(+), LCQ 팀은 32위까지 남은 차이(−). 직행 확정 뒤 32위보다 CP가 많은 LCQ 팀은 비움
        const gap = r.gap == null || r.gap < 0 ? '' : d ? `+${fmt(r.gap)}` : `−${fmt(r.gap)}`;
        return `<tr class="expandable ${rowCls(r)} ${isCut ? 'cut' : ''}" data-toggle="cp-${i}" data-cpt="${esc(r.short)}" tabindex="0" aria-expanded="false"><td class="rank">${r.rank}</td><td class="team">${krDot(r.kr, r.short)}${teamLink(r.short, r.name)}${coachBadge(r.kr, r.short)}<small class="reg">${esc(REGION[r.region] || '')}</small>${moveNote(r)}</td><td class="r num">${fmt(r.total)}${tieNote(rows, i, 'total')}<small class="st-sm ${d ? 'ok' : 'lcq'}">${d ? '직행' : 'LCQ'}</small></td><td class="r small muted cpx num">${gap}</td><td class="cpx cp-barc"><span class="cp-bar" aria-hidden="true"><i class="${d ? 'ok' : 'lcq'}" style="width:${Math.min(100, (r.total / top) * 100).toFixed(1)}%"></i><b style="left:${cutAt}%"></b></span></td><td class="r cp-st">${qualTag(d)}</td></tr>
        <tr class="detail" id="cp-${i}" hidden><td></td><td colspan="5"${lazy(() => r.players.map(([n, p, id]) => cpBreak(id, n, p, r.short)).join(''))}></td></tr>
        ${isCut ? `<tr class="cut-label"><td colspan="6">여기까지 챔피언십 직행권 · 아래는 LCQ</td></tr>` : ''}`;
      }).join('')}
    </tbody></table></div>`;
  } else {
    const ps = A.cp.filter((r) => region === 'all' || r.region === region).flatMap((r) => r.players.map(([n, p, id]) => ({ n, p, id, short: r.short, kr: opt.mode === 'kr' ? krNames.has(n) : isF(r.short) })))
      .filter((x) => !opt.krOnly || x.kr).sort((a, b) => b.p - a.p).slice(0, 150);
    table = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>선수</th><th>팀</th><th class="r">CP</th></tr></thead><tbody>
      ${ps.map((x, i) => `<tr class="expandable ${x.kr ? 'kr k-team' : ''}" data-toggle="cpp-${i}" tabindex="0" aria-expanded="false"><td class="rank">${i + 1}</td><td class="team">${x.kr ? krDot('team') : ''}${esc(x.n)}</td><td>${teamLink(x.short)}</td><td class="r num">${fmt(x.p)}</td></tr>
        <tr class="detail" id="cpp-${i}" hidden><td></td><td colspan="3"${lazy(() => cpBreak(x.id, x.n, x.p, x.short))}></td></tr>`).join('')}
    </tbody></table></div><p class="lead">공식 순위표가 팀별로 공개하는 합산 대상 선수(상위 3인)만 표시합니다.</p>`;
  }
  const cpKey = BD.state === 'live' || BD.state === 'pending' ? intlKey() : null;
  return `${spoil(qualStrip(q, region), cpKey, '지역별 직행권 팀 수')}${boardNote()}${cpLock() ? '<p class="board-note">직행 32팀은 Split 2 플레이오프가 끝난 시점의 CP로 확정되었습니다. 이후의 로스터 변경은 LCQ·챔피언십 시드에만 반영되고 직행 여부는 바꾸지 않습니다 (공식 규정 3.6.3, C6.5).</p>' : ''}${spoil(ringLine(focusList()), cpKey, 'CP 위치')}<p class="lead">${A.season.cpDirectSlots}위까지 챔피언십 직행, 나머지 ${A.season.lcqSlots}자리는 LCQ에서 정합니다. 팀 CP는 현재 로스터에서 CP가 높은 선수 3명의 합입니다. CP가 같으면 Split ${tieN()} 플레이오프 최종 순위, 그다음 프로리그 Split ${lastSplit()} 최종 순위가 좋은 팀이 위입니다(공식 규정 C7.3).</p>
    ${spoil(`<div class="pts-cols"><div class="pts-side">${krSummary ? `<section class="sec"><h2 class="h2">${ML().title}</h2><div class="tbl-wrap" style="margin-top:8px"><table class="tbl"><tbody>${krSummary}</tbody></table></div></section>` : ''}</div>
    <section class="sec"><div class="controls">${viewSeg}${view === 'min' ? '' : modeSeg}${regionSeg}</div>${table}</section></div>`, cpKey, '챔피언십 포인트 순위')}
    <div class="explain"><b>선수 1명이 받는 CP</b> (최종 순위별)
      <table><tr><td>프로리그</td><td>${A.season.scoring.cpProLeague.slice(0, 10).join(', ')} … (30위 ${A.season.scoring.cpProLeague.at(-1)})</td></tr>
      <tr><td>플레이오프</td><td>${A.season.scoring.cpPlayoffs.slice(0, 10).join(', ')} … (40위 100)</td></tr></table>
      <p style="margin:6px 0 0">팀이나 선수 줄을 누르면 대회별로 받은 CP가 펼쳐집니다. 진행 중인 플레이오프는 순위가 정해진 팀부터 공식 합계에 바로 들어갑니다.</p></div>`;
}

// 대회별 CP 내역: 대회를 고르면 팀 순위 · 1인당 CP · 받은 선수
function cpEventsView(q) {
  const evs = A.cpEvents || [];
  if (!evs.length) return '<p class="empty">대회별 CP 데이터가 아직 없습니다.</p>';
  const cur = evs.find((e) => e.slug === q.get('e')) || evs.at(-1);
  // 스플릿마다 한 줄(줄 머리 S1·S2), 버튼은 줄바꿈해서 모두 보이게. 버튼 이름에서는 줄 머리와 겹치는 'S1 ' 을 뺀다
  const groups = [...new Set(evs.map((e) => e.split))].map((sp) => `<div class="ev-row" role="group" aria-label="Split ${sp}"><b>S${sp}</b>${evs.filter((e) => e.split === sp).map((e) => `<a href="${qsLink('/points/events', q, { e: e.slug })}" aria-current="${e === cur}" title="${esc(e.label)}">${esc(String(e.short).replace(/^S\d+\s+/, ''))}</a>`).join('')}</div>`).join('');
  let rows = cur.rows;
  if (opt.krOnly) rows = rows.filter((r) => isF(r.short));
  const open = cur.rows.filter((r) => !r.id).length;
  return `<p class="lead">어느 대회에서 어느 팀(선수)이 몇 CP를 받았는지 봅니다. 같은 팀 선수는 1인당 같은 CP를 받습니다.</p>
    <div class="ev-pick">${groups}</div>
    ${spoil(`<section class="sec"><h2 class="h2">${esc(cur.label)}</h2>${open ? `<p class="lead"><span class="tag live">진행 중</span> ${open}자리는 아직 순위가 정해지지 않았습니다.</p>` : ''}
    <div class="tbl-wrap"><table class="tbl ev-tbl"><thead><tr><th>순위</th><th>팀</th><th class="r">1인당 CP</th><th class="ev-plc">받은 선수</th></tr></thead><tbody>
      ${rows.map((r) => `<tr class="${rowCls(r)}"><td class="rank">${r.pos}</td>${(() => { const pls = r.players.map(([id, n]) => `<a href="#/players/${encodeURIComponent(id)}">${esc(n)}</a>`).join(', '); return `<td class="team">${r.id ? `${krDot(r.kr, r.short)}${r.short ? teamLink(r.short, r.name) : esc(r.name)}` : '<span class="muted">미정</span>'}${pls ? `<small class="ev-pls">${pls}</small>` : ''}</td><td class="r num">${fmt(r.cp)}</td><td class="small ev-plc">${pls}</td>`; })()}</tr>`).join('')}
    </tbody></table></div></section>`, cur.id === A.api?.intlEventId ? intlKey() : null, '대회 결과')}`;
}

function plView(q) {
  const keys = Object.keys(A.pl);
  const split = q.get('s') || String(Math.max(...keys.map((k) => +k.slice(1, 2))));
  const region = q.get('r') || 'apac-n';
  const P = A.pl[`s${split}:${region}`];
  const seg = (name, cur, items) => `<div class="seg" role="group" aria-label="${name}">${items.map(([v, l, patch]) => `<a href="${qsLink('/points/pl', q, patch)}" aria-current="${cur === v}">${l}</a>`).join('')}</div>`;
  const controls = `<div class="controls">
    ${seg('지역', region, ['apac-n', 'apac-s', 'emea', 'americas'].map((r) => [r, REGION[r], { r }]))}
    ${seg('스플릿', split, [...new Set(keys.map((k) => k.slice(1, 2)))].sort().map((n) => [n, `Split ${n}`, { s: n }]))}
  </div>`;
  if (!P) return controls + '<p class="empty">이 지역·스플릿 데이터가 아직 없습니다.</p>';
  // 순위는 하나: 리전 결승까지 반영한 최종 순위(챔피언십 포인트 기준). 플레이오프 진출은 PO 표시로
  let rows = P.rows.slice().sort((a, b) => (a.pos ?? 999) - (b.pos ?? 999) || (b.rs ?? 0) - (a.rs ?? 0) || (b.kills ?? 0) - (a.kills ?? 0));
  if (opt.krOnly) rows = rows.filter((r) => isF(r.short));
  const krHere = rows.filter((r) => isF(r.short));
  // 시작 전(아무도 시리즈를 치르지 않음): 표는 출전 팀 명단이고 순서는 순위가 아니다
  const pre = P.rows.every((r) => !r.sp && !r.rs && !r.cpPP);
  if (pre) return `${controls}<p class="lead">${esc(P.label)}. <span>아직 시작 전입니다. 아래는 출전 팀 명단이며 순서는 순위가 아닙니다.</span></p>
    <section class="sec"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>팀</th><th class="c">조</th></tr></thead><tbody>${rows.map((r) => `<tr class="${rowCls(r)}"><td class="team">${krDot(r.kr, r.short)}${teamLink(r.short, r.name)}</td><td class="c">${esc(r.group || '–')}</td></tr>`).join('')}</tbody></table></div></section>`;
  return `${controls}
    <p class="lead">${esc(P.label)}. <span>시리즈(하루 6게임) 순위마다 프로리그 포인트를 받고, 9개 시리즈 합으로 정규 시즌 순위를 정합니다.</span> <span>순위는 리전 결승까지 반영한 최종 순위(챔피언십 포인트 기준)이고, PO는 플레이오프 진출 팀입니다.</span></p>
    ${krHere.length && !opt.krOnly ? `<div class="kr-strip" style="margin-top:12px">${krHere.map((r) => `<a class="kchip ${CAT[lvlOf(r.short)]}" href="#/teams/${encodeURIComponent(r.short)}">${logo(r.short)}<span><b>${esc(r.short)}</b><small>${r.pos}위${r.qualified ? ' · PO' : ''}</small></span></a>`).join('')}</div>` : ''}
    <section class="sec"><div class="tbl-wrap"><table class="tbl pl-tbl"><thead><tr><th>#</th><th>팀</th><th class="c opt">조</th><th class="r">정규 점수</th><th class="r opt">킬</th><th class="r opt2">CP/인</th></tr></thead><tbody>
      ${rows.map((r) => `<tr class="${rowCls(r)}"><td class="rank">${r.pos ?? '–'}</td><td class="team">${krDot(r.kr, r.short)}${teamLink(r.short, r.name)}${r.qualified ? ' <span class="tag ok po-tag">PO</span><span class="po-dot" title="플레이오프 진출" aria-label="플레이오프 진출"></span>' : ''}</td><td class="c opt">${esc(r.group)}</td><td class="r num">${r.rs ?? '–'}</td><td class="r opt">${r.kills ?? '–'}</td><td class="r opt2">${fmt(r.cpPP)}</td></tr>`).join('')}
    </tbody></table></div></section>
    <div class="explain"><b>점수 계산</b>
      <table><tr><td>게임</td><td>순위 점수 + 킬당 1점 (1위 12, 2위 9, 3위 7, 4위 5, 5위 4 …)</td></tr>
      <tr><td>정규 시즌</td><td>시리즈 순위별 ${A.season.scoring.plRegular.slice(0, 5).join(', ')} … 20위 0</td></tr>
      <tr><td>리전 결승</td><td>${A.season.scoring.plFinals.slice(0, 5).join(', ')} … 20위 0</td></tr></table></div>`;
}

/* ---------- 팀 ---------- */
const isKrP = (p) => p.c === 'KR';
// 선수 이름 → 공식 선수 id (대회별 CP 기록에서. 최근 대회가 우선)
let PID = null;
function pidOf(name) {
  if (!PID || PID.src !== A.cpEvents) {
    const m = new Map();
    for (const e of A.cpEvents || []) for (const r of e.rows) for (const [id, n] of r.players) m.set(n.toLowerCase(), id);
    for (const r of A.cp) for (const [n, , id] of r.players) if (id) m.set(n.toLowerCase(), id);
    PID = { src: A.cpEvents, m };
  }
  return PID.m.get(String(name).toLowerCase()) || null;
}
const playerLink = (name, html) => { const id = pidOf(name); return id ? `<a class="plink" href="#/players/${encodeURIComponent(id)}">${html ?? esc(name)}</a>` : (html ?? esc(name)); };
const pName = (p) => `${isKrP(p) ? `<b class="krn">${esc(p.n)}</b>` : esc(p.n)}${p.mix ? '<sup class="mix" title="한국계 (국적과 대표 국가가 다르거나 운영자 확인)">계</sup>' : ''}`;
// 로스터 변경 기록 (scripts/rosters.mjs가 빌드마다 남김): 공식 로스터 변경, Liquipedia로 먼저 반영, 수동 반영, 2부 팀 명단·이름
const ROSTER_KIND = { official: '공식 로스터 변경', auto: '자동 반영', 'auto-end': '자동 반영 끝', manual: '수동 반영', 'manual-end': '수동 반영 삭제', cc: '2부 팀 명단 변경', rename: '2부 팀 이름 변경', start: '자동 확인 시작' };
function rosterLogView(q) {
  const all = A.rosterLog || [];
  const r = q.get('r') || 'all';
  let list = r === 'all' ? all : all.filter((e) => e.region === r);
  if (opt.krOnly) list = list.filter((e) => isF(e.team));
  const seg = `<div class="seg" role="group" aria-label="지역">${[['all', '전체'], ...['apac-n', 'apac-s', 'emea', 'americas'].map((x) => [x, REGION[x]])].map(([k, n]) => `<a href="${qsLink('/teams', q, { g: 'moves', r: k })}" aria-current="${k === r}">${esc(n)}</a>`).join('')}</div>`;
  const who = (e) => e.team ? (team(e.team) || A.xteams?.[e.team] ? teamLink(e.team, e.teamName || undefined) : esc(e.team)) : '';
  // 날짜마다 묶음 줄을 넣고, 처음에는 앞 40건만 보인다 (나머지는 '더 보기')
  const SHOW = 40;
  let lastDay = '';
  const rows = list.map((e, i) => { const d = dayKey(e.at), x = i >= SHOW ? ' xtra' : ''; const head = d !== lastDay ? `<tr class="rl-day${x}"><th colspan="5" scope="rowgroup">${esc(dayLabel(d))}</th></tr>` : ''; lastDay = d; return head + `<tr class="${e.team ? rowCls({ short: e.team }) : ''}${x}"><td class="num small rl-at">${esc(hhmm(e.at))}</td><td class="small rl-kind"><span class="tag ${e.kind === 'auto' ? 'kr' : e.kind === 'official' ? 'ok' : ''}">${esc(ROSTER_KIND[e.kind] || e.kind)}</span></td><td class="team">${who(e)}${e.region ? `<small>${esc(REGION[e.region] || '')}</small>` : ''}</td><td class="small rl-out${e.was || (e.out || []).length ? '' : ' none'}">${e.was ? `<span>구 ${esc(e.was)}</span>` : (e.out || []).map(esc).join(', ')}</td><td class="small rl-in${(e.in || []).length ? '' : ' none'}">${(e.in || []).map(esc).join(', ')}</td></tr>`; }).join('');
  return `<h1 class="title">로스터 변경</h1>
    <p class="lead">팀에서 빠지거나 새로 들어온 선수 기록입니다(최신순). 약 5분마다 공식 로스터와 Liquipedia를 확인합니다. Liquipedia에 먼저 올라온 이적은 '자동 반영'으로 팀 로스터·CP에 미리 넣고, 공식 로스터에 올라오면 그쪽을 따릅니다.</p>
    <div class="controls">${seg}</div>
    ${list.length ? `<div class="tbl-wrap rl-wrap${list.length > SHOW ? ' clip' : ''}"><table class="tbl rl"><thead><tr><th>시각</th><th>종류</th><th>팀</th><th>빠진 선수</th><th>들어온 선수</th></tr></thead><tbody>${rows}</tbody></table>${list.length > SHOW ? `<button type="button" class="tm-more" data-unclip="1">${list.length - SHOW}건 더 보기</button>` : ''}</div>` : '<p class="empty">기록이 없습니다.</p>'}
    <p class="caption"><a href="https://github.com/LaplusSUGAR/algs-kr/blob/main/logs/roster-changes.md" target="_blank" rel="noopener">전체 기록 (GitHub)</a></p>`;
}
// 팀의 지금 단계 (팀 목록·상세 배지): LCQ 위치 · 챔피언십 직행 · 국제전 단계. k = lcq | direct | live | out | intl
//   lcqBracket 은 대회마다 한 번만 만들고 팀별로 찾는다 (팀 120개마다 다시 만들지 않게)
function teamStatusMap() {
  const m = new Map();
  if (!intlCurrent()) {
    const Bs = lcqEvents().map(lcqBracket);
    for (const sh of Object.keys(A.teams)) { const l = lcqState(sh, Bs); if (l) m.set(sh, { k: / LIVE/.test(l) ? 'live' : /탈락/.test(l) ? 'out' : 'lcq', text: l.replace(/ · CP \d+위$/, '') }); }
    if (lcqEvents().length) for (const c of cpStanding()) if (c.direct && !m.has(c.short)) m.set(c.short, { k: 'direct', text: '챔피언십 직행' });
  } else if (A.intl) for (const sh of Object.keys(A.teams)) { const x = stageShort(sh); if (x && !/^CP /.test(x)) m.set(sh, { k: /LIVE/.test(x) ? 'live' : /탈락|미출전/.test(x) ? 'out' : 'intl', text: x }); }
  return (sh) => m.get(sh) || null;
}
// 팀의 다음(또는 진행 중) 경기: LCQ 단계가 있으면 그 경기 탭으로, 아니면 출전 명단에 든 다음 시리즈
function teamNext(short) {
  for (const e of lcqEvents()) {
    const B = lcqBracket(e);
    if (!B.E.list.some((x) => x.short === short)) continue;
    let st = null;
    for (const x of B.list) if (x.teams?.includes(short) && x.status !== 'completed') { st = x; break; }
    if (st) return { name: `${REGION[e.region] || ''} LCQ · ${st.ko}`, when: stWhen(st), live: st.status === 'live', href: qsLink('/standings', new URLSearchParams({ r: e.region }), { m: st.key }), s: st.s };
  }
  const s = A.series.filter((x) => x.status !== 'completed' && (x.lineup || []).includes(short)).sort((a, b) => a.start.localeCompare(b.start))[0];
  return s ? { name: `${ko(s.event, EVENT_KO)} · ${ko(s.name, PHASE_KO)}`, when: `${dateTime(s.start)} ${TZL}`, live: !!s.live, href: officialUrl(s), ext: true, s } : null;
}
function teams(parts, q) {
  if (parts[1] === 'pick') return `<h1 class="title">응원 팀 고르기</h1>${favPicker()}`;
  if (parts[1]) return teamDetail(decodeURIComponent(parts[1]));
  const g = q.get('g') || 'all';
  if (g === 'kr') return krTeams();
  if (g === 'moves') return rosterLogView(q);
  const all = Object.values(A.teams);
  const stOf = teamStatusMap();
  const tile = (t) => {
    const ps = (t.roster || []).filter((p) => p.r !== 'k'), cs = (t.roster || []).filter((p) => p.r === 'k');
    const cls = rowCls({ short: t.short }), st = stOf(t.short);
    return `<a class="team-tile ${cls}" href="#/teams/${encodeURIComponent(t.short)}" data-name="${esc((t.short + ' ' + t.name + ' ' + (t.roster || []).map((p) => p.n).join(' ')).toLowerCase())}">
      <span class="tile-id">${logo(t.short, 'lg')}<span class="tile-nm"><b>${esc(t.short)}${krDot('', t.short)}</b><small>${esc(t.name)}</small></span>${outTag(t.short)}</span>
      <span class="tile-meta">${t.cp ? `<span class="tchip">CP ${t.cp.rank}위</span>` : ''}${st ? `<span class="tchip st-${st.k}">${esc(st.text)}</span>` : ''}</span>
      <span class="tile-roster">${ps.map(pName).join(', ') || '로스터 정보 없음'}${cs.length ? `<br><span class="muted">코치 ${cs.map(pName).join(', ')}</span>` : ''}</span></a>`;
  };
  // 정렬: CP 순(기본) · 이름 순 · 단계 순(LIVE → LCQ → 직행 → 국제전 → 탈락 → 나머지, 같은 단계는 CP 순)
  const sort = ['name', 'stage'].includes(q.get('s')) ? q.get('s') : 'cp';
  const ST_ORDER = { live: 0, lcq: 1, direct: 2, intl: 3, out: 4 };
  const cpOrd = (a, b) => (a.cp?.rank ?? 999) - (b.cp?.rank ?? 999);
  const byCp = sort === 'name' ? (a, b) => a.short.localeCompare(b.short, 'en', { sensitivity: 'base', numeric: true })
    : sort === 'stage' ? (a, b) => (ST_ORDER[stOf(a.short)?.k] ?? 9) - (ST_ORDER[stOf(b.short)?.k] ?? 9) || cpOrd(a, b) : cpOrd;
  const sortSeg = `<div class="seg team-sort" role="group" aria-label="정렬">${[['cp', 'CP 순'], ['name', '이름 순'], ['stage', '단계 순']].map(([k, n]) => `<a href="${qsLink('/teams', q, { s: k === 'cp' ? null : k })}" aria-current="${k === sort}">${n}</a>`).join('')}</div>`;
  const order = { team: 0, member: 1, coach: 2 };
  // 지역 보기에서는 관심 팀 묶음이 그 지역 묶음과 같으므로 따로 두지 않는다 (대표 응원 팀도 지역 묶음에 끼우지 않음)
  let groups = [...(ML().region ? [] : [[ML().group, all.filter((t) => isF(t.short)).sort((a, b) => ((b.id === mainId()) - (a.id === mainId())) || (order[lvlOf(a.short)] ?? 0) - (order[lvlOf(b.short)] ?? 0) || byCp(a, b))]]), ...['apac-n', 'apac-s', 'emea', 'americas'].map((r) => [REGION[r], all.filter((t) => t.region === r && (g !== 'all' || ML().region || !isF(t.short))).sort(byCp)])];
  if (g !== 'all') groups = groups.filter(([n]) => n === REGION[g]);
  // '전체'에서는 지역마다 앞 8팀만 보이고 나머지는 '더 보기'로 (검색하면 모두 대상)
  const clipN = g === 'all' ? 8 : 0;
  return `<h1 class="title">팀</h1>
    <p class="lead">현재 시즌 팀과 로스터입니다. <b class="krn">굵은 이름</b>은 한국 선수, <sup class="mix">계</sup>는 한국계(혼혈·이중국적 등) 선수입니다.</p>
    ${krLegend()}
    <label class="visually-hidden" for="teamSearch">팀 또는 선수 검색</label>
    <div class="team-tools"><input class="search" id="teamSearch" type="search" placeholder="팀·선수 검색" autocomplete="off"><a class="btn-link pick-btn" href="#/teams/pick"><span aria-hidden="true">★</span><span>응원 팀 고르기</span>${opt.fav.length ? ` <small>${opt.fav.length}</small>` : ''}</a></div>
    ${sortSeg}
    <p class="empty" id="teamNone" hidden>찾는 팀이나 선수가 없습니다.</p>
    ${groups.map(([g, ts], i) => { const clip = clipN && ts.length > clipN + 2 && !(i === 0 && !ML().region && g === ML().group); return ts.length ? `<section class="sec team-group${clip ? ' clip' : ''}"><h2 class="h2">${esc(g)} <small class="muted">${ts.length}팀</small></h2><div class="team-grid">${ts.map(tile).join('')}</div>${clip ? `<button type="button" class="tm-more" data-unclip="1">${ts.length - clipN}팀 더 보기</button>` : ''}</section>` : ''; }).join('')}`;
}

// 응원 팀 고르기: 지역별 팀을 눌러 넣고 빼기 (브라우저에 저장)
function favPicker() {
  const all = Object.values(A.teams).sort((a, b) => (a.cp?.rank ?? 999) - (b.cp?.rank ?? 999));
  const chip = (t) => `<button type="button" class="fav-chip${opt.fav.includes(t.id) ? ' on' : ''}" data-fav="${esc(t.id)}" aria-pressed="${opt.fav.includes(t.id)}">${logo(t.short)}<b>${esc(t.short)}</b><small>${esc(t.name)}</small></button>`;
  return `<p class="lead">응원하고 싶은 팀을 누르세요. 고른 팀은 이 브라우저에 저장되고, '내 응원 팀' 모드에서 홈·표·경기가 이 팀들 위주로 바뀝니다. 지금 <b id="favCount">${opt.fav.length}</b>팀 선택. <a class="more" href="#/">홈에서 보기</a></p>
    <div class="controls">${modeSwitch()}${opt.fav.length ? '<button type="button" class="link-btn" data-fav-clear="1">모두 지우기</button>' : ''}</div>
    ${opt.fav.length ? `<div class="main-pick"><b>대표 응원 팀</b> <span class="muted">홈 맨 위 큰 카드와 표 강조가 이 팀 기준이 됩니다</span><div class="main-opts">${opt.fav.map((id) => Object.values(A.teams).find((t) => t.id === id)).filter(Boolean).map((t) => `<button type="button" class="main-opt${opt.main === t.id ? ' on' : ''}" data-main="${esc(t.id)}" aria-pressed="${opt.main === t.id}">${logo(t.short)}${esc(t.short)}${opt.main === t.id ? ' ★' : ''}</button>`).join('')}</div></div>` : ''}
    <label class="visually-hidden" for="favSearch">팀 찾기</label><input class="search" id="favSearch" type="search" placeholder="팀 이름으로 찾기" autocomplete="off">
    ${['apac-n', 'apac-s', 'emea', 'americas'].map((r) => `<section class="sec fav-group"><h2 class="h2">${REGION[r]}</h2><div class="fav-grid">${all.filter((t) => t.region === r).map(chip).join('')}</div></section>`).join('')}`;
}
// 보기 모드 전환 버튼
const modeSwitch = () => `<div class="seg mode-seg" role="group" aria-label="보기 모드">${Object.entries(MODES).map(([k, m]) => `<button type="button" data-mode="${k}" aria-current="${opt.mode === k}" title="${m.label}"><span class="mm-l">${m.label}</span><span class="mm-s" aria-hidden="true">${m.tag}</span>${k === 'custom' && opt.fav.length ? ` ${opt.fav.length}` : ''}</button>`).join('')}</div>`;

// 팀 탭 '한국 관련': 한국 팀·한국 선수 팀·한국 코치 팀의 자세한 카드
function krTeams() {
  // 지역 보기에서는 그 지역 팀만 (다른 지역의 대표 응원 팀은 빼고, 그 팀은 자기 지역 목록에 나온다)
  const krs = ML().region ? focusList().filter((k) => !outsider(k.short)) : focusList();
  const card = (k) => {
    const t = team(k.short) || {};
    const si = A.intl ? krStageInfo(k.short) : { text: '' };
    const ps = (t.roster || []).filter((p) => p.r !== 'k'), cs = (t.roster || []).filter((p) => p.r === 'k');
    return `<a class="kcard ${CAT[k.level]}" href="#/teams/${encodeURIComponent(k.short)}">
      <span class="kcard-id">${logo(k.short, 'lg')}<span><b>${esc(k.name)}</b><small>${esc(outsider(k.short) ? '대표 응원 팀' : opt.mode === 'kr' ? KR_LABEL[k.level] : ML().label)} · ${esc(REGION[t.region] || '')}</small></span></span>
      <span class="kcard-stats"><span><b>${k.cp ? k.cp.rank + '위' : '–'}</b><small>CP</small></span><span><b>${k.pl ? k.pl.pos + '위' : '–'}</b><small>Split ${lastSplit()} PL</small></span><span><b>${k.intl ? k.intl.pos + '위' : '–'}</b><small>조별 리그</small></span></span>
      ${si.text ? `<span class="kcard-now">지금 · ${esc(si.text)}</span>` : ''}
      <span class="kcard-roster">${ps.map(pName).join(', ')}${cs.length ? ` · 코치 ${cs.map(pName).join(', ')}` : ''}</span>
    </a>`;
  };
  if (opt.mode === 'custom' && !krs.length) return `<h1 class="title">내 응원 팀</h1>${favPicker()}`;
  return `<h1 class="title">${ML().title}</h1>${opt.mode === 'custom' ? `<p class="lead"><a class="btn-link ghost" href="#/teams/pick">응원 팀 고르기</a></p>` : ''}<p class="lead">${opt.mode === 'kr' ? '한국 선수 또는 한국 코치가 있는 팀입니다.' : ML().region ? `${ML().label} 지역 팀입니다.` : '내가 고른 응원 팀입니다.'} 카드를 누르면 팀 상세로 갑니다.</p>${krLegend()}
    ${spoil(`<div class="kcards">${krs.map(card).join('') || '<p class="empty">없음</p>'}</div>`, intlKey(), '한국 팀 성적')}`;
}

// 선수 프로필: 현재 소속, Year 6 대회별 팀·순위·CP, 방송 채널
function playerView(parts) {
  const pid = decodeURIComponent(parts[1] || '');
  const h = cpHistory(pid);
  let name = h.at(-1)?.r.players.find(([id]) => id === pid)?.[1];
  const cpRow = A.cp.find((r) => r.players.some(([, , id]) => id === pid));
  const cpP = cpRow?.players.find(([, , id]) => id === pid);
  name ||= cpP?.[0];
  if (!name) return `<h1 class="title">선수</h1><p class="empty">선수를 찾지 못했습니다. <a href="#/teams">팀 목록</a>에서 찾아 보세요.</p>`;
  // 현재 소속: 최신 로스터에서 이름으로
  const cur = Object.values(A.teams).find((t) => (t.roster || []).some((p) => p.n.toLowerCase() === name.toLowerCase()));
  const rp = cur?.roster.find((p) => p.n.toLowerCase() === name.toLowerCase());
  const roleKo = { p: '선수', c: '주장', k: '코치' };
  const isCoach = rp?.r === 'k';
  const st = A.streams.players.find((p) => p.name.toLowerCase() === name.toLowerCase());
  const teamsSeen = [...new Map(h.map((x) => [x.r.short || x.r.name, x])).values()];
  return `<p style="margin:14px 0 0"><a class="more" href="${cur ? `#/teams/${encodeURIComponent(cur.short)}` : '#/teams'}">${cur ? esc(cur.name) : '팀 목록'}</a></p>
    <div class="detail-id">${cur ? logo(cur.short, 'xl') : ''}<h1 class="title">${esc(name)}</h1></div>
    <p class="lead">${cur ? `${teamLink(cur.short, cur.name)} · ${esc(REGION[cur.region] || '')}` : '현재 소속 정보 없음'}${rp ? ` · ${esc(rp.c || '')}${rp.rep ? ` (대표 ${esc(rp.rep)})` : ''} · ${esc(rp.title || roleKo[rp.r] || '')}` : ''}${rp?.mix ? ' · <span class="tag kr k-member">한국계</span>' : rp && isKrP(rp) ? ' · <span class="tag kr k-team">한국</span>' : ''}</p>
    ${liveFor((l) => l.who.toLowerCase() === name.toLowerCase() && (!cur || !l.team || l.team === cur.short))}
    ${spoil(`${isCoach && !h.length ? '' : `<section class="sec"><h2 class="h2">챔피언십 포인트</h2>${cpP ? `<p class="lead">${esc(cpRow.name)}의 팀 CP 합산에 들어가는 상위 3인입니다.</p>` : isCoach ? '<p class="lead">지금은 코치라 팀 CP 합산에 들어가지 않습니다. 아래는 선수로 뛸 때 얻은 CP입니다.</p>' : '<p class="lead">현재 팀 CP 합산(상위 3인)에는 들어가지 않는 선수입니다.</p>'}${cpBreak(pid, name, cpP ? cpP[1] : null, cur?.short)}</section>`}
    <section class="sec"><h2 class="h2">${esc(yearLabel())} 대회 기록</h2>${h.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>대회</th><th>팀</th><th class="r">순위</th><th class="r">CP</th></tr></thead><tbody>
      ${h.slice().reverse().map(({ e, r }) => `<tr><td><span class="lg-only">${esc(e.label)}</span><span class="sm-inline">${esc(e.short)}</span></td><td class="team">${r.short ? teamLink(r.short, r.name) : esc(r.name || '')}</td><td class="r num">${r.pos}</td><td class="r num">${fmt(r.cp)}</td></tr>`).join('')}
    </tbody></table></div>` : '<p class="empty">${esc(yearLabel())} 공식 대회 기록이 없습니다.</p>'}</section>`, intlKey(), '대회 기록')}
    ${teamsSeen.length > 1 ? `<p class="lead">${esc(yearLabel())} 소속 팀:${teamsSeen.map((x) => esc(x.r.short || x.r.name)).join(' → ')}. 챔피언십 포인트는 팀을 옮겨도 선수에게 남습니다.</p>` : ''}
    ${st ? `<section class="sec"><h2 class="h2">방송</h2>${streamRow(st)}</section>` : ''}
    <section class="sec"><h2 class="h2">이전 시즌</h2><p class="lead">Year 5 이전 기록은 Liquipedia 연동 후 이곳에 표시됩니다. 지금은 <a href="https://liquipedia.net/apexlegends/index.php?search=${encodeURIComponent(name)}" target="_blank" rel="noopener">Liquipedia에서 ${esc(name)} 검색</a>으로 볼 수 있습니다.</p></section>
    <p class="lead" style="margin-top:20px">${fbLink('데이터 오류', `선수 ${name}`, '이 선수 정보 고치기')} · ${fbLink('채널 제보', `선수 ${name}`, '방송 채널 제보하기')}</p>`;
}

function teamDetail(short) {
  const t = team(short);
  if (!t) return `<h1 class="title">팀</h1><p class="empty">${esc(short)} 팀을 찾지 못했습니다. <a href="#/teams">팀 목록</a>에서 다시 고르세요.</p>`;
  const plRows = Object.entries(A.pl).map(([k, P]) => [P, P.rows.find((r) => r.id === t.id)]).filter(([, r]) => r);
  const ir = A.intl?.rows.find((r) => r.id === t.id);
  const ss = A.series.filter((s) => s.results?.some((r) => r.short === short)).sort((a, b) => b.start.localeCompare(a.start));
  const st = A.streams.players.filter((p) => p.team === short);
  const roleKo = { p: '선수', c: '주장', k: '코치' };
  const si = ir ? krStageInfo(short) : null;
  const stt = teamStatusMap()(short), nx = teamNext(short);
  const favOn = opt.fav.includes(t.id), mainOn = opt.main === t.id;
  return `<p style="margin:14px 0 0"><a class="more" href="#/teams">팀 목록</a></p>
    <div class="td-head">${logo(short, 'xl')}<div class="td-id"><h1 class="title">${esc(t.name)}</h1>${t.was ? `<small class="was">구 ${esc(t.was)}</small>` : ''}
      <div class="td-tags"><span class="tchip">${esc(REGION[t.region] || '')}</span>${t.krLevel !== 'none' ? `<span class="tag kr ${CAT[t.krLevel]}">${KR_LABEL[t.krLevel]}</span>` : ''}${t.cp ? `<span class="tchip">CP ${t.cp.rank}위 · ${fmt(t.cp.total)}</span>` : ''}${stt ? `<span class="tchip st-${stt.k}">${esc(stt.text)}</span>` : ''}</div></div></div>
    <div class="td-btns"><button type="button" class="td-btn${favOn ? ' on' : ''}" data-fav="${esc(t.id)}" aria-pressed="${favOn}">${favOn ? '★ 응원 중' : '☆ 응원하기'}</button><button type="button" class="td-btn${mainOn ? ' on' : ''}" data-main="${esc(t.id)}" aria-pressed="${mainOn}">${mainOn ? '♥ 대표 팀' : '대표 팀으로'}</button></div>
    ${nx ? `<a class="td-next${nx.live ? ' live' : ''}" href="${esc(nx.href)}"${nx.ext ? ' target="_blank" rel="noopener"' : ''}><span class="td-next-k">${nx.live ? 'LIVE' : '다음 경기'}</span><span class="td-next-b"><b>${esc(nx.name)}</b><small>${esc(nx.when)}</small></span><span class="td-next-go" aria-hidden="true">›</span></a>` : ''}
    ${si?.text ? spoil(`<p class="lead"><b>${esc(ko(A.intl.name, EVENT_KO))}</b> · ${esc(si.text)}</p>`, intlKey(), '대회 성적') : ''}
    ${liveFor((l) => l.team === short)}
    <div class="td-cols"><div class="td-col">
    ${t.roster?.length ? `<section class="sec"><h2 class="h2">로스터</h2><ul class="roster-list">${t.roster.map((p) => `<li><span>${isKrP(p) ? `<span class="krdot ${p.r === 'k' ? 'k-coach' : 'k-team'}"></span>` : ''}${playerLink(p.n, pName(p))}${liveTag(p.n, short)}</span><span class="muted small">${esc(p.c || '')}${p.rep ? ` (대표 ${esc(p.rep)})` : ''}${roleKo[p.r] ? ', ' + (p.title || roleKo[p.r]) : ''}${p.mix ? ', 한국계' : ''}</span></li>`).join('')}</ul></section>` : ''}
    ${spoil(`${(() => { const c = A.cp.find((r) => r.id === t.id); return c ? `<section class="sec"><h2 class="h2">챔피언십 포인트 내역</h2><p class="lead">팀 CP ${fmt(c.total)} = 상위 3인 합</p>${c.players.map(([n, p, id]) => cpBreak(id, n, p, t.short)).join('')}</section>` : ''; })()}`, ir ? intlKey() : null, '챔피언십 포인트')}
    </div><div class="td-col">
    ${spoil(`    ${ir || plRows.length ? `<section class="sec"><h2 class="h2">시즌 성적</h2><ul class="td-season">
      ${ir ? `<li><span>${esc(ko(A.intl.name, EVENT_KO))} 조별 리그</span><b class="num">${ir.pos}위</b><small>${ptsLine(ir.pts, ir.kills)}</small></li>` : ''}
      ${plRows.sort((a, b) => b[0].split - a[0].split).map(([P, r]) => `<li><span>${esc(P.label)}</span><b class="num">${r.pos}위</b><small>프로리그 포인트 ${r.rs ?? '–'}점</small></li>`).join('')}
    </ul></section>` : ''}`, ir ? intlKey() : null, '시즌 성적')}
    ${ss.length ? `<section class="sec"><h2 class="h2">경기 결과</h2><ul class="td-res">${ss.slice(0, 12).map((s) => { const r = s.results.find((x) => x.short === short), p = ptsOf(r.pts, r.kills); return `<li><span class="td-res-n"><small>${dayLabel(dayKey(s.start))} · ${esc(ko(s.event, EVENT_KO))}</small>${olink(officialUrl(s), esc(ko(s.name, PHASE_KO)))}</span>${spoil(`<span class="td-res-r"><b class="num">${r.pos}위</b><small>${p.pp == null ? `${p.tp ?? '–'}점` : `킬 ${p.kp} · ${p.tp}점`}</small></span>`, seriesKey(s), '순위')}</li>`; }).join('')}</ul></section>` : ''}
    ${st.length ? `<section class="sec"><h2 class="h2">선수 방송</h2>${st.map(streamRow).join('')}</section>` : ''}
    </div></div>
    <p class="lead" style="margin-top:20px"><a href="https://liquipedia.net/apexlegends/index.php?search=${encodeURIComponent(t.name)}" target="_blank" rel="noopener">Liquipedia에서 보기</a> · ${fbLink('데이터 오류', `팀 ${t.short} (${t.name})`, '이 팀 정보 고치기')}</p>`;
}

/* ---------- 규칙 ---------- */
function rules(parts, q) {
  const sv = q.get('s') || 'all';
  const S = A.season, sc = S.scoring, B = S.brief || {};
  const mp = B.mp || 50;
  const PL = B.pl || { teams: 30, groups: 3, size: 10, series: 6, games: 6, rf: 20 };
  const CH = B.champ || { teams: S.cpDirectSlots + S.lcqSlots, direct: S.cpDirectSlots, lcq: S.lcqSlots, per: 2 };
  const LQ = B.lcq || { teams: 40, adv: 2 };
  const PO = B.po || { teams: 40, groups: 4 };
  const usd = (n) => '$' + Number(n).toLocaleString('en-US');
  const vids = S.rulesVideos || [];
  const vid = (v) => `<figure class="vid"><button class="yt" type="button" data-yt="${esc(v.id)}" aria-label="${esc(v.title)} 재생">
      <img src="https://i.ytimg.com/vi/${esc(v.id)}/hqdefault.jpg" alt="" loading="lazy" width="480" height="360"><span class="yt-play" aria-hidden="true"></span></button>
      <figcaption><b>${esc(v.title)}</b><span>${esc(v.channel)} · <a href="https://youtu.be/${esc(v.id)}" target="_blank" rel="noopener">YouTube에서 보기</a></span></figcaption></figure>`;

  // ── 그림 조각 ──
  // 흐름 그림(SVG, 폭 360 기준 세로 배치: 휴대폰에서도 글자가 줄어들지 않는다)
  const box = (x, y, w, h, title, sub, note, cls = '') => `<g class="rf-node ${cls}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="9"/><text x="${x + w / 2}" y="${y + 21}" text-anchor="middle" class="rf-t">${title}</text>${sub ? `<text x="${x + w / 2}" y="${y + 38}" text-anchor="middle" class="rf-s">${sub}</text>` : ''}${note ? `<text x="${x + w / 2}" y="${y + 54}" text-anchor="middle" class="rf-o"><tspan>✕ </tspan><tspan>${note}</tspan></text>` : ''}</g>`;
  const arr = (d, label, lx, ly, cls = '', anchor = 'middle') => `<path d="${d}" class="rf-e ${cls}" marker-end="url(#rfA)"/>${label ? `<text x="${lx}" y="${ly}" text-anchor="${anchor}" class="rf-l ${cls}">${label}</text>` : ''}`;
  const legend = '<p class="rf-legend"><span class="up">▲ 다음 라운드</span><span class="down">▼ 패자부활</span><span class="out">✕ 탈락</span><span class="goal">★ 챔피언십</span></p>';
  const svg = (h, label, body) => `<svg class="rf" viewBox="0 0 360 ${h}" role="img" aria-label="${label}"><defs><marker id="rfA" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6.5" markerHeight="6.5" orient="auto"><path d="M0 0 L8 4 L0 8 z" class="rf-ah"/></marker></defs>${body}</svg>`;
  const bracketFig = svg(372, '플레이오프와 챔피언십 진행 방식', `
    ${box(70, 8, 220, 48, '조별 리그', `${PO.teams}팀 · ${PO.groups}개 조`)}
    ${arr('M130 56 L92 102', '상위 20', 104, 84, 'up', 'end')}${arr('M230 56 L268 102', '하위 20', 258, 84, 'down', 'start')}
    ${box(10, 104, 160, 48, '승자 라운드', '20팀 · 6게임')}
    ${box(190, 104, 160, 62, '패자부활 1라운드', '20팀 · 6게임', '하위 10팀 탈락')}
    ${arr('M270 166 V204', '상위 10', 302, 190, 'up')}
    ${arr('M140 152 C140 186 214 172 222 204', '하위 10', 152, 190, 'down')}
    ${box(190, 206, 160, 62, '패자부활 2라운드', '20팀 · 6게임', '하위 10팀 탈락')}
    ${arr('M56 152 C56 250 104 250 108 304', '상위 10', 50, 240, 'up')}
    ${arr('M270 268 L246 304', '상위 10', 292, 292, 'up')}
    ${box(70, 306, 220, 56, '결승', '20팀 · 매치 포인트', '', 'final')}`);
  const lcqFig = svg(470, 'LCQ 진행 방식', `
    ${box(10, 8, 160, 48, '승자 1라운드 A', '20팀 · 6게임')}${box(190, 8, 160, 48, '승자 1라운드 B', '20팀 · 6게임')}
    ${arr('M76 56 V108', '상위 10씩', 68, 88, 'up', 'end')}${arr('M230 56 C230 86 132 80 128 108', '', 0, 0, 'up')}
    ${arr('M130 56 C130 86 228 80 232 108', '', 0, 0, 'down')}${arr('M284 56 V108', '하위 10씩', 292, 88, 'down', 'start')}
    ${box(10, 110, 160, 48, '승자 2라운드', '20팀 · 6게임')}
    ${box(190, 110, 160, 62, '패자부활 1라운드', '20팀 · 6게임', '하위 10팀 탈락')}
    ${arr('M270 172 V214', '상위 10', 302, 198, 'up')}
    ${arr('M140 158 C140 194 214 182 222 214', '하위 10', 152, 198, 'down')}
    ${box(190, 216, 160, 62, '패자부활 2라운드', '20팀 · 6게임', '하위 10팀 탈락')}
    ${arr('M56 158 C56 262 104 262 108 318', '상위 10', 50, 250, 'up')}
    ${arr('M270 278 L246 318', '상위 10', 292, 304, 'up')}
    ${box(70, 320, 220, 56, '결승', '20팀 · 매치 포인트', '', 'final')}
    ${arr('M180 376 V418', `상위 ${LQ.adv}팀`, 190, 402, 'up', 'start')}
    <g class="rf-node goal"><rect x="90" y="420" width="180" height="40" rx="9"/><text x="180" y="445" text-anchor="middle" class="rf-t"><tspan>★ </tspan><tspan>챔피언십 진출</tspan></text></g>`);

  // 막대: 순위 점수
  const place = (sc.game || []).map((x) => x[1]), top = place[0] || 12;
  const placeBars = `<div class="rb" role="img" aria-label="순위 점수 막대 그림">${place.map((p, i) => `<span class="rb-c"><i style="height:${Math.round((p / top) * 100)}%"><b>${p}</b></i><em>${i + 1}</em></span>`).join('')}<span class="rb-c zero"><i style="height:0"><b>0</b></i><em>${place.length + 1}–${B.lobby || 20}</em></span></div>`;
  // 두 줄 표: 순위별 포인트
  const rankTbl = (rows, n, last) => `<div class="tbl-wrap"><table class="tbl compact rk"><thead><tr><th>순위</th>${Array.from({ length: n }, (_, i) => `<th class="c">${i + 1}</th>`).join('')}${last ? `<th class="c">${last[0]}</th>` : ''}</tr></thead><tbody>${rows.map(([name, a, tail]) => `<tr><td>${name}</td>${a.slice(0, n).map((v) => `<td class="c num">${fmt(v)}</td>`).join('')}${last ? `<td class="c num">${tail}</td>` : ''}</tr>`).join('')}</tbody></table></div>`;
  // 시즌 흐름
  const stepTag = (k) => (/^s\dp[lo]$/.test(k) ? ['cp', 'CP 적립'] : k === 'lcq' ? ['slot', `마지막 ${CH.lcq}자리`] : k === 'champs' ? ['goal', '시즌 우승 결정'] : ['', '']);
  // 대회 사이 기간에는 다음 대회를 강조하고 D-day를 붙인다 (진행 중인 대회가 있으면 그쪽이 강조된다)
  const tlSt = S.timeline.map(tlState), nextI = tlSt.includes('now') ? -1 : tlSt.indexOf('next');
  const today = new Date(now()).toLocaleDateString('sv-SE', { timeZone: 'America/Los_Angeles' });
  const dDay = (e) => Math.round((Date.parse(e.start) - Date.parse(today)) / 864e5);
  const lcqE = S.timeline.find((e) => e.key === 'lcq'), lcqSt = lcqE ? tlState(lcqE) : '';
  const lcqSoon = lcqE && (lcqSt === 'now' || (lcqSt === 'next' && dDay(lcqE) <= 7)) ? stageHref(lcqE) || '#/standings' : null;
  const steps = `<ol class="rs">${S.timeline.map((e, i) => { const st = tlSt[i], h = stageHref(e), [tc, tt] = stepTag(e.key); return `<li class="${st}${i === nextI ? ' nx1' : ''}"><span class="rs-n">${i + 1}</span><span class="rs-b"><b>${h ? `<a href="${h}">${esc(e.name)}</a>` : esc(e.name)}</b><span class="rs-w">${e.start.slice(5).replace('-', '.')}–${e.end.slice(5).replace('-', '.')}${e.where ? ` · ${esc(e.where)}` : ''}</span><span class="rs-tags">${st === 'done' ? '<span class="tag">종료</span>' : st === 'now' ? '<span class="tag live">진행 중</span>' : i === nextI ? `<span class="tag nxt">${dDay(e) > 0 ? `다음 · D-${dDay(e)}` : '다음'}</span>` : ''}${tt ? `<span class="tag ${tc}">${tt}</span>` : ''}${e.url ? `<span class="rs-o">${olink(e.url, '공식 페이지')}</span>` : ''}</span></span></li>`; }).join('')}</ol>`;
  // 40팀 막대
  const slotBar = `<div class="sb" role="img" aria-label="챔피언십 ${CH.teams}팀 구성"><span class="sb-a" style="flex:${CH.direct}"><b>${CH.direct}</b><em>CP 순위로 직행</em></span><span class="sb-b" style="flex:${CH.lcq}"><b>${CH.lcq}</b><em>LCQ</em></span></div><p class="caption">챔피언십 ${CH.teams}팀 = CP 상위 ${CH.direct}팀 + LCQ ${CH.lcq}팀 (지역마다 ${CH.per}팀)</p>`;
  // 팀 CP 예시 (결과 가리기 중에는 숨김)
  const exRow = !opt.spoiler && (A.cp.find((r) => r.short === focusList()[0]?.short && r.players?.length >= 3) || A.cp.find((r) => r.players?.length >= 3));
  const exPs = exRow ? exRow.players.slice().sort((a, b) => b[1] - a[1]) : [];
  const cpSum = exRow ? `<div class="cs"><span class="cs-h">예: ${esc(exRow.name)}</span><div class="cs-r">${exPs.slice(0, 3).map((p, i) => `${i ? '<i>+</i>' : ''}<span class="cs-p"><b>${fmt(p[1])}</b><em>${esc(p[0])}</em></span>`).join('')}<i>=</i><span class="cs-p sum"><b>${fmt(exPs.slice(0, 3).reduce((a, p) => a + p[1], 0))}</b><em>팀 CP</em></span></div>${exPs.length > 3 ? `<p class="caption">네 번째 선수부터는 더하지 않습니다.</p>` : ''}</div>` : '';
  // 매치 포인트 그림
  const mpFig = `<div class="mpg" role="img" aria-label="매치 포인트 진행 그림"><div class="mpg-bar"><span class="mpg-fill"></span><span class="mpg-line"><b>${mp}점</b></span></div><ol class="mpg-steps"><li><b>1</b><span>게임을 거듭하며 점수를 쌓습니다</span></li><li><b>2</b><span>${mp}점을 넘기면 매치 포인트</span></li><li><b>3</b><span>그다음 게임부터 1위를 하면 우승</span></li></ol></div>`;
  const fact = (big, unit, label) => `<div class="rk-f"><b>${big}<small${unit === '팀' ? ' data-tr="팀(단위)"' : ''}>${unit}</small></b><span>${label}</span></div>`;
  const card = (k, title, body, cls = '') => sv !== 'all' && k !== sv ? '' : `<section class="sec rule-card ${cls}" data-k="${k}"><h2 class="h2">${title}</h2>${body}</section>`;
  const P = B.prize;

  const html = `<h1 class="title">규칙</h1>
    <p class="lead">ALGS를 처음 보는 사람도 경기를 따라갈 수 있도록 핵심만 그림으로 모았습니다. 자세한 기준은 맨 아래 공식 규정이 우선합니다.</p>
    ${A.meta?.cfgMine === false ? '<p class="board-note now">점수표와 진행 방식 설명은 지난 시즌 규정 기준입니다. 새 시즌 규정이 확인되면 바뀝니다.</p>' : ''}
    ${sv === 'all' ? `<div class="rk-facts">${fact(B.lobby || 20, '팀', '한 게임에 함께 뛰는 팀')}${fact(PL.games, '게임', '한 시리즈 (점수 합산)')}${fact(mp, '점', '결승의 매치 포인트 기준')}${fact(CH.teams, '팀', '챔피언십에 나가는 팀')}</div>` : ''}
    ${vids.length && (sv === 'all' || sv === 'video') ? `<section class="sec" aria-labelledby="h-vid"><h2 class="h2" id="h-vid">영상으로 보기</h2><div class="vid-grid">${vids.map(vid).join('')}</div></section>` : ''}
    <div class="rules-grid">
    ${card('basic', '처음이라면: 이 말만 알면 됩니다', `<dl class="gl">${[
      ['로비', `한 게임에 함께 뛰는 ${B.lobby || 20}팀 묶음입니다.`],
      ['시리즈', `같은 로비가 보통 ${PL.games}게임을 치르고 점수를 더해 순위를 정합니다.`],
      ['링', '시간이 지나면 좁아지는 안전 구역입니다. 밖에 있으면 체력이 줄어, 결국 모든 팀이 한곳에서 싸웁니다.'],
      ['POI', '팀마다 정해 둔 맵의 낙하 지점입니다. 경기 전 드래프트로 고릅니다.'],
      ['매치 포인트 (MP)', `결승에서 ${mp}점을 넘긴 상태입니다. 그다음 게임에서 1위를 하면 우승합니다.`],
      ['CP', '챔피언십 포인트입니다. 선수 개인이 받고, 상위 3명의 합이 팀 CP입니다.'],
      ['패자부활', '한 번 밀려도 다시 결승에 오를 수 있는 길입니다. 하위 10팀은 탈락합니다.'],
      ['시드', '대진을 짤 때 쓰는 순번입니다. LCQ 시드는 CP 순서로 정해집니다.'],
    ].map(([dt, dd]) => `<div><dt>${dt}</dt><dd>${dd}</dd></div>`).join('')}</dl>`, 'wide')}
    ${card('format', '한 시즌의 흐름', `
      <p>지역 프로리그에서 성적을 내 플레이오프(국제전)에 나가고, 네 대회에서 모은 챔피언십 포인트(CP)로 챔피언십 출전이 정해집니다.</p>
      ${steps}${slotBar}`, 'wide')}
    ${card('points', '게임 점수', `
      <div class="rc-2"><div>
      <p class="rk-eq"><span>한 게임 점수</span><i>=</i><span>순위 점수</span><i>+</i><span>킬 1점씩</span></p>
      <p>한 시리즈는 보통 ${PL.games}게임이고, 게임 점수를 모두 더해 시리즈 순위를 정합니다.</p>
      <p class="rk-ex"><span>예: 3위로 끝내고 5킬</span> <b>${place[2] ?? 7} + 5 = ${(place[2] ?? 7) + 5}점</b></p>
      <p class="caption"><span>이 사이트의 점수표는 모두 순위 / 킬 / 종합(순위 점수 / 킬 점수 / 종합 점수) 순서로 적습니다.</span> <span>등수는 # 칸입니다.</span></p>
      </div><figure class="rfig">${placeBars}<figcaption>게임 순위별 순위 점수</figcaption></figure></div>`, 'wide')}
    ${card('format', '매치 포인트', `
      <div class="rc-2"><div>
      <p>결승은 정해진 게임 수가 없습니다. ${mp}점을 넘긴 팀이 그다음 게임부터 1위(챔피언)를 하면 그 자리에서 우승입니다.</p>
      <p class="caption"><span>매치 포인트 팀이 1위를 못 하면 게임이 계속됩니다.</span> <span>나머지 순위는 결승 점수 합계 순입니다.</span></p>
      <p class="caption">경기 화면의 <span class="tag mpe">MP</span>는 매치 포인트 도달, <span class="tag mpe">우승</span>은 우승을 뜻합니다.</p>
      </div>${mpFig}</div>`, 'wide')}
    ${card('format', '프로리그', `
      <div class="rc-2"><div>
      <div class="grp" role="img" aria-label="프로리그 조 구성">${['A', 'B', 'C'].slice(0, PL.groups).map((g) => `<span class="grp-g"><b>${g}조</b><em>${PL.size}팀</em></span>`).join('<i>×</i>')}<i>→</i><span class="grp-g rf-go"><b>리전 결승</b><em>상위 ${PL.rf}팀</em></span></div>
      <p>지역마다 ${PL.teams}팀이 ${PL.groups}개 조로 나뉩니다. 두 조씩 만나 ${PL.games}게임 시리즈를 치르고, 팀마다 시리즈를 ${PL.series}번 뜁니다.</p>
      <p>시리즈 순위마다 프로리그 포인트를 받고, 상위 ${PL.rf}팀이 매치 포인트 방식의 리전 결승에 나갑니다.</p>
      </div><div>
      ${rankTbl([['정규 시리즈', sc.plRegular], ['리전 결승', sc.plFinals]], 10)}
      <p class="caption">11위부터는 1~2점씩 줄어 20위는 0점입니다. 포인트 합계 상위 팀과 리전 결승 우승팀이 플레이오프에 갑니다.</p>
      </div></div>`, 'wide')}
    ${card('format', '플레이오프·챔피언십', `
      <div class="rc-2"><div>
      <p>${PO.teams}팀이 조별 리그를 치른 뒤 승자조와 패자조로 갈립니다.</p>
      <ul><li>조별 리그 상위 20팀은 승자 라운드, 하위 20팀은 패자부활 1라운드로 갑니다.</li>
      <li>승자 라운드 상위 10팀은 결승에 직행합니다.</li>
      <li>패자부활 라운드는 하위 10팀이 탈락하고, 2라운드 상위 10팀이 결승에 합류합니다.</li>
      <li>결승 20팀이 매치 포인트 방식으로 우승을 가립니다.</li></ul>
      ${PO.s1 ? `<p class="caption">Split 1 플레이오프만 방식이 다릅니다. 조별 리그 상위 ${PO.s1.finals}팀이 결승에 직행하고, 다음 ${PO.s1.survivor}팀이 서바이버 스테이지(${PO.s1.games}게임)에서 남은 ${PO.s1.up}자리를 겨룹니다.</p>` : ''}
      <p class="lead"><a href="#/standings">순위 탭</a>에서 지금 진행 상황을 승자조·패자조로 볼 수 있습니다.</p>
      </div><figure class="rfig">${bracketFig}${legend}<figcaption>Split 2 플레이오프·챔피언십 진행 방식</figcaption></figure></div>`, 'wide')}
    ${card('format', 'LCQ (Last Chance Qualifier)', `
      <div class="rc-2"><div>
      <p>챔피언십에 직행하지 못한 프로리그 팀과 2부(챌린저 서킷) 상위 팀이 지역마다 ${LQ.teams}팀씩 나와, 지역별 ${LQ.adv}자리를 겨루는 마지막 기회입니다.</p>
      <ul><li>시드 순서대로 지그재그로 나눠 승자 1라운드 A·B를 치릅니다.</li>
      <li>로비마다 상위 10팀은 승자 2라운드, 하위 10팀은 패자부활 1라운드로 갑니다.</li>
      <li>이후는 플레이오프와 같습니다. 결승 상위 ${LQ.adv}팀이 챔피언십에 갑니다.</li>
      <li>시드는 CP 순서입니다. 선수를 바꿔도 시드는 올라가지 않습니다.</li></ul>
      ${lcqSoon ? `<div class="now-box"><span class="tag ${lcqSt === 'now' ? 'live' : 'nxt'}">${lcqSt === 'now' ? '진행 중' : '이번 주'}</span><b>LCQ ${lcqE.start.slice(5).replace('-', '.')} – ${lcqE.end.slice(5).replace('-', '.')}</b><a class="go" href="${lcqSoon}">LCQ 경기 보기</a></div>` : ''}
      </div><figure class="rfig">${lcqFig}${legend}<figcaption>지역별 LCQ 진행 방식</figcaption></figure></div>`, 'wide')}
    ${card('points', '챔피언십 포인트 (CP)', `
      <div class="rc-2"><div>
      <p>CP는 선수 개인이 받습니다. 팀 CP는 로스터에서 CP가 높은 선수 3명의 합입니다.</p>
      ${cpSum}
      <ul><li>프로리그와 플레이오프, 네 대회의 최종 순위로 받습니다.</li>
      <li>프로리그는 ${B.cpMin || 12}게임 이상 뛴 선수만 받습니다.</li>
      <li>Split ${tieN()} 플레이오프가 끝난 시점의 CP 상위 ${CH.direct}팀이 챔피언십에 직행합니다. 그 뒤의 이적은 직행 여부를 바꾸지 않습니다.</li></ul>
      </div><div>
      ${rankTbl([['프로리그', sc.cpProLeague], ['플레이오프', sc.cpPlayoffs]], 8)}
      <p class="caption">선수 1명이 받는 CP입니다. 3명이 함께 받으면 팀 CP는 3배가 됩니다.</p>
      <p class="caption">CP가 같으면 ① Split ${tieN()} 플레이오프 최종 순위 ② 프로리그 Split ${lastSplit()} 최종 순위 ③ 프로리그 Split ${lastSplit()} 세부 기준 순으로 가립니다 (공식 규정 C7.3).</p>
      <p class="lead"><a href="#/points/cp">포인트 탭</a>에서 현재 순위를 볼 수 있습니다.</p>
      </div></div>`, 'wide')}
    ${P ? card('points', '상금', `
      <div class="pz"><div class="pz-main"><span>챔피언십 총상금</span><b>${usd(P.champs[0])}</b></div>
      <ol class="pz-top">${P.champs.slice(1).map((v, i) => `<li><span>${i === 0 ? '우승' : i === 1 ? '준우승' : '3위'}</span><b>${usd(v)}</b></li>`).join('')}</ol></div>
      <p class="caption">플레이오프는 대회마다 총상금 ${usd(P.po[0])}(우승 ${usd(P.po[1])}), 프로리그는 Split마다 네 지역 합계 ${usd(P.pl)}입니다.</p>`) : ''}
    ${card('format', '레전드 밴 · POI 드래프트', `
      <p>경기 전 일부 레전드를 쓸 수 없게 막는 레전드 밴과, 팀마다 맵의 낙하 지점(POI)을 순서대로 골라 가져가는 POI 드래프트가 있습니다. 진행 방식은 위 영상에서 1분 만에 볼 수 있습니다.</p>
      ${lcqSoon ? `<p><a class="more" href="${lcqSoon}">LCQ 경기 화면에서 POI 드래프트 지도 보기</a></p>` : ''}`)}
    </div>
    <section class="sec"><h2 class="h2">공식 규정과 참고 자료</h2><div class="chips" style="margin-top:10px">${(S.rulesLinks || []).map(([n, u]) => `<a class="chip" href="${esc(u)}" target="_blank" rel="noopener">${esc(n)}</a>`).join('')}</div></section>`;
  return html;
}

/* ---------- 방송 ---------- */
const PLAT = { twitch: 'Twitch', chzzk: 'CHZZK', youtube: 'YouTube', soop: 'SOOP' };
const chip = (p, url) => url ? `<a class="chip ${p}" href="${esc(url)}" target="_blank" rel="noopener"><i></i>${PLAT[p]}</a>` : '';
// CHZZK·YouTube는 확인된 채널이 없으면 이름 검색 링크를 대신 보여 준다 (채널 주소를 추측해 만들지 않음)
const FIND = {
  chzzk: (n) => `https://chzzk.naver.com/search?query=${encodeURIComponent(n)}`,
  youtube: (n) => `https://www.youtube.com/results?search_query=${encodeURIComponent(n + ' 에이펙스')}`,
};
const findChip = (p, name) => `<a class="chip ${p} find" href="${esc(FIND[p](name))}" target="_blank" rel="noopener" title="확인된 채널이 없어 ${PLAT[p]}에서 이름으로 검색합니다"><i></i>${PLAT[p]} 검색</a>`;
// 한국 스트리머·전 프로 (대회 선수 아님): 이름, 구분, 소속, 채널. Apex 방송 중이면 LIVE
// 방송 탭의 한 줄 행 목록용 작은 칩: YouTube 는 'YT', 확인된 채널이 없으면 점선 + '?'(이름 검색)
const rowLabel = (k) => (k === 'youtube' ? 'YT' : PLAT[k]);
const rowChip = (k, url) => (url ? `<a class="chip ${k}" href="${esc(url)}" target="_blank" rel="noopener" title="${PLAT[k]}"><i></i>${rowLabel(k)}</a>` : '');
const rowFind = (k, name) => `<a class="chip ${k} find" href="${esc(FIND[k](name))}" target="_blank" rel="noopener" title="확인된 채널이 없어 ${PLAT[k]}에서 이름으로 검색합니다"><i></i>${rowLabel(k)}?</a>`;
const creatorLive = (c) => (ST?.live || []).find((x) => x.kind === 'creator' && x.who === c.name);
const creatorRow = (c) => { const l = creatorLive(c); return `<div class="pl-row"><span class="nm"><b>${esc(c.name)}</b>${l ? ` <a class="tag live" href="${playHref(l)}"${l.embed ? '' : ' target="_blank" rel="noopener"'} aria-label="${esc(c.name)} 방송 중, 방송 보기">LIVE</a>` : ''}<small><span>${c.kind === 'expro' ? '전 프로' : '스트리머'}</span>${c.org ? ` · ${esc(c.org)}` : ''}</small></span><span class="chips">${PLATFORM_KEYS.filter((k) => c.links[k]).map((k) => rowChip(k, c.links[k])).join('')}</span></div>`; };
const PLATFORM_KEYS = ['twitch', 'chzzk', 'youtube', 'soop'];
// 방송 탭 '선수·코치 방송' 한 줄 행 (팀·선수 화면은 아래 streamRow 를 그대로 쓴다)
const playerRow = (p) => `<div class="pl-row"><span class="nm"><span class="krdot ${p.role === 'coach' ? 'k-coach' : 'k-team'}"></span>${playerLink(p.name)}${p.mix ? '<sup class="mix">계</sup>' : ''}${liveTag(p.name, p.team)}<small>${teamLink(p.team)}${p.role === 'coach' ? ', 코치' : ''}</small></span><span class="chips">${['twitch', 'soop'].map((k) => rowChip(k, p.links[k])).join('')}${['chzzk', 'youtube'].map((k) => (p.links[k] ? rowChip(k, p.links[k]) : rowFind(k, p.name))).join('')}</span></div>`;
const streamRow = (p) => `<div class="pl-row"><span class="nm"><span class="krdot ${p.role === 'coach' ? 'k-coach' : 'k-team'}"></span>${playerLink(p.name)}${p.mix ? '<sup class="mix">계</sup>' : ''}${liveTag(p.name, p.team)}<small>${teamLink(p.team)}${p.role === 'coach' ? ', 코치' : ''}</small></span><span class="chips">${['twitch', 'soop'].map((k) => chip(k, p.links[k])).join('')}${['chzzk', 'youtube'].map((k) => (p.links[k] ? chip(k, p.links[k]) : findChip(k, p.name))).join('')}</span></div>`;
/* ---------- 방송 상태 (worker/streams → C.streamsUrl) ---------- */
// ST = { at, ok, live: [...], videos: [...] } | null(아직 못 받음). 60초마다 다시 받는다(화면이 보일 때만)
let ST = null, stSig = '', stOSig = '';
const vidSeen0 = store.get('vidSeen', null); // 이번 방문 전에 방송 탭을 마지막으로 본 시각 (새 영상 표시 기준)
// 내가 별표(응원)한 팀인지 (보기 모드와 상관없이)
const starred = (short) => { const t = team(short); return !!t && opt.fav.includes(t.id); };
// 해외 선수 방송(l.intl: 전 팀 선수의 Twitch)은 별표한 팀·관심 팀 선수만 카드로 보여 준다. 나머지는 방송 탭 아래 목록과 팀·선수 화면의 LIVE 표시로
// 스트리머·전 프로가 Apex가 아닌 게임을 방송 중인가 (방송 탭에는 게임 이름과 함께 보이고, 홈에는 올리지 않는다)
// 대전제: 선수·코치·스트리머의 방송은 Apex를 하고 있을 때만 '방송 중'으로 친다.
//   Twitch·치지직은 방송에 붙은 게임(카테고리)으로 판단한다. YouTube는 게임 표시를 알 수 없어, 선수 채널은 그대로 두고 스트리머 채널만 서버가 제목·태그로 거른다.
const APEX_RE = /apex|에이펙스|에펙|エーペックス/i;
const apexLive = (l) => !(l.kind === 'player' || l.kind === 'creator') || l.platform === 'youtube' || APEX_RE.test(l.game || '');
const setStreams = (j) => { ST = { ...j, live: (j.live || []).filter(apexLive) }; };
// 카드로 보여 줄 방송: 선수·코치는 지금 고른 보기(한국 관련 / 지역 / 내 응원 팀)에 드는 팀과 별표한 팀만. 스트리머·전 프로, 공식 중계·파트너는 보기와 상관없이 항상
// 보기에 따라 카드로 보여 줄 방송 (나머지는 방송 탭의 접힌 '그 밖의 방송' 목록):
//   한국 관련  : 한국 선수·코치(한국 국적·한국계) + 한국 스트리머·전 프로 / 대회 때는 영어·일본어 공식 중계 + 한국 관련 팀의 공식 팀 화면
//   APAC North: APAC North 팀 선수 / 대회 때는 일본어 공식 중계 + APAC North 팀의 공식 팀 화면
//   내 응원 팀 : 고른 팀 선수 / 대회 때는 영어·일본어 공식 중계 + 고른 팀의 공식 팀 화면
// 공식 중계와 공식 팀 화면은 대회 때만 켜지므로 따로 '대회 중' 판단은 하지 않는다
const flatName = (x) => String(x || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
let POV_IX = null, POV_SRC = null;
function povTeam(l) { // 공식 팀 화면의 제목 속 팀 이름 → 팀 약칭
  if (POV_SRC !== A) { POV_SRC = A; POV_IX = new Map(); for (const t of [...Object.values(A.xteams || {}), ...Object.values(A.teams)]) for (const n of [t.name, t.was, t.short]) if (n) POV_IX.set(flatName(n), t.short); }
  return POV_IX.get(flatName(l.pov)) || null;
}
const liveTeam = (l) => (l.kind === 'pov' ? povTeam(l) : l.team);
const inFocus = (short) => !!team(short) && isF(short);
// 공식 중계 카드: 지역 보기는 그 지역 중계(APAC North 는 일본어, APAC South 는 영어 + Battlegrounds HQ, 나머지는 영어)
//   한국 관련·내 응원 팀 보기는 영어·일본어 공식 중계. APAC South 중계는 응원 팀(대표 팀)이 APAC South 팀일 때만 함께 (그 밖에는 '그 밖의 방송'으로)
const OFFICIAL_BY_REGION = { 'apac-n': ['o:ja', 'o:escl'], 'apac-s': ['o:en', 'o:aps'] };
// 대회 기간에만 보이는 채널(broadcasts 의 when: 지역): 그 지역 경기가 있는 대회마다 첫 경기 시작 시각부터 마지막 경기 12시간 뒤까지
function regionEventOn(region) {
  const by = new Map();
  for (const s of A.series) if (s.region === region && s.start) { const g = by.get(s.event); by.set(s.event, g ? [s.start < g[0] ? s.start : g[0], s.start > g[1] ? s.start : g[1]] : [s.start, s.start]); }
  const t = now(); return [...by.values()].some(([a, b]) => t >= Date.parse(a) && t <= Date.parse(b) + 432e5);
}
const bcOn = (b) => !b.when || regionEventOn(b.when);
const bcOffKeys = () => new Set((A.streams.broadcasts || []).filter((b) => !bcOn(b)).map((b) => `o:${b.key}`));
function officialShown(key) {
  const r = ML().region;
  if (r) return (OFFICIAL_BY_REGION[r] || ['o:en']).includes(key);
  if (key !== 'o:aps') return true;
  return opt.mode === 'custom' ? Object.values(A.teams).some((t) => opt.fav.includes(t.id) && t.region === 'apac-s') : mainTeam()?.region === 'apac-s';
}
// 같은 공식 중계가 Twitch·YouTube 에서 함께 켜지면 카드 하나로 묶는다. 카드 아래 버튼으로 볼 곳을 고르고(이 브라우저에 저장),
//   고른 적이 없으면 시청자가 많은 쪽(같으면 Twitch). 고르지 않은 쪽은 목록·'그 밖의 방송'·배지 수에서 빠진다
const bcPick = (key) => store.get('bcPlat', {})[key];
// 같은 채널이 같은 플랫폼에서 방송을 둘 이상 켜면(예: ESCL 이 LCQ 로비 A·B 를 YouTube 두 곳에서) 영상 ID 로 구분한다.
//   하나뿐이면 예전처럼 플랫폼 이름만 쓴다(재생 주소 'key|youtube' 가 그대로 열리도록)
let DUP_SRC = null, DUP = new Set();
function liveVar(l) {
  if (DUP_SRC !== ST?.live) { DUP_SRC = ST?.live; DUP = new Set(); const seen = new Set(); for (const x of DUP_SRC || []) { const k = `${x.key}|${x.platform}`; if (seen.has(k)) DUP.add(k); seen.add(k); } }
  return l.platform === 'youtube' && l.embed?.id && DUP.has(`${l.key}|youtube`) ? `youtube:${l.embed.id}` : l.platform;
}
// 같은 플랫폼 방송끼리 구분하는 짧은 이름: 제목의 로비·그룹(LOBBY A, Group B, ロビーA …), 없으면 제목에서 서로 다른 토막, 그것도 없으면 번호
function altTag(l, g) {
  const same = g.filter((y) => y.platform === l.platform); if (same.length < 2) return '';
  const lob = (x) => { const t = x.title || '', m = t.match(/\b(lobby|group|grp)\s*[-#:]?\s*([A-Z0-9]{1,2})\b/i) || t.match(/(ロビー|グループ|로비|그룹)\s*([A-Z0-9Ａ-Ｚ０-９]{1,2})/i); return m ? [/^(lobby|ロビー|로비)$/i.test(m[1]) ? '로비' : '그룹', m[2].normalize('NFKC').toUpperCase()] : null; };
  const tags = same.map(lob);
  if (tags.every(Boolean) && new Set(tags.map((x) => x.join(' '))).size === same.length) { const [w, v] = tags[same.indexOf(l)]; return `<span>${w}</span> ${esc(v)}`; }
  const segs = same.map((x) => String(x.title || '').split(/\s*[|｜/／]\s*/).filter(Boolean));
  for (let i = 0; i < Math.max(...segs.map((s) => s.length)); i++) {
    const v = segs.map((s) => s[i] || ''); if (v.every(Boolean) && new Set(v).size === same.length) { const t = v[same.indexOf(l)]; return esc(t.length > 18 ? `${t.slice(0, 17)}…` : t); }
  }
  return String(same.indexOf(l) + 1);
}
function liveAll() {
  const off = bcOffKeys(), L = (ST?.live || []).filter((l) => !(l.kind === 'official' && off.has(l.key))), G = new Map();
  for (const l of L) if (l.kind === 'official' && l.embed) G.set(l.key, [...(G.get(l.key) || []), l]);
  const out = [];
  for (const l of L) {
    const g = l.kind === 'official' && l.embed ? G.get(l.key) : null;
    if (!g || g.length < 2) { out.push(l); continue; }
    const pick = g.find((x) => liveVar(x) === bcPick(l.key)) || g.slice().sort((a, b) => (b.viewers ?? -1) - (a.viewers ?? -1) || (a.platform !== 'twitch') - (b.platform !== 'twitch'))[0];
    if (l === pick) out.push({ ...l, alts: g.slice().sort((a, b) => a.platform.localeCompare(b.platform) || String(a.title || '').localeCompare(String(b.title || ''))) });
  }
  return out;
}
// 볼 곳을 바꾸면: 그 중계를 플레이어로 보고 있었으면 고른 쪽으로 바꿔 틀고, 카드를 다시 그린다
function pickPlat(key, plat) {
  const old = liveAll().find((l) => l.key === key && l.alts); if (!old || liveVar(old) === plat) return;
  store.set('bcPlat', { ...store.get('bcPlat', {}), [key]: plat });
  const oid = liveId(old), nid = `${key}|${plat}`, tiles = lvBox()?.querySelector('.lv-tiles');
  const tile = tiles && [...tiles.children].find((t) => t.dataset.id === oid);
  if (tile) { const mv = mvOn; tile.remove(); mvOn = tiles.children.length > 0; playLive(nid); mvOn = mv; lvSync(); }
  if (parseHash().q.get('play') === oid) history.replaceState(null, '', `#/streams?play=${encodeURIComponent(nid)}`);
  if (!patchLive()) render();
}
function liveShown(l) {
  if (liveId(l) === parseHash().q.get('play')) return true;
  if (l.kind === 'official') return officialShown(l.key);
  if (l.kind === 'pov') return !l.map && inFocus(povTeam(l));
  if (l.kind === 'creator') return !ML().region && opt.mode !== 'custom';
  if (l.kind === 'player') return ML().region || opt.mode === 'custom' || (l.team && team(l.team)?.id === mainId()) ? inFocus(l.team) : !l.intl;
  return false; // 공식 파트너 등
}
const liveRank = (l) => ({ official: 0, pov: 1, player: 2, creator: 3 }[l.kind] ?? 4); // 공식 중계 → 공식 팀 화면 → 선수·코치 → 스트리머·전 프로
const liveList = () => liveAll().filter(liveShown).sort((a, b) => liveRank(a) - liveRank(b) || (b.viewers ?? 0) - (a.viewers ?? 0));
const liveOf = (name, short) => (ST?.live || []).find((l) => l.kind === 'player' && l.who.toLowerCase() === String(name).toLowerCase() && (!short || !l.team || l.team === short));
const playHref = (l) => (l.embed ? `#/streams?play=${encodeURIComponent(liveId(l))}` : esc(l.url));
// 이름 옆 LIVE 표시: 누르면 그 방송으로
const liveTag = (name, short) => { const l = liveOf(name, short); return l ? ` <a class="tag live" href="${playHref(l)}"${l.embed ? '' : ' target="_blank" rel="noopener"'} aria-label="${esc(name)} 방송 중, 방송 보기">LIVE</a>` : ''; };
// 팀·선수 화면 맨 위: 그 팀(선수)이 방송 중이면 카드로
const liveFor = (pick) => { const L = (ST?.live || []).filter((l) => (l.kind === 'player' && pick(l)) || (l.kind === 'pov' && !l.map && pick({ ...l, team: povTeam(l), who: '' }))).sort((a, b) => (b.viewers ?? 0) - (a.viewers ?? 0)); return L.length ? `<section class="sec lv lv-home"><h2 class="h2">지금 방송 중 <small class="muted">${L.length}</small></h2><div class="lv-grid">${L.slice(0, 6).map((l, i) => liveCard(l, i, true)).join('')}</div></section>` : ''; };
// 진행 중인 경기 옆 '중계 보기': 공식 중계가 켜져 있으면 그 방송을 방송 탭에서 바로 열고, 켜진 중계를 못 찾으면 공식 중계 채널 목록으로
const officialLive = () => { const L = liveAll().filter((l) => l.kind === 'official'); const pref = I.lang === 'ja' ? 'o:ja' : 'o:en'; return L.find((l) => l.key === pref && l.embed) || L.find((l) => l.embed) || L[0] || null; };
const watchBtn = () => { if (!C.streamsUrl) return ''; const l = officialLive(); return l ? ` <a class="watch" href="${playHref(l)}"${l.embed ? '' : ' target="_blank" rel="noopener"'}>중계 보기</a>` : ' <a class="watch off" href="#/streams?s=official">중계 채널</a>'; };
const newVideos = () => (ST?.videos || []).filter((v) => !v.short && v.platform !== 'twitch' && vidSeen0 && Date.parse(v.published) > vidSeen0);
const sinceTxt = (iso) => { if (!iso) return ''; const m = Math.max(0, Math.round((now() - new Date(iso)) / 60000)); return m < 60 ? `${m}분째` : `${Math.floor(m / 60)}시간 ${m % 60}분째`; };
const liveWho = (l) => (l.kind === 'pov' ? `${esc(xteam(povTeam(l))?.name || l.who)} <small>팀 화면</small>` : l.kind === 'player' && team(l.team) ? `${esc(l.who)} <small>${esc(l.team)}</small>` : esc(l.who));
const livePlayerSrc = (e, muted) => (e.type === 'twitch' ? `https://player.twitch.tv/?channel=${encodeURIComponent(e.channel)}&parent=${encodeURIComponent(location.hostname)}&autoplay=true${muted ? '&muted=true' : ''}` : `https://www.youtube-nocookie.com/embed/${encodeURIComponent(e.id)}?autoplay=1&rel=0${muted ? '&mute=1' : ''}`); // 두 번째 화면부터는 소리를 끄고 시작한다(소리가 겹치지 않게)
const liveId = (l) => `${l.key}|${liveVar(l)}`;
// ── 사이트 안 플레이어 ──
//   멀티뷰: 켜면 카드를 누를 때마다 화면이 추가된다(최대 4개, 다시 누르면 빠진다). 끄면 누른 방송 하나로 바뀐다
//   시네마 모드: 플레이어가 브라우저 창 전체를 채운다(Esc 또는 버튼으로 나온다)
const MV_MAX = 4;
let mvOn = false;
const lvBox = () => document.getElementById('lvPlayer');
const lvIds = () => [...(lvBox()?.querySelectorAll('.lv-tile') || [])].map((t) => t.dataset.id);
function lvSync() {
  const box = lvBox(); if (!box) return;
  const ids = lvIds();
  if (ids.length !== 1) lvMini(false); // 미니 플레이어는 한 화면일 때만
  if (!ids.length) { lvIO?.disconnect(); lvIO = null; lvCinema(false); box.innerHTML = ''; box.hidden = true; mvOn = false; if (parseHash().q.has('play')) history.replaceState(null, '', '#/streams'); } // 닫은 뒤 새로고침 때 다시 열리지 않게
  else { box.querySelector('.lv-tiles').dataset.n = ids.length; box.querySelector('[data-mv]').setAttribute('aria-pressed', String(mvOn)); box.classList.toggle('multi', ids.length > 1); }
  document.querySelectorAll('#app button.lv-card, #app button.lv-add').forEach((c) => c.classList.toggle('on', ids.includes(c.dataset.lvid)));
}
function lvCinema(on) {
  const box = lvBox(); if (!box) return;
  if (on) lvMini(false);
  box.classList.toggle('cinema', on); document.documentElement.classList.toggle('lv-cinema', on);
  const b = box.querySelector('[data-cinema]'); if (b) { b.setAttribute('aria-pressed', String(on)); b.textContent = on ? '시네마 모드 끝내기' : '시네마 모드'; I.tree(b); }
}
// 미니 플레이어(휴대폰·태블릿): 한 화면만 볼 때 플레이어 자리가 화면 위로 지나가면 오른쪽 아래에 작게 띄운다.
//   iframe 을 옮기지 않고 CSS(position: fixed)만 바꿔서 방송이 끊기지 않는다. 자리(.lv-slot)는 높이를 남겨 두어 화면이 튀지 않게 한다
let lvIO = null;
const MINI_MQ = '(max-width: 899px)';
function lvMini(on) {
  const box = lvBox(), slot = box?.parentElement; if (!box || !slot?.classList.contains('lv-slot')) return;
  on = !!on && !box.hidden && lvIds().length === 1 && !box.classList.contains('cinema') && matchMedia(MINI_MQ).matches;
  if (on === box.classList.contains('mini')) return;
  slot.style.minHeight = on ? `${box.offsetHeight}px` : '';
  box.classList.toggle('mini', on);
}
function lvWatch(box) {
  lvIO?.disconnect(); lvIO = null;
  const slot = box.parentElement; if (!slot?.classList.contains('lv-slot') || !('IntersectionObserver' in window)) return;
  const top = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--stick')) || 0;
  lvIO = new IntersectionObserver(([e]) => lvMini(!e.isIntersecting && e.boundingClientRect.top < top), { rootMargin: `-${Math.round(top)}px 0px 0px 0px` });
  lvIO.observe(slot);
}
function lvBig() { // 미니 플레이어 → 원래 자리로
  const box = lvBox(); if (!box) return; const slot = box.parentElement;
  lvMini(false);
  const top = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--stick')) || 0;
  window.scrollTo({ top: slot.getBoundingClientRect().top + scrollY - top - 8, behavior: motionOK() ? 'smooth' : 'auto' });
}
function playLive(id) {
  const L = ST?.live || [], l = L.find((x) => liveId(x) === id) || L.find((x) => `${x.key}|${x.platform}` === id), box = lvBox(); if (!l?.embed || !box) return; // 뒤쪽: 예전 재생 주소(같은 플랫폼 방송이 하나였을 때)
  id = liveId(l);
  const tag = altTag(l, L.filter((x) => x.key === l.key));
  if (!box.querySelector('.lv-tiles')) {
    box.hidden = false;
    box.innerHTML = `<div class="lv-bar"><b>방송 보기</b><span class="lv-tools"><button class="lv-btn" type="button" data-mv aria-pressed="false" title="켜면 방송 카드를 누를 때마다 화면이 추가됩니다 (최대 4개)">멀티뷰</button><button class="lv-btn" type="button" data-cinema aria-pressed="false">시네마 모드</button><button class="lv-close" type="button" data-close-all aria-label="플레이어 닫기">닫기</button></span></div>
      <div class="lv-tiles" data-n="0"></div>
      <p class="caption"><span>멀티뷰를 켜고 아래 방송 카드를 누르면 화면이 추가됩니다(최대 4개).</span> <span>선수 개인 방송은 대회 규정상 지연이 걸려 있어, 이 사이트의 점수가 방송보다 먼저 바뀔 수 있습니다.</span></p>`;
    box.querySelector('[data-mv]').addEventListener('click', () => { mvOn = !mvOn; lvSync(); });
    box.querySelector('[data-cinema]').addEventListener('click', () => lvCinema(!box.classList.contains('cinema')));
    box.querySelector('[data-close-all]').addEventListener('click', () => { box.querySelector('.lv-tiles').innerHTML = ''; lvSync(); });
    I.tree(box); lvWatch(box);
  }
  const tiles = box.querySelector('.lv-tiles'), have = [...tiles.children].find((t) => t.dataset.id === id);
  if (have) { if (mvOn || tiles.children.length > 1) have.remove(); lvSync(); return; } // 이미 보고 있는 방송을 다시 누르면 뺀다(하나만 볼 때는 그대로)
  if (!mvOn) tiles.innerHTML = '';
  else if (tiles.children.length >= MV_MAX) tiles.firstElementChild.remove(); // 꽉 찼으면 가장 먼저 연 화면을 뺀다
  const tile = document.createElement('div'); tile.className = 'lv-tile'; tile.dataset.id = id;
  tile.innerHTML = `<div class="lv-tbar"><b>${liveWho(l)}</b><span class="chip ${l.platform} mini"><i></i>${PLAT[l.platform]}${tag ? ` · ${tag}` : ''}</span><a class="more" href="${esc(l.url)}" target="_blank" rel="noopener">${PLAT[l.platform]}에서 보기</a><button class="lv-big" type="button"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M9.5 2.5h4v4M13.5 2.5 9 7M6.5 13.5h-4v-4M2.5 13.5 7 9"/></svg><span>크게 보기</span></button><button class="lv-x" type="button" aria-label="${esc(l.who)} 화면 닫기">×</button></div>
    <iframe class="yt-frame" src="${esc(livePlayerSrc(l.embed, tiles.children.length > 0))}" title="${esc(l.who)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`;
  tile.querySelector('.lv-x').addEventListener('click', () => { tile.remove(); lvSync(); });
  tile.querySelector('.lv-big').addEventListener('click', lvBig);
  I.tree(tile); tiles.append(tile); lvSync();
  if (box.classList.contains('mini')) return; // 미니 플레이어로 보고 있으면 화면을 옮기지 않는다
  if (!box.classList.contains('cinema')) box.scrollIntoView({ block: 'nearest', behavior: motionOK() ? 'smooth' : 'auto' });
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && lvBox()?.classList.contains('cinema')) lvCinema(false); });
window.addEventListener('hashchange', () => { document.documentElement.classList.remove('lv-cinema'); mvOn = false; });

// 방송 제목: 서버가 번역해 둔 것이 있으면 지금 화면 언어로 (원문은 마우스를 올리면 보인다)
const liveTitle = (l) => l.tr?.[I.lang] || l.title || '';
function liveCard(l, i, asLink) {
  const hide = opt.spoiler; // 결과 가리기: 제목과 미리보기에 결과가 드러날 수 있어 가린다
  const inner = `<span class="lv-thumb">${l.thumb && !hide ? `<img src="${esc(l.thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}<span class="tag live">LIVE</span>${l.embed ? '<span class="yt-play" aria-hidden="true"></span>' : ''}</span>
    <span class="lv-meta"><b>${liveWho(l)}${l.embed ? '' : `<span class="lv-extn">${PLAT[l.platform]} ↗</span>`}</b><span class="lv-title"${!hide && liveTitle(l) !== (l.title || '') ? ` title="${esc(l.title)}"` : ''}>${hide ? '<span>결과 가리기 중에는 방송 제목을 숨깁니다.</span>' : esc(liveTitle(l))}</span>
    <span class="lv-sub"><span class="chip ${l.platform} mini"><i></i>${PLAT[l.platform]}</span>${l.viewers != null ? `<span>시청자 ${fmt(l.viewers)}명</span>` : ''}${l.started ? `<span>${sinceTxt(l.started)}</span>` : ''}</span></span>`;
  if (asLink && l.embed) return `<a class="lv-card" href="${playHref(l)}" aria-label="${esc(l.who)} 방송 재생">${inner}</a>`;
  // 여러 방송 고르기: 플랫폼이 다르면 플랫폼 이름, 같은 플랫폼이 둘 이상이면 구분 이름(로비 A …)을 붙이고, 모두 같은 플랫폼이면 플랫폼 이름은 뺀다(카드에 이미 있다)
  if (l.alts && l.embed) return `<div class="lv-pick"><button class="lv-card" type="button" data-lv="${i}" data-lvid="${esc(liveId(l))}" aria-label="${esc(l.who)} 방송 재생">${inner}</button>
    <div class="lv-plat"><small>${new Set(l.alts.map((x) => x.platform)).size === l.alts.length ? (l.alts.length === 2 ? '두 곳에서 방송 중' : `${l.alts.length}곳에서 방송 중`) : `방송 ${l.alts.length}개 동시 진행`}</small><div class="seg" role="group" aria-label="방송 볼 곳 고르기">${l.alts.map((x) => { const tag = altTag(x, l.alts), one = new Set(l.alts.map((y) => y.platform)).size === 1; return `<button type="button" data-bckey="${esc(l.key)}" data-bcplat="${esc(liveVar(x))}" aria-pressed="${liveVar(x) === liveVar(l)}"${x.title ? ` title="${esc(liveTitle(x))}"` : ''}><i class="${esc(x.platform)}" aria-hidden="true"></i>${!tag ? PLAT[x.platform] : one ? tag : `${PLAT[x.platform]} ${tag}`}</button>`; }).join('')}</div></div></div>`;
  return l.embed
    ? `<button class="lv-card" type="button" data-lv="${i}" data-lvid="${esc(liveId(l))}" aria-label="${esc(l.who)} 방송 재생">${inner}</button>`
    : `<a class="lv-card" href="${esc(l.url)}" target="_blank" rel="noopener">${inner}<span class="lv-ext">${PLAT[l.platform]}에서 보기</span></a>`;
}
function liveSection() {
  if (!C.streamsUrl) return '';
  return `<section class="sec lv" id="lv"><h2 class="h2" id="lvHead">${liveHead()}</h2>
    <div class="lv-slot"><div class="lv-player" id="lvPlayer" hidden></div></div>
    <div id="lvBody">${liveBody()}</div></section>`;
}
const liveHead = () => { const n = ST ? liveList().length : 0; return `지금 방송 중${n ? ` <small class="muted">${n}</small>` : ''}`; };
// 방송이 하나도 없을 때: 다음 공식 경기 시각과 공식 중계 채널
function liveNone() {
  const up = FROZEN ? [] : A.series.filter((s) => s.status !== 'completed' && s.start && Date.parse(s.start) > now() - 6 * 3600e3).sort((a, b) => a.start.localeCompare(b.start));
  const s = up.find((x) => isKrSeries(x)) || up[0];
  const bcs = (A.streams.broadcasts || []).filter((b) => b.links.length && bcOn(b));
  return `<div class="lv-empty"><b>지금 방송 중인 채널이 없습니다.</b>
    ${s ? `<p>다음 공식 경기: <span>${esc(ko(s.event, EVENT_KO))}</span> <span>${esc(REGION[s.region] || '')}</span> · <span>${esc(dayLabel(dayKey(s.start)))}</span> <span>${s.timeTbd ? '시간 미정' : esc(hhmm(s.start))}</span></p>` : ''}
    ${bcs.length ? `<div class="lv-bcs">${bcs.map((b) => `<span><small>${esc(b.label)}</small>${b.links.map(([n, u]) => chip(n.toLowerCase(), u)).join('')}</span>`).join('')}</div>` : ''}</div>`;
}
function liveBody() {
  if (!ST) return stFail
    ? '<div class="lv-empty"><b>방송 상태를 불러오지 못했습니다.</b><p>방송 확인 서버가 응답하지 않습니다. 1분마다 자동으로 다시 확인합니다.</p><div><button class="lv-btn" type="button" data-st-retry>다시 시도</button></div></div>'
    : '<p class="lead">방송 상태를 확인하는 중입니다.</p>';
  const L = liveList();
  const rest = liveAll().filter((l) => !liveShown(l)).sort((a, b) => (b.viewers ?? 0) - (a.viewers ?? 0));
  const others = rest.length ? `<details class="lv-rest"><summary>그 밖의 방송 <small class="muted">${rest.length}</small></summary><p class="caption">위 카드에는 지금 고른 보기(한국 관련 / 지역 / 내 응원 팀)에 맞는 방송만 나옵니다. 여기서 고른 방송도 같은 플레이어와 멀티뷰로 볼 수 있습니다.</p>
    <ul>${rest.map((l) => `<li>${l.embed ? `<button class="lv-add" type="button" data-lvid="${esc(liveId(l))}" aria-label="${esc(l.who)} 방송 재생"><b>${liveWho(l)}</b></button>` : `<a href="${esc(l.url)}" target="_blank" rel="noopener"><b>${esc(l.who)}</b></a>`}${l.kind === 'player' && team(l.team) ? ` <small>${teamLink(l.team)}</small>` : ''}<span class="lv-sub">${l.viewers != null ? `<span>시청자 ${fmt(l.viewers)}명</span>` : ''}${l.started ? `<span>${sinceTxt(l.started)}</span>` : ''}</span></li>`).join('')}</ul></details>` : '';
  const bad = Object.entries(ST.ok || {}).filter(([, v]) => v === false).map(([k]) => PLAT[k]);
  const age = Math.round((Date.now() - Date.parse(ST.at)) / 60000);
  const stale = (stFail || stCached) && age >= 10 ? ` · <span class="lv-stale">${age}분 전 기준 (최신 상태를 받지 못했습니다)</span>` : '';
  const foot = `<p class="caption lv-foot"><span>마지막 확인 ${hhmm(ST.at)}</span>${stale}${bad.length ? ` · <span>확인하지 못한 곳: ${bad.join(', ')}</span>` : ''} · <span>방송 시작과 종료는 1~2분 늦게 반영됩니다.</span></p>`;
  return `${L.length ? `<div class="lv-grid">${L.map((l, i) => liveCard(l, i)).join('')}</div>` : liveNone()}${others}${foot}`;
}
// 방송 탭의 '지금 방송 중'만 다시 그린다: 플레이어(재생 중인 방송)와 영상·채널 목록은 그대로 둔다
function patchLive() {
  const body = document.getElementById('lvBody'), head = document.getElementById('lvHead'); if (!body || !head) return false;
  const open = body.querySelector('.lv-rest')?.open;
  head.innerHTML = liveHead(); body.innerHTML = liveBody();
  if (open) body.querySelector('.lv-rest')?.setAttribute('open', '');
  I.tree(head); I.tree(body); bindLive(body); lvSync();
  return true;
}
function bindLive(root) {
  root.querySelectorAll('button.lv-card, button.lv-add').forEach((b) => b.addEventListener('click', () => playLive(b.dataset.lvid))); // 접힌 '그 밖의 방송' 목록도 같은 플레이어(멀티뷰)로
  root.querySelectorAll('[data-bcplat]').forEach((b) => b.addEventListener('click', () => pickPlat(b.dataset.bckey, b.dataset.bcplat)));
  root.querySelectorAll('[data-st-retry]').forEach((b) => b.addEventListener('click', () => { b.disabled = true; pollStreams(true); }));
}
// 최근 영상: 영상(YouTube 긴 영상) / 쇼츠. 쇼츠는 기본 목록에서 빼고 따로 모은다
const durTxt = (d) => { const m = /^(?:(\d+)h)?(?:(\d+)m)?/.exec(d || ''), h = +(m?.[1] || 0), mi = +(m?.[2] || 0); return h ? `${h}시간 ${mi}분 방송` : mi ? `${mi}분 방송` : ''; };
function videoSection(q) {
  if (!C.streamsUrl || !ST) return '';
  const all = ST.videos || [], more = q.get('v') === 'all';
  if (!all.length) return '';
  const G = { main: all.filter((v) => !v.short && v.platform !== 'twitch'), short: all.filter((v) => v.short) };
  const kind = G[q.get('vk')]?.length ? q.get('vk') : G.main.length ? 'main' : 'short';
  const cur = G[kind], list = more ? cur : cur.slice(0, 8);
  const day = (iso) => dayLabel(dayKey(iso));
  const card = (v) => {
    const isNew = vidSeen0 && Date.parse(v.published) > vidSeen0, tw = v.platform === 'twitch';
    const link = tw ? `<a href="https://www.twitch.tv/videos/${esc(v.id)}" target="_blank" rel="noopener">Twitch에서 보기</a>` : `<a href="${v.short ? `https://www.youtube.com/shorts/${esc(v.id)}` : `https://youtu.be/${esc(v.id)}`}" target="_blank" rel="noopener">YouTube에서 보기</a>`;
    const kindTag = tw ? '<span class="tag vk">다시보기</span> ' : v.short ? '<span class="tag vk">쇼츠</span> ' : '';
    return `<figure class="vid${tw ? ' tw' : ''}${v.short ? ' short' : ''}"><button class="yt" type="button" ${tw ? `data-tw="${esc(v.id)}"` : `data-yt="${esc(v.id)}"`} aria-label="${esc(v.title)} 재생">${v.thumb ? `<img src="${esc(v.thumb)}" alt="" loading="lazy" width="480" height="${tw ? 270 : v.short ? 853 : 360}">` : ''}<span class="yt-play" aria-hidden="true"></span></button>
    <figcaption><b>${isNew ? '<span class="tag live">새 영상</span> ' : ''}${kindTag}${esc(v.title)}</b><span>${esc(v.kind === 'player' ? v.who : v.channel || v.who)} · ${esc(day(v.published))}${tw && durTxt(v.dur) ? ` · <span>${durTxt(v.dur)}</span>` : ''} · ${link}</span></figcaption></figure>`;
  };
  const tabs = [['main', '영상'], ['short', '쇼츠']].filter(([k]) => G[k].length);
  const seg = tabs.length > 1 ? `<div class="seg vid-kind" role="group" aria-label="영상 종류">${tabs.map(([k, t]) => `<a href="${qsLink('/streams', q, { vk: k === 'main' ? null : k, v: null, play: null })}" aria-current="${k === kind}"><span>${t}</span> <small>${G[k].length}</small></a>`).join('')}</div>` : '';
  return `<section class="sec" id="vids"><h2 class="h2">최근 영상 <small class="muted">${G.main.length}</small></h2>
    <p class="lead">등록된 채널에 최근 3주 동안 올라온 YouTube 영상입니다. 쇼츠는 따로 모았습니다.</p>
    ${seg}<div class="vid-grid${kind === 'short' ? ' shorts' : ''}">${list.map(card).join('')}</div>
    ${cur.length > list.length ? `<p class="lead"><a class="more" href="${qsLink('/streams', q, { v: 'all' })}">영상 ${cur.length}개 모두 보기</a></p>` : ''}</section>`;
}
// 홈: 선수 개인 방송이나 대회 공식 중계가 켜져 있으면 맨 위에 카드로 보여 준다 (공식 파트너는 방송 탭에서만). 누르면 방송 탭에서 그 방송이 열린다
function liveStrip() {
  const L = liveList().filter((l) => l.kind !== 'partner');
  if (!L.length) {
    // 대회 중(경기 중이거나 앞뒤 1시간)인데 방송 중인 채널이 없으면 공식 중계 채널로 가는 길만 한 줄
    const on = ST && C.streamsUrl && A.series.some((s) => s.live || (s.status !== 'completed' && Math.abs(new Date(s.start) - now()) < 3.6e6));
    return on ? `<p class="lv-none"><span class="tag live">대회 중</span> <span>지금 Apex 방송 중인 채널이 없습니다.</span> <a class="more" href="#/streams?s=official">공식 중계 채널 보기</a></p>` : '';
  }
  return `<section class="sec lv lv-home" aria-labelledby="h-lvh"><div class="sec-head"><h2 class="h2" id="h-lvh">지금 방송 중 <small class="muted">${L.length}</small></h2><a class="more" href="#/streams">방송 전체</a></div>
    <div class="lv-grid">${L.slice(0, 3).map((l, i) => liveCard(l, i, true)).join('')}</div></section>`;
}
// 메뉴의 방송 탭: 방송 중 채널 수, 없으면 새 영상 점
function liveBadge() {
  const a = document.querySelector('.tabbar a[data-tab="streams"]'); if (!a) return;
  a.querySelector('.nav-badge')?.remove();
  const n = liveList().length, nv = newVideos().length;
  if (!n && !nv) return;
  const b = document.createElement('span'); b.className = `nav-badge${n ? '' : ' dot'}`; b.textContent = n ? String(n) : ''; b.setAttribute('aria-label', n ? `방송 중 ${n}` : '새 영상'); a.appendChild(b);
}
// 사이트를 열자마자 방송 상태가 보이게: 지난번에 받은 응답(5분 이내)을 먼저 쓰고, 새 응답이 오면 바꾼다
let stCached = false, stRetry = 0, stFail = false;
// maxMin: 평소에는 5분 이내 응답만, 서버가 응답하지 않을 때는 60분 이내 응답까지 ('N분 전 기준'으로 표시)
function loadStreamsCache(maxMin = 5) {
  if (!C.streamsUrl || ST) return;
  try { const c = JSON.parse(localStorage.getItem('algskr.streams') || 'null'); if (c?.j && Array.isArray(c.j.live) && Date.now() - c.t < maxMin * 60e3) { setStreams(c.j); stCached = true; } } catch { /* 없으면 새로 받는다 */ }
}
async function pollStreams(force) {
  if (!C.streamsUrl || (document.hidden && !force)) return;
  const { parts } = parseHash(), tab = parts[0] || 'home';
  let j;
  try {
    const r = await fetch(C.streamsUrl, { cache: 'no-store' }); if (!r.ok) throw new Error(`HTTP ${r.status}`);
    j = await r.json(); if (!j || !Array.isArray(j.live)) throw new Error('bad response');
  } catch {
    // 받지 못함: 처음이면 지난 응답(60분 이내)이라도 보여 주고, 방송 탭에는 '불러오지 못했습니다'(또는 'N분 전 기준')를 띄운다
    const was = stFail; stFail = true;
    if (!ST) loadStreamsCache(60);
    if ((!was || force) && tab === 'streams') { patchLive(); liveBadge(); }
    return;
  }
  const first = !ST || stCached || stFail; setStreams(j); stCached = false; stFail = false;
  // 예약 실행이 멈춰 값이 아주 낡았을 때만 몇 초 뒤 한 번 더 받아 온다 (Worker 가 요청을 받을 때 직접 모으는 경우가 대부분이라 그때는 필요 없다)
  if (Date.now() - Date.parse(j.at) > 12 * 60e3 && !stRetry) stRetry = setTimeout(() => { stRetry = 0; pollStreams(); }, 4000);
  try { localStorage.setItem('algskr.streams', JSON.stringify({ t: Date.now(), j })); } catch { /* 저장 못 해도 동작에는 지장 없음 */ }
  const sig = JSON.stringify([ST.live.map((l) => [l.key, l.platform]), (j.videos || []).length, j.ok]);
  liveBadge();
  const osig = JSON.stringify(ST.live.filter((l) => l.kind === 'official').map((l) => [l.key, l.platform]));
  const oChanged = osig !== stOSig; stOSig = osig;
  // 방송 탭: 켜지고 꺼진 방송이 없어도 시청자 수·'N분째'·제목은 바뀌므로 '지금 방송 중'만 제자리에서 다시 그린다
  if (sig === stSig && !first) { if (tab === 'streams') patchLive(); return; }
  stSig = sig;
  // 방송 목록이 보이는 화면(홈·방송·팀/선수 상세)만 다시 그린다. 경기·순위 화면은 공식 중계가 켜지거나 꺼질 때만 ('중계 보기' 버튼)
  if (!(tab === 'home' || tab === 'streams' || (tab === 'teams' && parts[1]) || tab === 'players' || oChanged)) return;
  if (document.activeElement?.matches?.('input, textarea, select')) { if (tab === 'streams') patchLive(); return; }
  // 재생 중인 플레이어가 있으면 화면 전체는 다시 그리지 않는다(영상이 끊기지 않게). 방송 탭은 '지금 방송 중'만 바꾼다
  if (document.querySelector('#lvPlayer iframe, iframe.yt-frame, dialog[open]')) { if (tab === 'streams') patchLive(); return; }
  render(); // 팀·경기 화면의 LIVE 표시·중계 보기도 함께 바뀐다
}
function streams(parts, q) {
  const sv = q.get('s') || 'all';
  const S = A.streams, MV = A.season.multiview || {};
  const order = (focusList()).map((k) => k.short);
  const players = S.players.slice().sort((a, b) => !liveOf(a.name, a.team) - !liveOf(b.name, b.team) || (order.indexOf(a.team) + 99 * (order.indexOf(a.team) < 0)) - (order.indexOf(b.team) + 99 * (order.indexOf(b.team) < 0)) || (a.role === 'coach') - (b.role === 'coach'));
  const show = (k) => sv === 'all' || sv === k;
  if (ST) store.set('vidSeen', Date.now());
  return `<h1 class="title">방송</h1>
    ${sv === 'all' || sv === 'live' ? liveSection() + videoSection(q) : ''}
    ${show('players') ? `<section class="sec"><h2 class="h2">선수·코치 방송 <small class="muted">${players.length}</small></h2>
        <div class="ch-grid rows">${players.map(playerRow).join('')}</div>
        <p class="caption ch-note">채움 칩은 확인된 채널(공식 API, Liquipedia 선수 페이지, 운영자 입력), 점선 칩은 확인된 채널이 없어 해당 플랫폼에서 이름으로 검색하는 링크입니다. 선수 개인 방송은 대회 규정상 지연이 걸려 있어, 이 사이트의 점수가 방송보다 먼저 바뀔 수 있습니다.</p>
        <p class="caption">${fbLink('채널 제보', '', '선수 CHZZK·YouTube 채널 제보하기')}</p>
      </section>` : ''}
    ${(sv === 'all' || sv === 'creators') && S.creators?.length ? `<section class="sec"><h2 class="h2">한국 스트리머·전 프로 <small class="muted">${S.creators.length}</small></h2>
        <div class="ch-grid rows">${S.creators.slice().sort((a, b) => !creatorLive(a) - !creatorLive(b)).map(creatorRow).join('')}</div>
        <p class="caption ch-note">대회 선수는 아니지만 Apex 방송을 하는 채널입니다. 방송 중 표시는 Apex 방송일 때만 뜹니다.</p>
      </section>` : ''}
    ${show('official') ? `<section class="sec"><h2 class="h2">공식 중계</h2>
        <div class="ch-grid wide">
        ${S.broadcasts.filter(bcOn).map((b) => `<div class="bc"><h3>${esc(b.label)}</h3><p>${esc(b.note)}</p><div class="chips">${b.links.length ? b.links.map(([n, u]) => `<a class="chip ${n.toLowerCase()}" href="${esc(u)}" target="_blank" rel="noopener"><i></i>${esc(n)}</a>`).join('') : '<span class="chip off">등록된 채널 없음</span>'}</div></div>`).join('')}
        ${S.partners.length ? `<div class="bc"><h3>공식 파트너 워치 파티</h3><p>공식 일정에 파트너로 등록된 채널입니다.</p><div class="chips">${S.partners.filter((p) => p.url).map((p) => `<a class="chip ${p.provider}" href="${esc(p.url)}" target="_blank" rel="noopener"><i></i>${esc(p.name)}</a>`).join('')}</div></div>` : ''}
        </div>
      </section>` : ''}
    ${show('mv') ? `<section class="sec mv${sv === 'all' ? ' compact' : ''}" aria-labelledby="h-mv">
      <figure><img src="assets/multiview.svg" alt="멀티뷰 화면 예시: 메인 중계, 팀 시점 4개, 맵 시점, 실시간 순위가 한 화면에 배치된 모습" width="640" height="360"><figcaption>화면 구성을 설명하는 예시 그림입니다. 실제 화면과 다를 수 있습니다.</figcaption></figure>
      <div>
        <h2 class="h2" id="h-mv">ALGS 멀티뷰</h2>
        <p>ALGS 공식 사이트의 관전 도구입니다. 메인 중계와 함께 원하는 팀의 화면을 골라 동시에 볼 수 있습니다.</p>
        <ul>
          <li>한 번에 최대 ${MV.maxPov || 12}개 시점을 띄우고, 로비 20팀 누구든 고를 수 있습니다.</li>
          <li>팀 무전을 그대로 들을 수 있습니다.</li>
          <li>맵 시점, 게임 중 실시간 순위와 스탯이 함께 나옵니다.</li>
          <li>경기가 끝난 뒤에도 다시보기로 모든 시점을 볼 수 있습니다.</li>
          <li>Twitch 계정으로 로그인하면 시청 보상(드롭)도 받을 수 있습니다.</li>
        </ul>
        <a class="btn-link" href="${esc(MV.url || 'https://algs.ea.com/en/multiview')}" target="_blank" rel="noopener">멀티뷰 열기 (algs.ea.com)</a>
      </div>
    </section>` : ''}
`;
}

/* ---------- 이벤트 연결 ---------- */
function bind() {
  app.querySelectorAll('[data-toggle]').forEach((tr) => {
    const go = () => { const d = document.getElementById(tr.dataset.toggle); if (d.hidden) fillLazy(d); d.hidden = !d.hidden; tr.setAttribute('aria-expanded', String(!d.hidden)); if (!d.hidden) pulseCls(d, 'anim-open', 400); };
    tr.addEventListener('click', (e) => { if (e.target.closest('a')) return; go(); });
    tr.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  });
  bindReplay();
  app.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
  app.querySelectorAll('[data-fav]').forEach((b) => b.addEventListener('click', () => {
    if (!b.classList.contains('fav-chip')) return toggleFav(b.dataset.fav);
    // 고르기 화면에서는 다시 그리지 않고 버튼만 바꿔 검색어·스크롤 유지
    const set = new Set(opt.fav); set.has(b.dataset.fav) ? set.delete(b.dataset.fav) : set.add(b.dataset.fav);
    opt.fav = [...set]; store.set('fav', opt.fav); FOCUS = null;
    if (!opt.fav.includes(opt.main)) { opt.main = null; store.set('main', null); }
    // 대표 팀 후보 목록도 바뀌므로 다시 그리되, 검색어는 유지
    const q0 = document.getElementById('favSearch')?.value || '';
    render();
    const fs2 = document.getElementById('favSearch');
    if (fs2 && q0) { fs2.value = q0; fs2.dispatchEvent(new Event('input')); }
  }));
  app.querySelectorAll('[data-main]').forEach((b) => b.addEventListener('click', () => setMain(b.dataset.main)));
  app.querySelectorAll('[data-fav-clear]').forEach((b) => b.addEventListener('click', () => { opt.fav = []; store.set('fav', []); opt.main = null; store.set('main', null); FOCUS = null; render(); }));
  const fs = document.getElementById('favSearch');
  if (fs) fs.addEventListener('input', () => { const v = flatName(fs.value); app.querySelectorAll('.fav-chip').forEach((c) => { c.hidden = !!v && !flatName(c.textContent + ' ' + (c.dataset.name || '')).includes(v); }); });
  app.querySelectorAll('[data-reveal]').forEach((b) => b.addEventListener('click', () => reveal(b.dataset.reveal, b)));
  bindLive(app);
  { // 홈에서 넘어온 경우(#/streams?play=…): 그 방송을 바로 연다
    const want = parseHash().q.get('play'), box = document.getElementById('lvPlayer');
    if (want && box && !box.querySelector('iframe')) [...app.querySelectorAll('button.lv-card')].find((b) => b.dataset.lvid === want)?.click();
  }
  app.querySelectorAll('button.yt').forEach((b) => b.addEventListener('click', () => {
    const f = document.createElement('iframe');
    f.src = b.dataset.tw ? `https://player.twitch.tv/?video=${encodeURIComponent(b.dataset.tw)}&parent=${location.hostname}&autoplay=true` : `https://www.youtube-nocookie.com/embed/${b.dataset.yt}?autoplay=1&rel=0`;
    f.title = b.getAttribute('aria-label'); f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen'; f.allowFullscreen = true;
    f.className = 'yt-frame'; b.replaceWith(f);
  }));
  app.querySelectorAll('[data-unclip]').forEach((b) => { b.onclick = () => { const g = b.closest('.clip'); g?.classList.remove('clip'); b.remove(); pulseCls(g, 'anim-more', 400); }; });
  const search = document.getElementById('teamSearch');
  if (search) search.addEventListener('input', () => {
    const v = flatName(search.value);
    let n = 0;
    app.querySelectorAll('.team-tile').forEach((t) => { t.hidden = !!v && !flatName(t.dataset.name).includes(v) && !t.dataset.name.includes(search.value.trim().toLowerCase()); if (!t.hidden) n++; });
    app.querySelectorAll('.team-group').forEach((g) => { g.hidden = ![...g.querySelectorAll('.team-tile')].some((t) => !t.hidden); g.classList.toggle('q', !!v); });
    const none = document.getElementById('teamNone'); if (none) none.hidden = !v || n > 0;
  });
}

function setupFeedback() {
  document.getElementById('feedbackBtn')?.addEventListener('click', () => openFeedback('', ''));
  document.getElementById('shareBtn')?.addEventListener('click', sharePage);
  document.querySelectorAll('#feedback .fb-kind').forEach((b) => b.addEventListener('click', () => {
    window.open(feedbackUrl(b.dataset.kind, fbCtx), '_blank', 'noopener');
    document.getElementById('feedback').close();
  }));
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-feedback]'); if (b) openFeedback(b.dataset.feedback, b.dataset.ctx || ''); });
}

function setupSettings() {
  const dlg = document.getElementById('settings');
  const dark = document.getElementById('optDark'), sp = document.getElementById('optSpoiler'), kr = document.getElementById('optKrOnly');
  dlg.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) dlg.close(); });
  document.getElementById('settingsBtn').addEventListener('click', () => {
    dark.checked = document.documentElement.dataset.theme === 'dark';
    sp.checked = opt.spoiler; kr.checked = opt.krOnly;
    const mo = document.getElementById('optMotion'); if (mo) mo.checked = document.documentElement.classList.contains('no-motion');
    document.getElementById('dataInfo').innerHTML = dataInfo();
    document.getElementById('refreshInfo').innerHTML = refreshInfo();
    I.tree(document.getElementById('dataInfo')); I.tree(document.getElementById('refreshInfo'));
    dlg.showModal();
  });
  document.getElementById('refreshPill').addEventListener('click', () => document.getElementById('settingsBtn').click());
  dark.addEventListener('change', () => {
    const t = dark.checked ? 'dark' : 'light', set = () => { document.documentElement.dataset.theme = t; };
    if (document.startViewTransition && motionOK()) document.startViewTransition(set); else set(); // 지원 브라우저는 화면 전체를 교차 전환
    try { localStorage.setItem('algskr.theme', t); } catch {}
  });
  const mo = document.getElementById('optMotion');
  mo?.addEventListener('change', () => { document.documentElement.classList.toggle('no-motion', mo.checked); try { mo.checked ? localStorage.setItem('algskr.motion', 'off') : localStorage.removeItem('algskr.motion'); } catch {} });
  sp.addEventListener('change', () => { opt.spoiler = sp.checked; store.set('spoiler', sp.checked); render(); });
  kr.addEventListener('change', () => { opt.krOnly = kr.checked; store.set('krOnly', kr.checked); render(); });
  // 언어: 고르면 저장하고 새로 불러온다 (고정 영역까지 처음부터 그 언어로)
  dlg.querySelectorAll('[data-lang]').forEach((b) => b.addEventListener('click', () => { if (b.dataset.lang !== I.lang) I.setLang(b.dataset.lang); }));
}

const dataInfo = () => {
  const s = A.sources;
  const f = (iso) => (iso ? dateTime(iso) : '수집 안 됨');
  return `데이터 갱신: ${dateTime(A.generated)} ${TZL}<br>ALGS 공식: ${f(s.algs)}<br>Liquipedia: ${f(s.lpLcq || s.lp)}${A.conflicts?.length ? `<br>출처 간 차이 ${A.conflicts.length}건 (Liquipedia 값 표시)` : ''}`;
};
const footer = () => { footer0(); I.tree(document.getElementById('sourceLine')); };
const footer0 = () => { document.getElementById('sourceLine').innerHTML = `데이터: <a href="https://liquipedia.net/apexlegends/" target="_blank" rel="noopener">Liquipedia</a> (CC-BY-SA 3.0), <a href="https://algs.ea.com/" target="_blank" rel="noopener">ALGS 공식</a>. 갱신 ${dateTime(A.generated)} ${TZL}`; };

/* ---------- 데이터 갱신: 버전 확인 + 경기 중 실시간 ---------- */
const R = A.season.refresh || { buildMinutes: 5, liveSeconds: 10 };
const LIVE = { mode: C.liveMode || (C.liveUrl ? 'worker' : 'direct'), api: C.officialApi || 'https://prod-api.algstools.com/v1', lastAt: 0, active: [] };
const ago = (t) => { const s = Math.max(0, Math.round((Date.now() - t) / 1000)); return s < 60 ? `${s}초 전` : `${Math.floor(s / 60)}분 전`; };
function refreshNote() {
  return `<details class="refresh-note"><summary><b>갱신 주기</b> 점수 ${C.livePollMs ? Math.round(C.livePollMs / 1000) : R.liveSeconds}초 · 순위·CP ${Math.round(OFF.ms / 1000)}초 <span class="more-hint">자세히</span></summary>진행 중인 시리즈 점수는 공식 API에서 약 ${C.livePollMs ? Math.round(C.livePollMs / 1000) : R.liveSeconds}초마다, 순위·챔피언십 포인트·다음 단계 출전 명단은 ${Math.round(OFF.ms / 1000)}초마다(시리즈가 끝나는 순간에는 즉시) 공식 API에서 직접 받아 바꿉니다. Liquipedia 대조는 ${R.buildMinutes}분 주기 빌드에서 합니다. 마지막 빌드 ${dateTime(A.generated)} ${TZL}.</details>`;
}
function refreshInfo() {
  return `경기 중: 진행 중인 시리즈만 공식 API에서 ${Math.round((C.livePollMs || R.liveSeconds * 1000) / 1000)}초마다 확인 (${LIVE.mode === 'worker' ? '실시간 서버 경유' : '브라우저에서 직접'}). 탭을 보고 있을 때만 확인합니다.<br>확정값: 대회 기간에는 조별 리그 순위·출전 명단(국제전은 챔피언십 포인트도)을 공식 API에서 ${Math.round(OFF.ms / 1000)}초마다, 시리즈 종료 즉시 다시 받음${OFF.lastAt ? ` (마지막 ${ago(OFF.lastAt)})` : ''}.<br>평상시: 약 ${R.buildMinutes}분마다 자동 빌드. 새 빌드는 ${Math.round((C.verPollMs || 30000) / 1000)}초 안에 화면에 반영됩니다.<br>지금 상태: ${LIVE.active.length ? `실시간 확인 중 (${LIVE.active.length}개 시리즈, 마지막 ${LIVE.lastAt ? ago(LIVE.lastAt) : '대기'})` : '진행 중인 경기 없음'}`;
}
// PC 헤더 메뉴가 넘치면 단계적으로 줄인다(style.css 의 .top.f1…f5). 언어·대표 팀 칩·갱신 표시 길이에 따라 필요한 단계가 달라 실제 폭을 재서 고른다.
const FIT_MAX = 5, fitMq = matchMedia('(min-width: 768px)');
function fitHeader() {
  const top = document.querySelector('.top'), bar = top?.querySelector('.tabbar');
  if (!bar) return;
  for (let i = 1; i <= FIT_MAX; i++) top.classList.remove('f' + i);
  if (!fitMq.matches) return;
  for (let i = 1; i <= FIT_MAX && bar.scrollWidth > bar.clientWidth + 1; i++) top.classList.add('f' + i);
}
function watchHeader() {
  const top = document.querySelector('.top'); if (!top) return;
  let raf = 0;
  const go = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; fitHeader(); }); };
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(go);
    // 창 폭(.top), 메뉴 글자(번역), 오른쪽 도구(갱신 표시 글자) 크기가 바뀌면 다시 잰다. 대표 팀 칩이 생기면 메뉴 칸 폭이 바뀐다.
    [top, top.querySelector('.tabbar'), top.querySelector('.top-right'), ...top.querySelectorAll('.tabbar a span')].forEach((el) => el && ro.observe(el));
  } else addEventListener('resize', go);
  fitMq.addEventListener?.('change', go);
  fitHeader();
}
function updatePill() {
  const pill = document.getElementById('refreshPill'), txt = document.getElementById('refreshText');
  if (!pill) return;
  const on = LIVE.active.length > 0 && A.series.some((s) => s.live);
  pill.classList.toggle('is-live', on);
  if (FROZEN) { pill.classList.remove('is-live'); pill.title = txt.textContent = I.t('지난 시즌 기록'); return; }
  pill.title = txt.textContent = I.t(on ? `실시간 · ${LIVE.lastAt ? ago(LIVE.lastAt) : '확인 중'}` : LIVE.active.length ? '경기 대기 · 실시간 준비' : `${R.buildMinutes}분 갱신 · ${hhmm(A.generated)}`);
}
// 진행 중이거나 5분 안에 시작하는 시리즈 (시작 후 10시간까지)
const liveCandidates = () => A.series.filter((s) => s.status !== 'completed' && new Date(s.start) - now() < 5 * 60e3 && now() - new Date(s.start) < 10 * 3600e3);
let liveTimer = null;
async function pollDirect() {
  clearTimeout(liveTimer);
  if (FROZEN) return;
  const cands = liveCandidates();
  LIVE.active = cands.map((s) => s.id);
  if (!cands.length || document.hidden) { updatePill(); liveTimer = setTimeout(pollDirect, 60000); return; }
  let changed = false, justDone = false;
  for (const s of cands) {
    try {
      const r = await fetch(`${LIVE.api}/stats/series/${s.id}`, { cache: 'no-store' });
      if (r.status === 404) { s.live = false; continue; } // 아직 시작 전
      if (!r.ok) continue;
      const st = await r.json();
      const results = (st.teams || []).map((t) => ({ pos: t.position, short: apiShort(t), pts: t.points, kills: t.kills, kr: krOf(apiShort(t)), mpe: !!t.matchPointEligible, won: !!t.wonMatchPoint })).sort((a, b) => a.pos - b.pos);
      const games = Math.max(0, ...(st.teams || []).flatMap((t) => (t.players || []).map((p) => p.latestMatchNumber || 0)));
      const sig = JSON.stringify([st.seriesStatus, results.map((x) => [x.short, x.pts, x.pos])]);
      if (sig !== s._sig) { changed = true; s._sig = sig; }
      s.results = results.some((x) => x.pos) ? results : s.results; s.games = games; // 첫 게임이 끝나기 전에는 순위(position)가 비어 있다: 출전 명단 그대로
      s.kr = (s.results || []).filter((x) => x.kr !== 'none').map((x) => x.short);
      s.live = st.seriesStatus === 'live';
      s.liveAt = Date.now();
      // 게임별 상태: 몇 게임이 끝났고 지금 몇 번째 게임이 진행 중인지 (점수창의 'N매치 진행 중 / N매치 완료')
      if (s.live) {
        const m = await fetch(`${LIVE.api}/series/${s.id}/matches`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
        if (m?.matches) {
          const fin = (y) => y.status === 'completed' || y.inGameStatus === 'postmatch';
          const gDone = m.matches.filter(fin).length, gLive = m.matches.find((y) => y.status === 'live' && !fin(y))?.matchNumber || 0;
          if (gDone !== s.gDone || gLive !== s.gLive) { s.gDone = gDone; s.gLive = gLive; changed = true; }
        }
      }
      if (st.seriesStatus === 'completed' && s.status !== 'completed') { s.status = 'completed'; s.live = false; s.liveFinal = true; justDone = true; }
    } catch {}
  }
  LIVE.lastAt = Date.now();
  if (justDone) refreshOfficial(); // 시리즈가 끝나면 다음 단계 출전 명단·순위·CP를 바로 다시 확인
  if (changed) render();
  updatePill();
  const base = C.livePollMs || R.liveSeconds * 1000;
  liveTimer = setTimeout(pollDirect, base + Math.random() * 3000); // 요청이 몰리지 않게 무작위 지연
}
// 확정값 직접 확인: 공식 API의 CP 순위, 조별 리그 누적, 남은 시리즈 출전 명단 (빌드를 기다리지 않음)
const OFF = { lastAt: 0, ms: C.officialPollMs || 60000 };
const regionOf = (id, raw) => A.cp.find((r) => r.id === id)?.region || ({ 'asia-pacific-north': 'apac-n', 'asia-pacific-south': 'apac-s', 'europe-middle-east-and-africa': 'emea', americas: 'americas' }[raw] || raw);
async function refreshOfficial() {
  if (FROZEN || document.hidden || LIVE.mode !== 'direct') return;
  const api = LIVE.api, j = (u) => fetch(api + u, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  let changed = false;
  const jobs = [];
  // 1) 국제전 남은 시리즈의 공식 출전 명단 (12시간 안에 시작하는 것)
  const lcqIds = new Set(lcqEvents().map((e) => e.eventId));
  for (const s of A.series.filter((x) => (x.eventId === A.intl?.eventId || lcqIds.has(x.eventId)) && x.status !== 'completed' && new Date(x.start) - now() < 12 * 3600e3)) {
    jobs.push(j(`/series/${s.id}/teams`).then((r) => {
      const sh = (r?.teams || []).map(apiShort).filter(Boolean);
      if (sh.length && JSON.stringify(sh) !== JSON.stringify(s.lineup)) { s.lineup = sh; changed = true; }
    }));
  }
  // 2) 조별 리그 누적 (조별 리그가 끝나기 전까지)
  const gsLive = A.intl && A.api?.groupPhaseId && A.series.some((x) => x.eventId === A.intl.eventId && x.phase === 'Group Stage' && x.status !== 'completed' && new Date(x.start) <= now());
  if (gsLive) jobs.push(j(`/stats/phases/${A.api.groupPhaseId}/standings`).then((r) => {
    if (!r?.standings?.length) return;
    const rows = r.standings.map((x) => ({ pos: x.position, short: apiShort(x), name: x.name, id: x.teamId, group: x.group, pts: x.points, kills: x.kills, region: regionOf(x.teamId, x.region), kr: krOf(apiShort(x)), next: x.position <= A.intl.winnersCut ? 'Winners Round' : 'Elimination Round 1' }));
    if (JSON.stringify(rows.map((x) => [x.short, x.pts])) !== JSON.stringify(A.intl.rows.map((x) => [x.short, x.pts]))) { A.intl.rows = rows; changed = true; }
  }));
  // 3) 챔피언십 포인트 순위 (공식 페이지와 같은 조건). 국제전 진행·정산 중에만: 평소에는 5분마다 도는 빌드 값으로 충분하다
  if (A.api?.cpEventIds?.length && ['live', 'pending'].includes(board().state)) jobs.push(j(`/seasons/${A.seasonId}/standings/teams?eventIds=${encodeURIComponent(A.api.cpEventIds.join(','))}&minAmountOfMatches=12`).then((r) => {
    if (!r?.standings?.length) return;
    const cut = A.season.cpDirectSlots;
    const rows = r.standings.map((x) => ({ rank: x.rank, id: x.teamId, short: x.shortName, name: x.teamName, region: regionOf(x.teamId, x.region), total: x.totalPoints, players: x.players.map((p) => [p.name.trim(), p.points, p.id]) }));
    const c32 = rows.find((x) => x.rank === cut)?.total ?? 0, c33 = rows.find((x) => x.rank === cut + 1)?.total ?? 0;
    for (const x of rows) { x.status = x.rank <= cut ? 'direct' : 'lcq'; x.gap = x.rank <= cut ? x.total - c33 : c32 - x.total; x.kr = krOf(x.short); }
    if (JSON.stringify(rows.map((x) => [x.id, x.total])) !== JSON.stringify(A.cp.map((x) => [x.id, x.total]))) {
      A.cp = rows; changed = true;
      for (const k of A.kr || []) { const x = rows.find((y) => y.short === k.short); if (x) k.cp = { rank: x.rank, total: x.total, gap: x.gap, status: x.status }; }
      for (const t of Object.values(A.teams)) { const x = rows.find((y) => y.id === t.id); if (x) t.cp = { rank: x.rank, total: x.total }; }
    }
  }));
  // 4) 진행 중인 플레이오프의 확정 순위·CP (정산용)
  const ie = (A.cpEvents || []).find((x) => x.id === A.api?.intlEventId);
  if (ie && ie.rows.some((r) => !r.id)) jobs.push(j(`/events/${ie.id}/standings`).then((r) => {
    if (!r?.standings?.length) return;
    const byId = Object.fromEntries(Object.values(A.teams).map((t) => [t.id, t]));
    const rows = r.standings.filter((x) => x.points != null).map((x) => ({ pos: x.position, cp: x.points, id: x.teamId || null, short: byId[x.teamId]?.short || '', name: x.name, kr: byId[x.teamId]?.krLevel || 'none',
      players: (x.players || []).filter((p) => p.role !== 'coach').map((p) => [p.id, p.name.trim()]) }));
    if (rows.filter((x) => x.id).length !== ie.rows.filter((x) => x.id).length) { ie.rows = rows; A.cpEvents = A.cpEvents.slice(); changed = true; }
  }));
  await Promise.all(jobs);
  OFF.lastAt = Date.now();
  if (changed) render();
}
setInterval(refreshOfficial, OFF.ms);
// 탭을 다시 보면 밀린 확인을 바로 한다 (숨긴 동안에는 버전 확인·시계·홈 다시 그리기를 쉰다)
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  pollVer(); updatePill(); pollStreams();
  if (LIVE.mode === 'direct') { pollDirect(); if (Date.now() - OFF.lastAt > OFF.ms) refreshOfficial(); }
  if (!parseHash().parts[0]) render();
});
let curVer = null;
async function pollVer() {
  if (FROZEN || document.hidden) return;
  try {
    const r = await fetch(`${C.verUrl}?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return;
    const { v } = await r.json();
    if (curVer && v !== curVer) await reloadData(v);
    curVer = v;
  } catch {}
}
function reloadData(v) {
  return new Promise((res) => {
    const s = document.createElement('script');
    s.src = `data/algs-data.js?v=${v}`;
    s.onload = () => { s.remove(); A = unpack(window.ALGS); loadBrackets(); applyLive(); footer(); render(); updatePill(); if (LIVE.mode === 'direct') pollDirect(); res(); };
    s.onerror = () => { s.remove(); res(); };
    document.head.appendChild(s);
  });
}
let live = null, liveEtag = null;
async function pollLive() {
  if (!C.liveUrl) return;
  try {
    const r = await fetch(C.liveUrl, { headers: liveEtag ? { 'If-None-Match': liveEtag } : {} });
    if (r.status === 304 || !r.ok) return;
    liveEtag = r.headers.get('ETag');
    live = await r.json();
    applyLive(); render();
  } catch {}
}
function applyLive() {
  if (!live?.series) return;
  for (const s of A.series) {
    const l = live.series[s.id];
    if (!l) continue;
    s.live = l.status === 'live';
    if (l.results?.some((r) => r.pos)) s.results = l.results.map((r) => ({ ...r, kr: krOf(r.short), mpe: !!r.mp }));
    s.liveAt = l.checkedAt ? Date.parse(l.checkedAt) : Date.now(); LIVE.lastAt = s.liveAt;
    if (l.status === 'completed') { s.status = 'completed'; s.liveFinal = true; }
    s.kr = (s.results || []).filter((r) => isF(r.short)).map((r) => r.short);
  }
}

/* ---------- 시작 ---------- */
I.chrome();

// 같은 화면 안에서 보기만 바꾸는 링크(data-keep-scroll, 예: POI 드래프트 지도 전환)는 맨 위로 올리지 않고 누른 때의 스크롤 위치를 지킨다.
// 같은 주소를 다시 눌러 화면이 안 바뀌거나 새 탭으로 열 때를 위해 위치 기억은 잠깐만 둔다
let keepY = null, keepT = 0;
// 같은 메뉴 안에서 보기만 바꾸는 버튼(세부 메뉴 알약, 지역·단위·스플릿 같은 선택 버튼 묶음, 직행권 지역 칸)도 같은 규칙:
//   누르면 맨 위로 튀지 않고 지금 위치를 지킨다. 주 메뉴나 다른 메뉴로 가는 링크, 팀·선수 상세 링크는 그대로 맨 위에서 시작한다.
const VIEW_LINK = 'a[data-keep-scroll], .subtabs a, [role="group"] a, .qual-g a';
document.addEventListener('click', (e) => {
  if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = e.target.closest?.(VIEW_LINK);
  if (!a) return;
  const href = a.getAttribute('href') || '';
  if (!a.hasAttribute('data-keep-scroll')) {
    // 같은 메뉴(경로 첫 칸이 같음) 안의 이동만
    const top = (h) => (h.replace(/^#\/?/, '').split(/[/?]/)[0] || '');
    if (!href.startsWith('#') || top(href) !== top(location.hash)) return;
  }
  keepY = window.scrollY; clearTimeout(keepT); keepT = setTimeout(() => { keepY = null; }, 600);
});
window.addEventListener('hashchange', () => { const y = keepY; keepY = null; animNext = 'nav'; render(); app.focus({ preventScroll: true }); window.scrollTo(0, y ?? 0); });
setupSettings();
setupFeedback();
// 세부 탭이 머리말(웹은 머리말+탭) 바로 아래에 붙도록 높이를 잰다
function measureStick() {
  const top = document.querySelector('.top'), bar = document.querySelector('.tabbar');
  const desk = matchMedia('(min-width: 768px)').matches;
  const z = parseFloat(getComputedStyle(document.querySelector('.frame')).zoom) || 1;
  const h = top?.offsetHeight || 0; // 메뉴(PC)가 헤더 안에 있다
  document.documentElement.style.setProperty('--top-h', `${top?.offsetHeight || 0}px`);
  document.documentElement.style.setProperty('--stick', `${h}px`);
}
measureStick();
addEventListener('resize', measureStick);
{ let rt = 0; addEventListener('resize', () => { cancelAnimationFrame(rt); rt = requestAnimationFrame(fitRing); }); }
footer();
loadStreamsCache();
if (C.streamsUrl) pollStreams(); // 화면을 그리기 전에 요청부터 보낸다
render();
watchHeader();
liveBadge();
pollVer();
setInterval(pollVer, C.verPollMs || 30000);
if (C.streamsUrl) setInterval(pollStreams, C.streamsPollMs || 60000);
if (LIVE.mode === 'worker' && C.liveUrl) { pollLive(); setInterval(pollLive, C.livePollMs || 10000); }
else if (LIVE.mode === 'direct') { pollDirect(); refreshOfficial(); }
updatePill();
setInterval(() => { if (!document.hidden) updatePill(); }, 1000);
setInterval(homeTick, 60000); // 홈 카운트다운: 시각 글자만 바꾸고, 날짜·시가 바뀔 때만 다시 그린다
