// EASY ALGS KR — 화면 렌더링 (빌드 도구 없이 동작하는 ES 모듈)
let A = window.ALGS;
const C = window.ALGS_CONFIG || {};
const app = document.getElementById('app');

/* ---------- 설정 (브라우저별 저장, 실패해도 동작) ---------- */
const mem = {};
const store = {
  get(k, d) { try { const v = localStorage.getItem('algskr.' + k); return v === null ? d : JSON.parse(v); } catch { return k in mem ? mem[k] : d; } },
  set(k, v) { mem[k] = v; try { localStorage.setItem('algskr.' + k, JSON.stringify(v)); } catch {} },
};
const opt = { spoiler: store.get('spoiler', false), krOnly: store.get('krOnly', false) };

/* ---------- 스포일러 방지: 점수·순위·진출 결과를 가리고 대회 단위로 공개 ---------- */
const revealed = new Set(store.get('revealed', []));
// 가릴 대상 열쇠: 진행 중(또는 막 끝난) 국제전, 최근 7일 안의 시리즈가 속한 대회
const intlKey = () => (A.intl?.eventId ? `ev:${A.intl.eventId}` : null);
const seriesKey = (s) => (Date.now() - new Date(s.start) < 7 * 864e5 ? `ev:${s.eventId}` : null);
function spoil(html, key, label = '결과') {
  if (!opt.spoiler || !key || revealed.has(key)) return html;
  return `<div class="spoil-box"><button type="button" class="spoil-btn" data-reveal="${esc(key)}"><b>${esc(label)} 가림</b><span>스포일러 방지 중 · 눌러서 이 대회 결과 보기</span></button><div class="spoil-hidden" inert aria-hidden="true">${html}</div></div>`;
}
function reveal(key) { revealed.add(key); store.set('revealed', [...revealed].slice(-50)); render(); }

/* ---------- 문의·피드백 ---------- */
function feedbackUrl(kind, ctx = '') {
  const page = location.href;
  if (!C.feedback || C.feedback === 'github') {
    const body = `## 내용\n\n(여기에 적어 주세요)\n\n---\n- 종류: ${kind}\n- 보던 화면: ${page}\n- 화면 크기: ${innerWidth}×${innerHeight}${ctx ? `\n- 대상: ${ctx}` : ''}`;
    return `https://github.com/${C.feedbackRepo || 'LaplusSUGAR/algs-kr'}/issues/new?title=${encodeURIComponent(`[${kind}] ${ctx}`.trim())}&body=${encodeURIComponent(body)}`;
  }
  const u = new URL(C.feedback), F = C.feedbackFormFields || {};
  if (F.kind) u.searchParams.set(F.kind, kind);
  if (F.page) u.searchParams.set(F.page, page);
  if (F.body && ctx) u.searchParams.set(F.body, ctx);
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
const dayKey = (iso) => new Date(iso).toLocaleDateString('sv-SE', { timeZone: TZ });
const hhmm = (iso) => new Date(iso).toLocaleTimeString('ko-KR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
const WD = ['일', '월', '화', '수', '목', '금', '토'];
const dayLabel = (key) => { const [y, m, d] = key.split('-').map(Number); const wd = WD[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]; return `${String(m).padStart(2, '0')}.${String(d).padStart(2, '0')} (${wd})`; };
const dateTime = (iso) => `${dayLabel(dayKey(iso))} ${hhmm(iso)}`;
const fmt = (n) => (n ?? '–').toLocaleString('ko-KR');
const REGION = { 'apac-n': 'APAC North', 'apac-s': 'APAC South', emea: 'EMEA', americas: 'Americas', global: '국제전' };
const PHASE_KO = {
  'Group Stage': '조별 리그', 'Bracket Stage': '브래킷', 'Match Point Finals': '매치 포인트 결승', 'Survival Stage': '서바이벌 스테이지',
  'Winners Round': '승자 라운드', 'Elimination Round 1': '패자부활 1라운드', 'Elimination Round 2': '패자부활 2라운드',
  'Winners Round 1 Lobby A': '승자 1라운드 A로비', 'Winners Round 1 Lobby B': '승자 1라운드 B로비', 'Winners Round 2': '승자 2라운드',
  'Regional Finals': '리전 결승', 'Split 2 Pro League': '정규 시즌', 'Split 1 Pro League': '정규 시즌',
};
const EVENT_KO = { 'Split 2 Playoffs': 'Split 2 플레이오프', 'Split 1 Playoffs at EWC': 'Split 1 플레이오프', 'Split 2 Pro League': 'Split 2 프로리그', 'Split 1 Pro League': 'Split 1 프로리그', 'Last Chance Qualifier': 'LCQ', Championship: '챔피언십' };
const ko = (s, map) => map[s] || (s || '').replace(/^Group ([A-D]) vs ([A-D])$/, '$1조 vs $2조');
const team = (short) => A.teams[short];
const krOf = (short) => team(short)?.krLevel || 'none';
const KR_LABEL = { team: '한국 팀', member: '한국 선수 소속', coach: '한국 코치 팀' };
const kcOf = (short) => !!team(short)?.kc;
// 색 구분: 빨강 = 한국 팀(한국 선수 2명 이상), 주황 = 한국 선수 소속(1명), 파랑 = 한국 코치 팀(선수 없이 코치만)
// 한국 선수와 한국 코치가 모두 있는 팀은 한국 선수 기준(빨강·주황)으로만 표시한다.
const CAT = { team: 'k-team', member: 'k-member', coach: 'k-coach' };
const krDot = (lvl, short) => {
  if (!lvl || lvl === 'none') return '';
  return `<span class="krdot ${CAT[lvl]}" title="${KR_LABEL[lvl]}"></span>`;
};
const rowCls = (r) => (r.kr && r.kr !== 'none' ? `kr ${CAT[r.kr]}` : '');
const coachBadge = () => '';
const LP_SEASON = 'https://liquipedia.net/apexlegends/ALGS/2026-27';
// 공식 경기 페이지가 있는 이벤트(슬러그가 사람이 읽는 이름)는 algs.ea.com, 없으면(LCQ 등) Liquipedia 시즌 페이지
const officialUrl = (s) => (/^[a-z][a-z0-9-]+$/.test(s.eventSlug || '') && s.eventSlug !== 'last-chance-qualifier' ? `https://algs.ea.com/en/year-6/${s.eventSlug}/match/${s.id}` : LP_SEASON);
const olink = (url, label) => `<a class="olink" href="${esc(url)}" target="_blank" rel="noopener">${label}</a>`;
// 공식 팀 로고 (없으면 약칭 두 글자 상자). dark: 어두운 배경 위에 놓일 때
const logo = (short, cls = '', dark) => {
  const lg = team(short)?.logo;
  if (!lg) return `<span class="tlogo ph ${cls}" aria-hidden="true">${esc(String(short || '?').slice(0, 2))}</span>`;
  const d = dark ?? document.documentElement.dataset.theme === 'dark';
  // 공식 API의 logoLight = 밝은(흰) 로고 → 어두운 배경용, logoDark = 어두운 로고 → 밝은 배경용
  return `<img class="tlogo ${cls}" src="${esc(d ? lg[0] : lg[1])}" alt="" loading="lazy" decoding="async" onerror="this.style.visibility='hidden'">`;
};
const teamLink = (short, label) => (team(short) ? `<a class="tl" href="#/teams/${encodeURIComponent(short)}">${logo(short)}<span>${esc(label || short)}</span></a>` : esc(label || short));
const now = () => Date.now();
function until(iso) {
  const ms = new Date(iso) - now();
  if (ms <= 0) return null;
  const h = Math.floor(ms / 3.6e6), m = Math.floor((ms % 3.6e6) / 6e4);
  return h >= 48 ? `${Math.floor(h / 24)}일 후` : h ? `${h}시간 ${m}분 후` : `${m}분 후`;
}
const seriesState = (s) => s.status === 'completed' ? '종료' : s.live || s.status === 'live' ? 'LIVE' : until(s.start) || '시작 대기';

/* ---------- 라우터 ---------- */
function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs] = raw.split('?');
  return { parts: path.split('/').filter(Boolean), q: new URLSearchParams(qs || '') };
}
const qsLink = (path, q, patch) => { const p = new URLSearchParams(q); for (const [k, v] of Object.entries(patch)) p.set(k, v); return `#${path}?${p}`; };

function render() {
  const { parts, q } = parseHash();
  const tab = parts[0] || 'home';
  const navTab = tab === 'players' ? 'teams' : tab;
  document.querySelectorAll('.tabbar a').forEach((a) => { if (a.dataset.tab === navTab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  board();
  const view = { home, schedule, standings, points, teams, streams, rules, players: playerView }[tab] || home;
  app.innerHTML = subtabs(navTab, tab === 'players' ? ['teams', 'x'] : parts, q) + view(parts, q);
  bind();
}

/* ---------- 세부 탭 (각 탭 안의 하위 분류) ---------- */
// [이름, 주소, 지금 보고 있는지]
function subtabs(tab, parts, q) {
  const g = q.get('g') || 'all', sv = q.get('s') || 'all';
  const SUB = {
    schedule: [['예정 경기', '#/schedule', parts[1] !== 'replay' && q.get('view') !== 'results'], ['지난 결과', '#/schedule?view=results', parts[1] !== 'replay' && q.get('view') === 'results'], ['게임 다시보기', '#/schedule/replay', parts[1] === 'replay']],
    standings: A.intl ? [['결승', '#/standings/finals', parts[1] === 'finals'], ['브래킷', '#/standings/bracket', parts[1] === 'bracket' || (!parts[1] && !finalsFirstTab())], ['조별 리그', '#/standings/group', parts[1] === 'group']] : null,
    points: [['챔피언십 포인트', '#/points/cp', !['pl', 'events'].includes(parts[1])], ['대회별 CP 내역', '#/points/events', parts[1] === 'events'], ['프로리그 포인트', '#/points/pl', parts[1] === 'pl']],
    teams: [['전체', '#/teams', !parts[1] && g === 'all'], ['한국 관련', '#/teams?g=kr', g === 'kr'], ...['apac-n', 'apac-s', 'emea', 'americas'].map((r) => [REGION[r], `#/teams?g=${r}`, g === r])],
    streams: [['전체', '#/streams', sv === 'all'], ['멀티뷰', '#/streams?s=mv', sv === 'mv'], ['공식 중계', '#/streams?s=official', sv === 'official'], ['선수 방송', '#/streams?s=players', sv === 'players']],
    rules: [['전체', '#/rules', sv === 'all'], ['영상', '#/rules?s=video', sv === 'video'], ['대회 방식', '#/rules?s=format', sv === 'format'], ['점수·포인트', '#/rules?s=points', sv === 'points']],
  }[tab];
  if (!SUB) return '';
  return `<nav class="subtabs" aria-label="세부 메뉴"><div class="subtabs-in">${SUB.map(([n, h, on]) => `<a href="${h}"${on ? ' aria-current="page"' : ''}>${esc(n)}</a>`).join('')}</div></nav>`;
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
function bracket() {
  if (!A.intl?.eventId) return null;
  const ss = A.series.filter((s) => s.eventId === A.intl.eventId);
  const B = {};
  const g = ss.filter((s) => s.phase === 'Group Stage');
  B.gs = { ...STAGES[0], series: g, start: g.map((x) => x.start).sort()[0], status: g.length && g.every((x) => x.status === 'completed') ? 'completed' : g.some((x) => x.live) ? 'live' : g.some((x) => x.status === 'completed') ? 'live' : 'pending',
    teams: A.intl.rows.map((r) => r.short), src: 'results' };
  for (const S of STAGES.slice(1)) {
    const x = ss.find((y) => y.name === S.name || (S.key === 'f' && y.phase === 'Match Point Finals'));
    B[S.key] = { ...S, s: x, start: x?.start, status: !x ? 'none' : x.status === 'completed' ? 'completed' : x.live || x.status === 'live' ? 'live' : 'pending' };
  }
  const top = (st, a, b) => (st.s?.status === 'completed' && st.s.results ? st.s.results.filter((r) => r.pos >= a && r.pos <= b).map((r) => r.short) : null);
  const gsDone = B.gs.status === 'completed';
  const proj = {
    wr: gsDone ? A.intl.rows.filter((r) => r.pos <= 20).map((r) => r.short) : null,
    er1: gsDone ? A.intl.rows.filter((r) => r.pos > 20).map((r) => r.short) : null,
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
const stageState = (st) => (st.status === 'completed' ? '종료' : st.status === 'live' ? 'LIVE' : st.start ? until(st.start) || '시작 대기' : '일정 미정');
const krIn = (shorts) => shorts.filter((sh) => krOf(sh) !== 'none');
// 단계 결과에서 팀이 위로 갔는지 (null = 아직 모름)
const advanced = (st, short) => {
  if (st.key === 'gs') return st.status === 'completed' ? (A.intl.rows.find((r) => r.short === short)?.pos ?? 99) <= 20 : null;
  if (st.s?.status !== 'completed' || !st.s.results) return null;
  const r = st.s.results.find((x) => x.short === short);
  if (!r) return null;
  return st.key === 'f' ? !!r.won : r.pos <= st.cut;
};

// 홈 진출 구조 그림. 각 단계를 누르면 공식 경기 페이지로 간다.
function bracketFlow(B) {
  const W = 170, H = 96;
  const pos = { gs: [10, 68], wr: [240, 8], er1: [240, 128], er2: [470, 128], f: [700, 68] };
  // [from, to, 출발 y(노드 안 위치), 도착 y, 라벨, 라벨 x, 라벨 y]
  const edges = [
    ['gs', 'wr', 30, 48, '상위 20', 210, 70], ['gs', 'er1', 66, 48, '하위 20', 210, 160],
    ['wr', 'f', 30, 30, '상위 10', 640, 74], ['wr', 'er2', 72, 26, '하위 10', 436, 112],
    ['er1', 'er2', 48, 70, '상위 10', 440, 214], ['er2', 'f', 48, 72, '상위 10', 670, 196],
  ];
  const nextKey = B.list.find((st) => st.status === 'pending' || st.status === 'live')?.key;
  const edge = ([a, b, oy, iy, label, lx, ly]) => {
    const x1 = pos[a][0] + W, y1 = pos[a][1] + oy, x2 = pos[b][0], y2 = pos[b][1] + iy, mx = (x1 + x2) / 2;
    return `<path d="M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2 - 3} ${y2}" class="bf-edge" marker-end="url(#bfArrow)"/><text x="${lx}" y="${ly}" class="bf-elab" text-anchor="middle">${label}</text>`;
  };
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
    const url = st.key === 'gs' ? (st.series?.[0] ? officialUrl(st.series[0]).replace(/\/match\/.*/, '/schedule') : '#/standings') : st.s ? officialUrl(st.s) : '#/standings';
    const ext = url.startsWith('http');
    return `<a href="${esc(url)}" ${ext ? 'target="_blank" rel="noopener"' : ''} class="${cls}" aria-label="${esc(st.ko)} ${esc(stageState(st))}${ks.length ? ', 한국 관련 ' + ks.join(' ') : ''}">
      <rect x="${x}" y="${y}" width="${W}" height="${H}" rx="10" class="bf-box"/>
      <text x="${x + 12}" y="${y + 21}" class="bf-title">${esc(st.ko)}</text>
      <text x="${x + 12}" y="${y + 38}" class="bf-state">${esc(stageState(st))}</text>
      <text x="${x + 12}" y="${y + 53}" class="bf-sub">${st.n}팀${when ? ' · ' + when : ''}</text>
      ${ks.length ? '' : `<text x="${x + 12}" y="${y + 79}" class="bf-sub2">${st.teams?.length ? '한국 관련 팀 없음' : '출전 팀 미정'}</text>`}
      ${chips}</a>`;
  };
  return `<div class="bf-wrap"><svg class="bf" viewBox="0 0 880 232" role="group" aria-label="${esc(ko(A.intl.name, EVENT_KO))} 진출 구조">
    <defs><marker id="bfArrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L8 4 L0 8 z" class="bf-arrow"/></marker></defs>
    ${edges.map(edge).join('')}${B.list.map(node).join('')}</svg></div>`;
}

/* ---------- 홈 ---------- */
function home() {
  const krs = A.kr || [];
  const lead = krs.find((k) => k.level === 'team') || krs[0];
  const others = krs.filter((k) => k !== lead);
  const upcoming = A.series.filter((s) => s.status !== 'completed').sort((a, b) => a.start.localeCompare(b.start));
  const B = bracket();
  const showFlow = B && B.list.some((st) => st.status !== 'completed') && upcoming.some((s) => s.eventId === A.intl.eventId);
  const upList = `<div class="up-list">${upcoming.slice(0, 3).map(matchItem).join('') || '<p class="empty">예정된 경기가 없습니다.</p>'}</div>`;
  return `${showFlow ? `<section class="sec flow-sec" aria-labelledby="h-up">
      <div class="sec-head"><h2 class="h2" id="h-up">${esc(ko(A.intl.name, EVENT_KO))} 진출 구조</h2><a class="more" href="#/standings">전체 순위</a></div>
      <div class="flow-grid"><div>${spoil(bracketFlow(B), intlKey(), '진출 결과')}</div><div><h3 class="h3 up-h">다가오는 경기</h3>${upList}<a class="more" href="#/schedule">경기 전체</a></div></div>
    </section>` : ''}
    <div class="home-grid"><div class="col-a">
    ${lead ? heroCard(lead) : '<p class="empty">현재 시즌에 한국 팀 데이터가 없습니다.</p>'}
    ${others.length ? krStrip(others) : ''}
    </div><div class="col-b">
    ${A.intl ? `<section class="sec" aria-labelledby="h-now">
      <div class="sec-head"><h2 class="h2" id="h-now">지금 순위</h2><a class="more" href="#/standings">자세히 보기</a></div>
      ${spoil(B?.started ? stageMini(B) : intlMini(), intlKey(), '순위')}
    </section>` : ''}
    ${showFlow ? '' : `<section class="sec" aria-labelledby="h-up">
      <div class="sec-head"><h2 class="h2" id="h-up">다가오는 경기</h2><a class="more" href="#/schedule">경기 전체</a></div>
      ${upList}
    </section>`}
    ${seasonNext()}
    </div></div>`;
}

// 한국 선수·코치 팀: 홈에서는 작은 칩으로만, 자세한 내용은 팀 탭 '한국 관련'
const STAGE_SHORT = { gs: '조별', wr: '승자R', er1: '패자1R', er2: '패자2R', f: '결승' };
function stageShort(short) {
  const B = A.intl ? bracket() : null;
  const cp = (A.kr || []).find((k) => k.short === short)?.cp;
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
    <div class="sec-head"><h2 class="h2" id="h-kr2">한국 선수·코치 팀</h2><a class="more" href="#/teams?g=kr">자세히 보기</a></div>
    ${spoil(`<div class="kr-strip">${list.map((k) => `<a class="kchip ${CAT[k.level]}" href="#/teams/${encodeURIComponent(k.short)}" title="${esc(k.name)}">${logo(k.short)}<span><b>${esc(k.short)}</b><small>${esc(stageShort(k.short))}</small></span></a>`).join('')}</div>`, intlKey(), '한국 팀 성적')}
    ${krLegend()}
  </section>`;
}
// 홈: 시즌 일정은 지금·다음 일정 한 줄만
function seasonNext() {
  const t = now();
  const tl = A.season.timeline;
  const cur = tl.find((e) => t >= new Date(e.start + 'T00:00:00+09:00') && t <= new Date(e.end + 'T23:59:59+09:00'));
  const nx = tl.find((e) => new Date(e.start + 'T00:00:00+09:00') > t);
  const row = (e, tag) => e ? `<li><span class="tag ${tag === '진행 중' ? 'live' : ''}">${tag}</span> ${e.url ? olink(e.url, esc(e.name)) : esc(e.name)} <span class="when">${e.start.slice(5).replace('-', '.')}–${e.end.slice(5).replace('-', '.')} · ${esc(e.where)}</span></li>` : '';
  return `<section class="sec" aria-labelledby="h-season"><div class="sec-head"><h2 class="h2" id="h-season">${esc(A.season.name)} 일정</h2><a class="more" href="#/rules?s=format">전체 일정</a></div>
    <ul class="season-next">${row(cur, '진행 중')}${row(nx, '다음')}</ul></section>`;
}
const krLegend = () => `<p class="legend"><span><span class="krdot k-team"></span>한국 팀 (한국 선수 2명 이상)</span><span><span class="krdot k-member"></span>한국 선수 소속 (1명)</span><span><span class="krdot k-coach"></span>한국 코치 팀 (선수 없이 코치만)</span></p>`;

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
  if (last.status === 'live') return { text: `${last.ko} 진행 중${r ? ` (현재 ${r.pos}위 ${r.pts}점)` : ''}`, next: last.s };
  return { text: `${last.ko} ${last.src === 'projected' ? '진출 예정' : '출전'}, ${stageState(last)}`, next: last.s };
}
const krStage = (short) => krStageInfo(short).text;
function lineupLine(s) {
  if (!s.lineup?.length) return '';
  const ks = krIn(s.lineup);
  return `<div class="meta lineup">출전 ${s.lineup.length}팀 확정${ks.length ? ` · 한국 관련 ${ks.map((sh) => `${krDot(krOf(sh), sh)}${teamLink(sh)}${coachBadge(krOf(sh), sh)}`).join(' ')}` : ''}</div>`;
}

// 홈: 지금(또는 가장 최근) 브래킷 단계 요약
function stageMini(B) {
  const st = B.list.slice(1).find((x) => x.status === 'live') || B.list.slice(1).filter((x) => x.status === 'completed').at(-1) || B.list.slice(1).find((x) => x.teams?.length);
  if (!st) return intlMini();
  const res = st.s?.results;
  const rows = res ? res.filter((r, i) => i < 5 || r.kr !== 'none') : (st.teams || []).map((sh) => ({ short: sh, kr: krOf(sh), seed: A.intl.rows.find((r) => r.short === sh)?.pos })).filter((r, i) => i < 5 || r.kr !== 'none');
  return `<p class="lead" style="margin-top:4px"><b>${esc(st.ko)}</b> · ${esc(stageState(st))}${st.s?.games ? ` · ${st.s.games}게임째` : ''}</p>
  <div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>팀</th><th class="r">${res ? '점수' : '조별 순위'}</th>${res && st.cut ? `<th class="r">${st.status === 'completed' ? '결과' : '현재 기준'}</th>` : ''}</tr></thead><tbody>
  ${rows.map((r, i) => `<tr class="${rowCls(r)}"><td class="rank">${res ? r.pos : i + 1}</td><td class="team">${krDot(r.kr, r.short)}${teamLink(r.short)}${coachBadge(r.kr, r.short)}</td><td class="r num">${res ? r.pts : r.seed ?? '–'}</td>${res && st.cut ? `<td class="r small muted">${r.pos <= st.cut ? esc(st.up) : esc(st.down)}</td>` : ''}</tr>`).join('')}
  </tbody></table></div>`;
}

function heroCard(k) {
  const t = team(k.short);
  const si = A.intl ? krStageInfo(k.short) : { text: '', next: null };
  const next = A.intl && si.text ? si.next : k.nextSeries;
  const roster = (t?.roster?.filter((p) => p.r !== 'k').map((p) => p.n).join(', ') || k.krPlayers.join(', ')) + (t?.roster?.some((p) => p.r === 'k') ? ' · 코치 ' + t.roster.filter((p) => p.r === 'k').map((p) => p.n).join(', ') : '');
  return `<section class="kr-hero" aria-labelledby="h-hero">
    <span class="flag ${CAT[k.level] || ''}">${KR_LABEL[k.level] || ''}</span>
    <div class="hero-id">${logo(k.short, 'xl', true)}<h1 id="h-hero"><a href="#/teams/${encodeURIComponent(k.short)}" style="text-decoration:none">${esc(k.name)}</a></h1></div>
    <p class="roster">${esc(roster)}</p>
    ${spoil(`<div class="kr-stats">
      <div><b>${k.cp ? k.cp.rank + '위' : '–'}</b><span>챔피언십 포인트<br>${k.cp ? fmt(k.cp.total) + ' CP' : ''}</span></div>
      <div><b>${k.intl ? k.intl.pos + '위' : '–'}</b><span>${k.intl ? esc(ko(A.intl.name, EVENT_KO)) + '<br>조별 리그 ' + k.intl.of + '팀' : '국제전 미출전'}</span></div>
      <div><b>${k.pl ? k.pl.pos + '위' : '–'}</b><span>Split 2 프로리그<br>${REGION[t?.region] || ''}</span></div>
    </div>
    ${si.text ? `<p class="kr-where">지금 위치 · ${esc(si.text)}</p>` : ''}`, intlKey(), '성적')}
    ${next ? `<div class="kr-next"><span>${next.live || next.status === 'live' ? '진행 중' : '다음 경기'} · ${esc(ko(next.name, PHASE_KO))}<br><span style="opacity:.7">${dateTime(next.start)} KST</span></span><b>${esc(until(next.start) || '진행 중')}</b></div>` : ''}
  </section>`;
}

// 챔피언십 포인트 순위 위의 한국 팀 위치 (이 사이트의 대표 시각 요소)
function ringLine(krs) {
  const N = A.cp.length, cut = A.season.cpDirectSlots;
  if (!N) return '';
  const W = 440, L = 12, R = 428, y = 72;
  const x = (rank) => L + ((rank - 1) / (N - 1)) * (R - L);
  const pts = krs.filter((k) => k.cp).sort((a, b) => a.cp.rank - b.cp.rank);
  const lanesEnd = [-99, -99, -99, -99];
  const marks = pts.map((k) => {
    const px = x(k.cp.rank), half = (k.short.length + String(k.cp.rank).length + 1) * 3.6 + 4;
    let lane = lanesEnd.findIndex((e) => px - half > e);
    if (lane < 0) lane = 3;
    lanesEnd[lane] = px + half;
    const ly = y - 14 - lane * 15;
    const filled = k.level === 'team';
    const col = { team: 'var(--kr-team)', member: 'var(--kr-member)', coach: 'var(--coach)' }[k.level];
    return `<g class="marker"><line x1="${px}" y1="${ly + 3}" x2="${px}" y2="${y - 6}" stroke="${col}" stroke-width="1"/>
<circle cx="${px}" cy="${y}" r="5.5" fill="${col}" stroke="var(--paper)" stroke-width="1"/>
      <text x="${px}" y="${ly}" text-anchor="middle" font-size="11" font-weight="700" fill="var(--ink)">${esc(k.short)} ${k.cp.rank}</text></g>`;
  }).join('');
  const ticks = [1, 32, 60, 90, N].map((r) => `<text x="${x(r)}" y="${y + 22}" text-anchor="middle" font-size="10.5" fill="var(--steel)">${r}위</text>`).join('');
  return `<section class="ringline" aria-label="챔피언십 포인트 순위에서 한국 팀 위치">
    <svg viewBox="0 0 ${W} 104" role="img" aria-label="챔피언십 포인트 ${N}팀 중 한국 관련 팀 위치, ${cut}위까지 직행">
      <rect x="${L}" y="${y - 2}" width="${x(cut) - L}" height="4" rx="2" fill="var(--ink)"/>
      <rect x="${x(cut)}" y="${y - 1}" width="${R - x(cut)}" height="2" rx="1" fill="var(--rule)"/>
      <line x1="${x(cut) + 0.5}" y1="${y - 10}" x2="${x(cut) + 0.5}" y2="${y + 10}" stroke="var(--ink)" stroke-width="1.5" stroke-dasharray="2 2"/>
      ${ticks}${marks}
    </svg>
    <p class="caption">챔피언십 포인트 ${N}팀 중 위치 (${board().state === 'live' ? '실시간 정산' : board().state === 'pending' ? '최종 순위 정산' : '공식'} 기준). 굵은 선 안쪽(${cut}위까지)이 챔피언십 직행입니다.</p>
  </section>`;
}

function krRow(k) {
  const bits = [];
  if (k.intl) bits.push(`${ko(A.intl.name, EVENT_KO)} ${krStage(k.short)}`);
  if (k.pl) bits.push(`Split 2 프로리그 ${k.pl.pos}위`);
  return `<a class="kr-row" href="#/teams/${encodeURIComponent(k.short)}">
    <span class="who">${krDot(k.level, k.short)}${esc(k.name)}${coachBadge(k.level, k.short)}<small>${esc([k.krPlayers.join(', '), k.krCoaches?.length ? '코치 ' + k.krCoaches.join(', ') : ''].filter(Boolean).join(' · '))}</small></span>
    <span class="val">${k.cp ? 'CP ' + k.cp.rank + '위' : ''}</span>
    <span class="sub">${esc(bits.join(' / '))}${k.cp && k.cp.status !== 'direct' ? ` / 직행권까지 ${fmt(k.cp.gap)} CP 부족` : ''}</span>
  </a>`;
}

function intlMini() {
  const rows = A.intl.rows;
  const show = rows.filter((r, i) => i < 5 || r.kr !== 'none');
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>팀</th><th class="r">점수</th><th class="r">다음 단계</th></tr></thead><tbody>
    ${show.map((r) => `<tr class="${rowCls(r)}"><td class="rank">${r.pos}</td><td class="team">${krDot(r.kr, r.short)}${teamLink(r.short, r.name)}${coachBadge(r.kr, r.short)}</td><td class="r num">${r.pts}</td><td class="r small muted">${esc(ko(r.next, PHASE_KO))}</td></tr>`).join('')}
  </tbody></table></div>
  <p class="lead">조별 리그 누적 기준. 상위 ${A.intl.winnersCut}팀은 승자 라운드, 나머지는 패자부활 라운드로 갑니다.</p>`;
}

function seasonTimeline() {
  const t = now();
  return `<ol class="timeline">${A.season.timeline.map((e) => {
    const s = new Date(e.start + 'T00:00:00+09:00'), en = new Date(e.end + 'T23:59:59+09:00');
    const cls = t > en ? 'done' : t >= s ? 'now' : '';
    return `<li class="${cls}"><span>${e.url ? olink(e.url, esc(e.name)) : esc(e.name)}<br><span class="when">${esc(e.where)}</span></span><span class="when">${e.start.slice(5).replace('-', '.')}–${e.end.slice(5).replace('-', '.')}</span></li>`;
  }).join('')}</ol>`;
}

/* ---------- 경기 ---------- */
function isKrSeries(s) {
  if (s.kr.length) return true;
  if (s.status !== 'completed') {
    if ((A.kr || []).some((k) => k.intl && s.eventId === A.intl?.eventId && k.intl.next === s.name)) return true;
    if (s.eventId === A.intl?.eventId && s.mp) return true;
    if (s.region === 'apac-n') return true;
  }
  return false;
}

function matchItem(s) {
  const state = seriesState(s);
  const tags = [s.mp ? '<span class="tag mp">매치 포인트</span>' : '', s.live ? `<span class="tag live">LIVE${s.games ? ` ${s.games}/${s.matches || '?'}게임` : ''}</span>` : '', s.liveFinal ? '<span class="tag">공식 결과 반영</span>' : '', isKrSeries(s) ? '<span class="tag kr">한국</span>' : ''].join(' ');
  let res = '';
  if (s.results?.length) {
    const top = s.results[0];
    const krs = s.results.filter((r) => r.kr !== 'none');
    const mpTag = (r) => (r.won ? ' <span class="tag mpe">우승</span>' : r.mpe ? ' <span class="tag mpe">MP</span>' : '');
    const inner = `<span><b>1위 ${teamLink(top.short)}</b> ${top.pts}점${mpTag(top)}</span>${krs.filter((r) => r !== top).map((r) => `<span>${krDot(r.kr, r.short)}${teamLink(r.short)}${coachBadge(r.kr, r.short)} ${r.pos}위 ${r.pts}점 (${r.kills}킬)${mpTag(r)}</span>`).join('')}${s.liveAt ? `<span class="upd">${ago(s.liveAt)} 공식 API 확인</span>` : ''}`;
    const full = s.results.length > 5 ? `<details><summary>${s.eventSlug.includes('pro-league') ? '상위 3팀과 한국 관련 팀 표' : `전체 ${s.results.length}팀 결과`}</summary>${resultTable(s.results)}</details>` : '';
    res = spoil(`<div class="res">${inner}</div>${full}`, seriesKey(s)) + `<a class="more rp-link" href="#/schedule/replay?s=${s.id}">게임 다시보기</a>`;
  }
  return `<article class="match">
    <time datetime="${s.start}">${hhmm(s.start)}</time>
    <div><div class="what">${olink(officialUrl(s), esc(ko(s.name, PHASE_KO)))} ${tags}</div>
      <div class="meta">${esc([ko(s.event, EVENT_KO), s.name === 'Regional Finals' ? '' : ko(s.phase, PHASE_KO), REGION[s.region], s.status !== 'completed' ? state : ''].filter(Boolean).join(', '))}</div>
      ${res || lineupLine(s)}</div>
  </article>`;
}

const resultTable = (rows) => `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>팀</th><th class="r">점수</th><th class="r opt">킬</th></tr></thead><tbody>${rows.map((r) => `<tr class="${rowCls(r)}"><td class="rank">${r.pos}</td><td class="team">${krDot(r.kr, r.short)}${teamLink(r.short)}${coachBadge(r.kr, r.short)}</td><td class="r num">${r.pts}</td><td class="r opt">${r.kills}</td></tr>`).join('')}</tbody></table></div>`;

/* ---------- 게임 다시보기: 공식 게임 결과로 탈락 순서를 재생 ---------- */
// 공식 API는 게임 중 위치를 주지 않으므로, 게임별 최종 순위(= 탈락 순서)·킬·레전드·밴과 VOD 시점으로 다시 본다.
const RP = {};
async function loadReplay(sid) {
  if (RP[sid]?.loading) return;
  RP[sid] = { loading: true };
  const api = LIVE.api, j = (u) => fetch(api + u).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const [m, vt, v] = await Promise.all([j(`/series/${sid}/matches`), j(`/series/${sid}/vods/timeline`), j(`/series/${sid}/vods`)]);
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
    const tv = D.vods.find((x) => x.vodType === 'multiview_team' && x.team?.shortName === sh && x.vodProvider === 'youtube');
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
  if (!D || D.loading) { loadReplay(s.id); return head + '<p class="empty">공식 경기 기록을 불러오는 중…</p>'; }
  if (!D.matches.length) return head + '<p class="empty">이 시리즈의 게임 기록이 아직 없습니다.</p>';
  const g = Math.min(Math.max(1, +(q.get('g') || 1)), D.matches.length);
  const m = D.matches.at(g - 1), st = D.stats.at(g - 1);
  const tabs = `<div class="seg rp-games" role="group" aria-label="게임">${D.matches.map((x, i) => `<a href="${qsLink('/schedule/replay', q, { s: s.id, g: i + 1 })}" aria-current="${i + 1 === g}">G${x.matchNumber} <small>${esc(x.map?.name || '')}</small></a>`).join('')}</div>`;
  if (!st?.teams?.length) return head + tabs + '<p class="empty">이 게임의 결과가 아직 없습니다.</p>';
  const teams = st.teams.map((t) => ({ short: t.shortName, name: t.name, place: t.placement, kills: t.kills, pts: t.points, players: (t.players || []).map((p) => ({ n: p.name, k: p.kills, lg: p.character?.name || '' })), kr: krOf(t.shortName) }));
  const N = teams.length;
  // 탈락 순서: 낮은 순위부터. step = 지금까지 탈락한 팀 수 (N-1이면 우승 확정)
  const order = teams.slice().sort((a, b) => b.place - a.place);
  window.__rp = { order: order.map((t) => t.short), N };
  const krs = teams.filter((t) => t.kr !== 'none').map((t) => t.short);
  const bans = (m.bannedCharacters || []).map((b) => b.character?.name).filter(Boolean);
  const dur = m.playStartedAt && m.completedAt ? Math.round((new Date(m.completedAt) - new Date(m.playStartedAt)) / 60000) : null;
  const cards = teams.slice().sort((a, b) => a.short.localeCompare(b.short)).map((t) => `<div class="rp-team ${rowCls(t)}" data-team="${esc(t.short)}">${logo(t.short)}<b>${esc(t.short)}</b><small class="rp-state">생존</small></div>`).join('');
  const log = order.map((t, i) => `<li class="rp-ev ${rowCls(t)}" data-step="${i + 1}" hidden><span class="rp-place">${t.place}위</span> ${teamLink(t.short)} ${t.place === 1 ? '<b class="rp-win">챔피언</b>' : '탈락'} <span class="muted">· ${t.kills}킬 ${t.pts}점</span></li>`).reverse().join('');
  const detail = `<details class="rp-detail"><summary>팀별 레전드·킬 보기</summary><div class="tbl-wrap"><table class="tbl"><thead><tr><th>순위</th><th>팀</th><th>선수 (레전드, 킬)</th><th class="r">점수</th></tr></thead><tbody>
    ${teams.slice().sort((a, b) => a.place - b.place).map((t) => `<tr class="${rowCls(t)}"><td class="rank">${t.place}</td><td class="team">${teamLink(t.short)}</td><td class="small">${t.players.map((p) => `${esc(p.n)} <span class="muted">(${esc(p.lg)}, ${p.k})</span>`).join(', ')}</td><td class="r num">${t.pts}</td></tr>`).join('')}
    </tbody></table></div></details>`;
  return head + tabs + `
    <section class="sec rp">
      <div class="rp-meta"><b>${esc(ko(s.name, PHASE_KO))} · 게임 ${m.matchNumber}</b> <span class="muted">${esc(m.map?.name || '')}${dur ? ` · ${dur}분` : ''}${m.playStartedAt ? ` · ${dateTime(m.playStartedAt)} KST` : ''}</span>${bans.length ? `<span class="rp-bans">밴: ${bans.map(esc).join(', ')}</span>` : ''}</div>
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
      el.querySelector('.rp-state').textContent = win ? '챔피언' : out ? `${N - i}위 탈락` : '생존';
    });
    app.querySelectorAll('.rp-ev').forEach((li) => { li.hidden = +li.dataset.step > step + (step === N - 1 ? 1 : 0); });
    document.getElementById('rpCount').textContent = step === N - 1 ? '게임 종료' : `${N - step}팀 생존`;
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

function schedule(parts, q) {
  if (parts[1] === 'replay') return replayView(q);
  const view = q.get('view') === 'results' ? 'results' : 'upcoming';
  const kronly = q.get('kr') === '1';
  let list = A.series.filter((s) => (view === 'results' ? s.status === 'completed' : s.status !== 'completed'));
  if (kronly) list = list.filter(isKrSeries);
  list.sort((a, b) => (view === 'results' ? b.start.localeCompare(a.start) : a.start.localeCompare(b.start)));
  const days = {};
  for (const s of list) (days[dayKey(s.start)] ||= []).push(s);
  return `<h1 class="title">경기</h1><p class="lead">모든 시간은 한국 시간(KST)입니다. 한 시리즈는 보통 6게임입니다.</p>
    ${refreshNote(true)}
    <div class="controls">
      <div class="seg"><a href="${qsLink('/schedule', q, { kr: kronly ? '0' : '1' })}" aria-current="${kronly}">한국 팀 경기만</a></div>
    </div>
    <div class="days">${Object.entries(days).map(([d, ss]) => `<section class="day"><h2 class="day-h">${dayLabel(d)}<small>${ss.length}시리즈</small></h2>${ss.map(matchItem).join('')}</section>`).join('') || '<p class="empty">조건에 맞는 경기가 없습니다. 필터를 끄면 전체 경기를 볼 수 있습니다.</p>'}</div>`;
}

/* ---------- 순위 (진행 중 국제전) ---------- */
// 결승이 시작됐거나 끝났으면 순위 탭은 결승부터 보여 준다
function finalsFirstTab() { const B = A.intl ? bracket() : null; return !!B?.f?.s && (B.f.status === 'live' || B.f.status === 'completed'); }
function standings(parts) {
  if (!A.intl) return '<h1 class="title">순위</h1><p class="empty">진행 중인 국제전이 없습니다. 프로리그 순위는 포인트 탭에서 볼 수 있습니다.</p>';
  const ev = A.intl, B = bracket();
  const phases = B.list.map((st) => `<li class="${st.status === 'completed' ? 'done' : st.status === 'live' ? 'now' : ''}"><span>${st.s ? olink(officialUrl(st.s), esc(st.ko)) : esc(st.ko)}</span><span class="when">${st.start ? dateTime(st.start) : ''}</span></li>`).join('');
  const head = `<h1 class="title">순위</h1>
    <p class="lead">${esc(ko(ev.name, EVENT_KO))}. ${parts[1] === 'finals' || (!parts[1] && finalsFirstTab()) ? '매치 포인트 결승 20팀의 점수입니다.' : B.started && parts[1] !== 'group' ? '위는 승자조, 아래는 패자조입니다.' : '조별 리그 누적 점수입니다.'}</p>
    ${refreshNote()}
    <section class="sec"><ol class="timeline tl-row">${phases}</ol></section>`;
  if (!B.started || parts[1] === 'group') return head + spoil(`<section class="sec">${groupTable(ev)}</section>${B.started ? `<section class="sec"><h2 class="h2">조별 리그 시리즈</h2>${B.gs.series.slice().reverse().map(matchItem).join('')}</section>` : ''}`, intlKey(), '조별 리그 순위');
  const f = B.f;
  const finals = f.s ? `<section class="sec bk bk-final" aria-labelledby="h-f"><h2 class="h2 bk-h" id="h-f">매치 포인트 결승</h2>${stageTable(f)}</section>` : '<p class="empty">결승 일정이 아직 없습니다.</p>';
  // 결승 탭: 결승이 시작됐으면 순위 탭의 기본 화면
  if (parts[1] === 'finals' || (!parts[1] && finalsFirstTab())) return head + spoil(finals + `<section class="sec past-link"><a class="btn-link ghost" href="#/standings/bracket">결승까지 온 길: 브래킷 보기</a></section>`, intlKey(), '결승 결과');
  return head + spoil(`
    <section class="sec bk bk-upper" aria-labelledby="h-up2"><h2 class="h2 bk-h" id="h-up2"><span class="bk-badge up">승자조</span></h2>${stageTable(B.wr)}</section>
    <section class="sec bk bk-lower" aria-labelledby="h-lo"><h2 class="h2 bk-h" id="h-lo"><span class="bk-badge low">패자조</span></h2>
      <div class="bk-cols">${stageTable(B.er1)}${stageTable(B.er2)}</div></section>
    ${f.s ? `<section class="sec past-link"><a class="btn-link ghost" href="#/standings/finals">다음: 매치 포인트 결승 보기</a></section>` : ''}
    <section class="sec past-link"><a class="btn-link ghost" href="#/standings/group">지난 결과: 조별 리그 순위와 시리즈 결과 보기</a></section>`, intlKey(), '브래킷 결과');
}

function groupTable(ev) {
  let rows = ev.rows;
  if (opt.krOnly) rows = rows.filter((r) => r.kr !== 'none');
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>팀</th><th class="c opt">조</th><th class="r">점수</th><th class="r opt">킬</th><th class="r">다음 단계</th></tr></thead><tbody>
      ${rows.map((r) => `<tr class="${rowCls(r)} ${!opt.krOnly && r.pos === ev.winnersCut ? 'cut' : ''}"><td class="rank">${r.pos}</td><td class="team">${krDot(r.kr, r.short)}${teamLink(r.short, r.name)}${coachBadge(r.kr, r.short)}<small>${esc(REGION[r.region] || '')}</small></td><td class="c opt">${esc(r.group)}</td><td class="r num">${r.pts}</td><td class="r opt">${r.kills}</td><td class="r small muted">${esc(ko(r.next, PHASE_KO))}</td></tr>${!opt.krOnly && r.pos === ev.winnersCut ? `<tr class="cut-label"><td colspan="6">여기까지 승자 라운드, 아래는 패자부활 1라운드</td></tr>` : ''}`).join('')}
    </tbody></table></div>`;
}

// 브래킷 한 단계: 결과가 있으면 점수표, 없으면 출전 명단(확정 또는 예상)
function stageTable(st) {
  const x = st.s;
  const tag = st.status === 'live' ? `<span class="tag live">LIVE${x?.games ? ` ${x.games}/${x.matches || 6}게임` : ''}</span>` : st.status === 'completed' ? '<span class="tag">종료</span>' : `<span class="tag">${esc(stageState(st))}</span>`;
  const top = `<div class="bk-stage-h"><h3 class="h3">${x ? olink(officialUrl(x), esc(st.ko)) : esc(st.ko)}</h3> ${tag}${x?.mp ? ' <span class="tag mp">매치 포인트</span>' : ''}<span class="when">${st.start ? dateTime(st.start) + ' KST' : ''}</span></div>`;
  const res = x?.results;
  let body;
  if (res?.length) {
    let rows = res;
    if (opt.krOnly) rows = rows.filter((r) => r.kr !== 'none');
    const out = (r) => (st.cut ? (r.pos <= st.cut ? `<span class="adv up">${esc(st.up)}</span>` : `<span class="adv ${st.down === '탈락' ? 'out' : 'down'}">${esc(st.down)}</span>`) : r.won ? '<span class="tag mpe">우승</span>' : r.mpe ? '<span class="tag mpe">MP</span>' : '');
    body = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>팀</th><th class="r">점수</th><th class="r opt">킬</th><th class="r">${st.cut ? (st.status === 'completed' ? '결과' : '현재 기준') : ''}</th></tr></thead><tbody>
      ${rows.map((r) => `<tr class="${rowCls(r)} ${!opt.krOnly && st.cut && r.pos === st.cut ? 'cut' : ''}"><td class="rank">${r.pos}</td><td class="team">${krDot(r.kr, r.short)}${teamLink(r.short)}${coachBadge(r.kr, r.short)}</td><td class="r num">${r.pts}</td><td class="r opt">${r.kills}</td><td class="r small">${out(r)}</td></tr>${!opt.krOnly && st.cut && r.pos === st.cut ? `<tr class="cut-label"><td colspan="5">여기까지 ${esc(st.up)}</td></tr>` : ''}`).join('')}
    </tbody></table></div>${x.liveAt ? `<p class="caption">${ago(x.liveAt)} 공식 API 확인</p>` : ''}`;
  } else if (st.teams?.length) {
    let ts = st.teams.map((sh) => ({ short: sh, kr: krOf(sh), g: A.intl.rows.find((r) => r.short === sh) }));
    ts.sort((a, b) => (a.g?.pos ?? 99) - (b.g?.pos ?? 99));
    if (opt.krOnly) ts = ts.filter((r) => r.kr !== 'none');
    body = `<p class="caption">${st.src === 'official' ? '공식 출전 명단' : '앞 단계 결과로 계산한 예상 명단'} ${st.teams.length}팀. 경기가 시작되면 점수표로 바뀝니다.</p>
      <div class="lineup-grid">${ts.map((r) => `<span class="lu ${rowCls(r)}">${krDot(r.kr, r.short)}${teamLink(r.short)}${coachBadge(r.kr, r.short)}<small>${r.g ? `조별 ${r.g.pos}위` : ''}</small></span>`).join('')}</div>`;
  } else body = '<p class="empty">앞 단계가 끝나면 출전 팀이 정해집니다.</p>';
  const rule = st.cut ? `<p class="bk-rule">상위 ${st.cut}팀 ${esc(st.up)} · 하위 ${st.n - st.cut}팀 ${esc(st.down)}</p>` : st.key === 'f' ? `<p class="bk-rule">매치 포인트 ${x?.mpThreshold || 50}점 도달 후 게임 1위를 하면 우승</p>` : '';
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
    const { e, r } = x, pend = x === pendItem, excl = counted && !pend && !counted.has(x);
    const other = curShort && r.short && r.short !== curShort;
    const tip = `${e.label} · ${r.name || r.short} ${r.pos}위${pend ? ' · 공식 합계에 아직 반영 안 됨' : ''}${excl ? ' · 팀 합계 제외 (그 대회에서 이 팀과 12경기 미만 출전 등)' : ''}${other ? ' · 다른 팀 소속 때 받은 CP (선수에게 귀속)' : ''}`;
    return `<span class="cpb-i ${e.kind}${pend ? ' pend' : ''}${excl ? ' excl' : ''}" title="${esc(tip)}"><i>${esc(e.short)}${other ? ` · ${esc(r.short)}` : ''}</i> ${r.pos}위 <b>${pend ? '+' : ''}${fmt(r.cp)}</b>${pend ? ' <small>반영 대기</small>' : excl ? ' <small>합산 제외</small>' : ''}</span>`;
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
// 선수 단위 정산. CP는 선수에게 귀속된다:
//  - 이번 대회에 실제로 뛴 선수(공식 출전 로스터, 대체 선수 포함)만 그 팀 순위의 CP를 받는다
//  - 비자 문제 등으로 빠진 선수(config cpSubs.out)는 받지 않는다
//  - 대체 선수(cpSubs.in)는 출전 팀 순위의 CP를 받아 원래 소속팀(home) 합계에 들어간다
//  - 팀 CP = 후보 선수(공식 상위 3인 + 이번 대회 CP를 받은 소속 선수) 중 상위 3인 합
function settleRows(ST) {
  const nk = (n) => String(n || '').trim().toLowerCase();
  const subs = A.cpSubs?.[ST.e.slug] || [];
  const outOf = new Map(subs.map((x) => [x.team, new Set((x.out || []).map(nk))]));
  const credit = new Map(); // 선수ID → { min, max, team, pos }
  const give = (pid, c) => { if (pid) credit.set(pid, c); };
  const rosterOf = (short) => (A.poRosters?.[short] || []);
  for (const r of ST.e.rows) if (r.id) for (const [pid, n] of r.players) if (!outOf.get(r.short)?.has(nk(n))) give(pid, { min: r.cp, max: r.cp, team: r.short, pos: r.pos });
  for (const ir of A.intl?.rows || []) {
    if (!ST.alive(ir.id)) continue;
    for (const [pid, n, role] of rosterOf(ir.short)) if (role !== 'k' && !outOf.get(ir.short)?.has(nk(n))) give(pid, { min: ST.minCp, max: ST.maxCp, team: ir.short });
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
      if (placed) give(pid, { min: placed.cp, max: placed.cp, team: sb.team, pos: placed.pos });
      else if (alive) give(pid, { min: ST.minCp, max: ST.maxCp, team: sb.team });
      if (x.home) { if (!homeExtra.has(x.home)) homeExtra.set(x.home, []); homeExtra.get(x.home).push({ pid, name: x.name, team: sb.team }); }
    }
    for (const n of sb.out || []) { const pid = pidOf(n); if (pid && credit.get(pid)?.team === sb.team) credit.delete(pid); }
  }
  // 선수의 이번 대회 전 CP: 공식 값이 있으면 그 값(이번 대회가 이미 들어갔으면 뺌), 없으면 대회 기록 합
  const base = (pid, official) => {
    const h = cpHistory(pid), live = h.find((x) => x.e.id === ST.e.id);
    if (official == null) return h.filter((x) => x !== live).reduce((a, x) => a + x.r.cp, 0);
    const ic = intlCounted(pid, official);
    return official - (live && ic.counted ? live.r.cp : 0);
  };
  const nameOf = new Map();
  for (const e of A.cpEvents || []) for (const r of e.rows) for (const [id, n] of r.players) nameOf.set(id, n);
  return A.cp.map((r) => {
    const cands = new Map();
    for (const [n, p, id] of r.players) if (id) cands.set(id, { n, off: p });
    // 이 팀 소속으로 이번 대회 CP를 받은 선수(정규 로스터가 그대로 출전) + 다른 팀에 대체로 나간 소속 선수
    for (const [pid, c] of credit) if (c.team === r.short && !cands.has(pid) && !subIn.has(pid)) cands.set(pid, { n: nameOf.get(pid) || '', off: null });
    const notes = [];
    for (const x of homeExtra.get(r.short) || []) {
      if (!cands.has(x.pid)) cands.set(x.pid, { n: x.name, off: null });
      const c = credit.get(x.pid);
      notes.push(`${x.name} ${x.team} 대체 출전${c ? (c.pos ? ` ${c.pos}위 +${fmt(c.min)}` : ` 최소 +${fmt(c.min)}`) : ''}`);
    }
    const sb = subs.find((x) => x.team === r.short);
    if (sb) notes.push(`${(sb.out || []).join('·') || '로스터 일부'} ${sb.reason || ''} 결장 → ${(sb.in || []).map((x) => x.name).join('·')} 대체`);
    const vals = [...cands].map(([pid, v]) => {
      // 공식 상위 3인 밖의 선수는 지금까지 이 팀 합계에 들어간 CP가 없다고 본다 (12경기 규정 등으로 빠진 선수 포함). 이번 대회 CP만 더함
      const b = v.off == null ? 0 : base(pid, v.off), c = credit.get(pid);
      // 대체 선수가 소속팀 합계에 들어가려면 그 선수가 이 팀 소속이어야 함: 다른 팀(출전 팀)의 후보에서는 제외
      const away = c && c.team !== r.short && !(homeExtra.get(r.short) || []).some((x) => x.pid === pid);
      return { pid, n: v.n, min: b + (c && !away ? c.min : 0), max: b + (c && !away ? c.max : 0), got: c && !away ? c : null };
    });
    const top = (k) => vals.slice().sort((a, b) => b[k] - a[k]).slice(0, 3).reduce((a, x) => a + x[k], 0);
    const min = top('min'), max = top('max');
    const alive = ST.alive(r.id), pl = ST.placed.get(r.id);
    return { ...r, alive, donePos: pl?.pos, pend: min !== r.total && !alive && !!pl, notes, min, max, gain: min - r.total };
  });
}

let BOARD = null;
function board() {
  if (BOARD && BOARD.cp === A.cp && BOARD.ev === A.cpEvents && BOARD.subs === A.cpSubs) return BOARD;
  const ST = settle();
  const cut = A.season.cpDirectSlots;
  const rows = ST ? settleRows(ST) : A.cp.map((r) => ({ ...r, alive: false, pend: false, notes: [], min: r.total, max: r.total }));
  rows.sort((a, b) => b.min - a.min || b.total - a.total);
  rows.forEach((r, i) => (r.prank = i + 1));
  const c32 = rows.at(cut - 1)?.min ?? 0, c33 = rows.at(cut)?.min ?? 0;
  for (const r of rows) { r.pstatus = r.prank <= cut ? 'direct' : 'lcq'; r.pgap = r.prank <= cut ? r.min - c33 : c32 - r.min; }
  const state = !ST ? 'none' : ST.open ? 'live' : rows.some((r) => r.pend) ? 'pending' : 'confirmed';
  BOARD = { cp: A.cp, ev: A.cpEvents, subs: A.cpSubs, ST, rows, state, pendTeams: rows.filter((r) => r.pend).length };
  // 화면 곳곳(홈 카드, 한국 팀 카드, 팀 목록, 위치 그림)의 CP 순위도 이 값으로 맞춘다
  for (const k of A.kr || []) { const x = rows.find((y) => y.short === k.short); if (x) k.cp = { rank: x.prank, total: x.min, gap: x.pgap, status: x.pstatus, off: { rank: x.rank, total: x.total } }; }
  for (const t of Object.values(A.teams)) { const x = rows.find((y) => y.id === t.id); if (x) t.cp = { rank: x.prank, total: x.min }; }
  return BOARD;
}
const BOARD_NOTE = {
  live: (b) => `<b>실시간 정산</b> ${esc(b.ST.e.label)} 진행 중 · 순위가 정해진 팀은 그 CP를, 아직 경기 중인 팀은 최소 보장 CP(1인 ${fmt(b.ST.minCp)})를 더한 값입니다. 대회가 끝나면 최종 순위로 확정됩니다.`,
  pending: (b) => `<b>확정</b> ${esc(b.ST.e.label)} 최종 순위까지 반영한 값입니다.`,
  confirmed: (b) => `<b>확정</b> ${esc(b.ST.e.label)} 최종 순위까지 반영한 값입니다.`,
};
const boardNote = () => {
  const b = board();
  if (!BOARD_NOTE[b.state]) return '';
  const subs = A.cpSubs?.[b.ST.e.slug] || [];
  const subLine = subs.length ? `<br><b>대체 출전 반영</b> ${subs.map((x) => `${esc(x.team)}: ${esc((x.out || []).join('·') || '결장 선수')} → ${esc((x.in || []).map((y) => `${y.name}(${y.home})`).join('·'))}`).join(' / ')}. 빠진 선수는 이번 대회 CP를 받지 않고, 대체 선수의 CP는 원래 소속팀 합계에 들어갑니다.` : '';
  return `<p class="board-note ${b.state}">${BOARD_NOTE[b.state](b)}${subLine}</p>`;
};

function cpView(q) {
  const mode = q.get('m') === 'players' ? 'players' : 'teams';
  const region = q.get('r') || 'all';
  const cut = A.season.cpDirectSlots;
  const krNames = new Set(Object.values(A.teams).flatMap((t) => t.krPlayers || []));
  const regionSeg = `<div class="seg" role="group" aria-label="지역">${['all', 'apac-n', 'apac-s', 'emea', 'americas'].map((r) => `<a href="${qsLink('/points/cp', q, { r })}" aria-current="${region === r}">${r === 'all' ? '전체' : REGION[r]}</a>`).join('')}</div>`;
  const modeSeg = `<div class="seg" role="group" aria-label="단위"><a href="${qsLink('/points/cp', q, { m: 'teams' })}" aria-current="${mode === 'teams'}">팀</a><a href="${qsLink('/points/cp', q, { m: 'players' })}" aria-current="${mode === 'players'}">선수</a></div>`;
  const krSummary = (A.kr || []).filter((k) => k.cp).map((k0) => ({ ...k0, cp: q.get('v') === 'now' && k0.cp.off ? { ...k0.cp, ...k0.cp.off } : k0.cp })).sort((a, b) => a.cp.rank - b.cp.rank).map((k) => `<tr class="${rowCls({ kr: k.level, short: k.short })}"><td class="rank">${k.cp.rank}</td><td class="team">${krDot(k.level, k.short)}${teamLink(k.short, k.name)}${coachBadge(k.level, k.short)}</td><td class="r num">${fmt(k.cp.total)}</td><td class="r small opt">${k.cp.status === 'direct' ? `<span class="tag ok">직행권</span> 33위와 +${fmt(k.cp.gap)}` : `32위까지 −${fmt(k.cp.gap)}`}</td></tr>`).join('');

  const BD = board(), ST = BD.ST;
  const settling = BD.state === 'live' || BD.state === 'pending';
  // 기본은 정산값. 대회가 끝나 공식 합계와 대조가 끝나면(confirmed) 공식 값을 그대로 보여 줌
  // 정산값이 곧 표시값. 대회가 끝나면 최종 순위로 정산된 값이 그대로 확정값이 된다 (공식 합계와의 대조는 내부에서만)
  const view = settling && mode === 'teams' ? 'min' : 'now';
  const viewSeg = '';
  let table;
  if (view === 'min') {
    let rows = BD.rows.filter((r) => (region === 'all' || r.region === region) && (!opt.krOnly || r.kr !== 'none'));
    table = `    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>팀</th><th class="r opt">대회 전</th><th class="r opt2">${esc(ST.e.short)}</th><th class="r">${BD.state === 'live' ? '정산 (최소 보장)' : '정산'}</th><th class="r opt">최대</th></tr></thead><tbody>
      ${rows.map((r) => { const isCut = region === 'all' && !opt.krOnly && r.prank === cut; return `<tr class="${rowCls(r)} ${isCut ? 'cut' : ''}"><td class="rank">${r.prank}<small class="mv">${r.prank < r.rank ? '▲' + (r.rank - r.prank) : r.prank > r.rank ? '▼' + (r.prank - r.rank) : ''}</small></td><td class="team">${krDot(r.kr, r.short)}${teamLink(r.short, r.name)}<small class="sm-only">${r.alive ? `${esc(ST.e.short)} 진행 중 · 최소 +${fmt(r.gain)}` : r.donePos ? `${esc(ST.e.short)} ${r.donePos}위${r.gain > 0 ? ` +${fmt(r.gain)}` : ''}` : r.gain ? `대체 출전 +${fmt(r.gain)}` : ''}${r.notes.length ? `<br>${r.notes.map(esc).join('<br>')}` : ''}</small></td><td class="r opt num">${fmt(r.total)}</td><td class="r small opt2">${r.alive ? `<span class="tag live">진행 중</span> 최소 +${fmt(r.gain)}` : r.donePos ? `${r.donePos}위${r.gain > 0 ? ` <span class="muted">+${fmt(r.gain)}</span>` : ''}` : r.gain ? `<span class="muted">+${fmt(r.gain)}</span>` : '<span class="muted">미출전</span>'}${r.notes.length ? `<small class="sub-note">${r.notes.map(esc).join('<br>')}</small>` : ''}</td><td class="r num"><b>${fmt(r.min)}</b></td><td class="r opt num muted">${fmt(r.max)}</td></tr>${isCut ? `<tr class="cut-label"><td colspan="6">여기까지 최소 보장 기준 챔피언십 직행권</td></tr>` : ''}`; }).join('')}
    </tbody></table></div>
    <p class="lead">팀 CP는 상위 3인 합이라, 결승 진출 팀은 '1인 최저 CP × 3'을 더했습니다. '최대'는 우승했을 때입니다.</p>`;
  } else if (mode === 'teams') {
    let rows = A.cp.filter((r) => region === 'all' || r.region === region);
    if (opt.krOnly) rows = rows.filter((r) => r.kr !== 'none');
    table = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>팀</th><th class="r">CP</th><th class="r">상태</th></tr></thead><tbody>
      ${rows.map((r, i) => {
        const isCut = region === 'all' && !opt.krOnly && r.rank === cut;
        return `<tr class="expandable ${rowCls(r)} ${isCut ? 'cut' : ''}" data-toggle="cp-${i}" tabindex="0" aria-expanded="false"><td class="rank">${r.rank}</td><td class="team">${krDot(r.kr, r.short)}${teamLink(r.short, r.name)}${coachBadge(r.kr, r.short)}<small>${esc(REGION[r.region] || '')}</small></td><td class="r num">${fmt(r.total)}</td><td class="r">${r.status === 'direct' ? '<span class="tag ok">직행권</span>' : '<span class="tag">LCQ 대상</span>'}</td></tr>
        <tr class="detail" id="cp-${i}" hidden><td></td><td colspan="3">${r.players.map(([n, p, id]) => cpBreak(id, n, p, r.short)).join('')}</td></tr>
        ${isCut ? `<tr class="cut-label"><td colspan="4">여기까지 챔피언십 직행 (현재 기준)</td></tr>` : ''}`;
      }).join('')}
    </tbody></table></div>`;
  } else {
    const ps = A.cp.filter((r) => region === 'all' || r.region === region).flatMap((r) => r.players.map(([n, p, id]) => ({ n, p, id, short: r.short, kr: krNames.has(n) })))
      .filter((x) => !opt.krOnly || x.kr).sort((a, b) => b.p - a.p).slice(0, 150);
    table = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>선수</th><th>팀</th><th class="r">CP</th></tr></thead><tbody>
      ${ps.map((x, i) => `<tr class="expandable ${x.kr ? 'kr k-team' : ''}" data-toggle="cpp-${i}" tabindex="0" aria-expanded="false"><td class="rank">${i + 1}</td><td class="team">${x.kr ? krDot('team') : ''}${esc(x.n)}</td><td>${teamLink(x.short)}</td><td class="r num">${fmt(x.p)}</td></tr>
        <tr class="detail" id="cpp-${i}" hidden><td></td><td colspan="3">${cpBreak(x.id, x.n, x.p, x.short)}</td></tr>`).join('')}
    </tbody></table></div><p class="lead">공식 순위표가 팀별로 공개하는 합산 대상 선수(상위 3인)만 표시합니다.</p>`;
  }
  const cpKey = BD.state === 'live' || BD.state === 'pending' ? intlKey() : null;
  return `${boardNote()}${spoil(ringLine(A.kr || []), cpKey, 'CP 위치')}<p class="lead">${A.season.cpDirectSlots}위까지 챔피언십 직행, 나머지 ${A.season.lcqSlots}자리는 LCQ에서 정합니다. 팀 CP는 현재 로스터에서 CP가 높은 선수 3명의 합입니다.</p>
    ${spoil(`<div class="pts-cols"><div class="pts-side">${krSummary ? `<section class="sec"><h2 class="h2">한국 관련 팀</h2><div class="tbl-wrap" style="margin-top:8px"><table class="tbl"><tbody>${krSummary}</tbody></table></div></section>` : ''}</div>
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
  const groups = [...new Set(evs.map((e) => e.split))].map((sp) => `<div class="seg ev-seg" role="group" aria-label="Split ${sp}">${evs.filter((e) => e.split === sp).map((e) => `<a href="${qsLink('/points/events', q, { e: e.slug })}" aria-current="${e === cur}">${esc(e.short)}</a>`).join('')}</div>`).join('');
  let rows = cur.rows;
  if (opt.krOnly) rows = rows.filter((r) => r.kr !== 'none');
  const open = cur.rows.filter((r) => !r.id).length;
  return `<p class="lead">어느 대회에서 어느 팀(선수)이 몇 CP를 받았는지 봅니다. 같은 팀 선수는 1인당 같은 CP를 받습니다.</p>
    <div class="controls ev-controls">${groups}</div>
    ${spoil(`<section class="sec"><h2 class="h2">${esc(cur.label)}</h2>${open ? `<p class="lead"><span class="tag live">진행 중</span> ${open}자리는 아직 순위가 정해지지 않았습니다.</p>` : ''}
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>순위</th><th>팀</th><th class="r">1인당 CP</th><th>받은 선수</th></tr></thead><tbody>
      ${rows.map((r) => `<tr class="${rowCls(r)}"><td class="rank">${r.pos}</td><td class="team">${r.id ? `${krDot(r.kr, r.short)}${r.short ? teamLink(r.short, r.name) : esc(r.name)}` : '<span class="muted">미정</span>'}</td><td class="r num">${fmt(r.cp)}</td><td class="small">${r.players.map(([id, n]) => `<a href="#/players/${encodeURIComponent(id)}">${esc(n)}</a>`).join(', ')}</td></tr>`).join('')}
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
    ${seg('스플릿', split, [['1', 'Split 1', { s: '1' }], ['2', 'Split 2', { s: '2' }]])}
  </div>`;
  if (!P) return controls + '<p class="empty">이 지역·스플릿 데이터가 아직 없습니다.</p>';
  // 한 표: 정규 시즌 순위로 줄 세우고(진출 컷이 정규 시즌 기준), 리전 결승까지 반영한 최종 순위를 옆 칸에
  let rows = P.rows.slice().sort((a, b) => (b.rs ?? 0) - (a.rs ?? 0) || (b.kills ?? 0) - (a.kills ?? 0));
  rows.forEach((r, i) => (r._rk = i + 1));
  if (opt.krOnly) rows = rows.filter((r) => r.kr !== 'none');
  const lines = !opt.krOnly ? { [P.playoffsLine]: `여기까지 정규 시즌 순위로 플레이오프 진출 (리전 결승 우승팀 1자리 추가)`, [P.rfLine]: '여기까지 리전 결승 진출' } : {};
  const krHere = rows.filter((r) => r.kr !== 'none');
  const fin = (r) => (r.pos !== r._rk ? `<b>${r.pos}</b><small class="mv">${r.pos < r._rk ? '▲' + (r._rk - r.pos) : '▼' + (r.pos - r._rk)}</small>` : `<b>${r.pos}</b>`);
  return `${controls}
    <p class="lead">${esc(P.label)}. 시리즈(하루 6게임) 순위마다 프로리그 포인트를 받고, 9개 시리즈 합으로 정규 시즌 순위를 정합니다. 진출 컷은 정규 시즌 순위 기준이고, 오른쪽 최종 순위는 리전 결승까지 반영한 값(챔피언십 포인트 기준)입니다.</p>
    ${krHere.length && !opt.krOnly ? `<div class="kr-strip" style="margin-top:12px">${krHere.map((r) => `<a class="kchip ${CAT[r.kr]}" href="#/teams/${encodeURIComponent(r.short)}">${logo(r.short)}<span><b>${esc(r.short)}</b><small>정규 ${r._rk}위 · 최종 ${r.pos}위${r.qualified ? ' · PO' : ''}</small></span></a>`).join('')}</div>` : ''}
    <section class="sec"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>정규</th><th>팀</th><th class="c opt">조</th><th class="r">정규 점수</th><th class="r opt">킬</th><th class="r">최종</th><th class="r opt2">CP/인</th></tr></thead><tbody>
      ${rows.map((r) => `<tr class="${rowCls(r)} ${lines[r._rk] ? 'cut' : ''}"><td class="rank">${r._rk}</td><td class="team">${krDot(r.kr, r.short)}${teamLink(r.short, r.name)}${r.qualified ? ' <span class="tag ok">PO</span>' : ''}</td><td class="c opt">${esc(r.group)}</td><td class="r num">${r.rs ?? '–'}</td><td class="r opt">${r.kills ?? '–'}</td><td class="r rank">${fin(r)}</td><td class="r opt2">${fmt(r.cpPP)}</td></tr>${lines[r._rk] ? `<tr class="cut-label"><td colspan="7">${lines[r._rk]}</td></tr>` : ''}`).join('')}
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
function teams(parts, q) {
  if (parts[1]) return teamDetail(decodeURIComponent(parts[1]));
  const g = q.get('g') || 'all';
  if (g === 'kr') return krTeams();
  const all = Object.values(A.teams);
  const tile = (t) => {
    const ps = (t.roster || []).filter((p) => p.r !== 'k'), cs = (t.roster || []).filter((p) => p.r === 'k');
    const cls = rowCls({ kr: t.krLevel, short: t.short });
    return `<a class="team-tile ${cls}" href="#/teams/${encodeURIComponent(t.short)}" data-name="${esc((t.short + ' ' + t.name + ' ' + (t.roster || []).map((p) => p.n).join(' ')).toLowerCase())}">
      <span class="tile-id">${logo(t.short, 'lg')}<b>${esc(t.short)}</b>${krDot(t.krLevel, t.short)}</span><span>${esc(t.name)}${t.cp ? `, CP ${t.cp.rank}위` : ''}</span>
      <span class="tile-roster">${ps.map(pName).join(', ') || '로스터 정보 없음'}${cs.length ? `<br><span class="muted">코치 ${cs.map(pName).join(', ')}</span>` : ''}</span></a>`;
  };
  const byCp = (a, b) => (a.cp?.rank ?? 999) - (b.cp?.rank ?? 999);
  const order = { team: 0, member: 1, coach: 2 };
  let groups = [['한국 관련', all.filter((t) => t.krLevel !== 'none').sort((a, b) => order[a.krLevel] - order[b.krLevel] || byCp(a, b))], ...['apac-n', 'apac-s', 'emea', 'americas'].map((r) => [REGION[r], all.filter((t) => t.region === r && (g !== 'all' || t.krLevel === 'none')).sort(byCp)])];
  if (g !== 'all') groups = groups.filter(([n]) => n === REGION[g]);
  return `<h1 class="title">팀</h1>
    <p class="lead">현재 시즌 팀과 로스터입니다. <b class="krn">굵은 이름</b>은 한국 선수, <sup class="mix">계</sup>는 한국계(혼혈·이중국적 등) 선수입니다.</p>
    ${krLegend()}
    <label class="visually-hidden" for="teamSearch">팀 또는 선수 검색</label>
    <input class="search" id="teamSearch" type="search" placeholder="팀이나 선수 이름으로 찾기" autocomplete="off">
    ${groups.map(([g, ts]) => ts.length ? `<section class="sec team-group"><h2 class="h2">${esc(g)} <small class="muted">${ts.length}팀</small></h2><div class="team-grid">${ts.map(tile).join('')}</div></section>` : '').join('')}`;
}

// 팀 탭 '한국 관련': 한국 팀·한국 선수 팀·한국 코치 팀의 자세한 카드
function krTeams() {
  const krs = A.kr || [];
  const card = (k) => {
    const t = team(k.short) || {};
    const si = A.intl ? krStageInfo(k.short) : { text: '' };
    const ps = (t.roster || []).filter((p) => p.r !== 'k'), cs = (t.roster || []).filter((p) => p.r === 'k');
    return `<a class="kcard ${CAT[k.level]}" href="#/teams/${encodeURIComponent(k.short)}">
      <span class="kcard-id">${logo(k.short, 'lg')}<span><b>${esc(k.name)}</b><small>${esc(KR_LABEL[k.level])} · ${esc(REGION[t.region] || '')}</small></span></span>
      <span class="kcard-stats"><span><b>${k.cp ? k.cp.rank + '위' : '–'}</b><small>CP</small></span><span><b>${k.pl ? k.pl.pos + '위' : '–'}</b><small>Split 2 PL</small></span><span><b>${k.intl ? k.intl.pos + '위' : '–'}</b><small>조별 리그</small></span></span>
      ${si.text ? `<span class="kcard-now">지금 · ${esc(si.text)}</span>` : ''}
      <span class="kcard-roster">${ps.map(pName).join(', ')}${cs.length ? ` · 코치 ${cs.map(pName).join(', ')}` : ''}</span>
    </a>`;
  };
  return `<h1 class="title">한국 관련 팀</h1><p class="lead">한국 선수 또는 한국 코치가 있는 팀입니다. 카드를 누르면 팀 상세로 갑니다.</p>${krLegend()}
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
  const st = A.streams.players.find((p) => p.name.toLowerCase() === name.toLowerCase());
  const teamsSeen = [...new Map(h.map((x) => [x.r.short || x.r.name, x])).values()];
  return `<p style="margin:14px 0 0"><a class="more" href="${cur ? `#/teams/${encodeURIComponent(cur.short)}` : '#/teams'}">${cur ? esc(cur.name) : '팀 목록'}</a></p>
    <div class="detail-id">${cur ? logo(cur.short, 'xl') : ''}<h1 class="title">${esc(name)}</h1></div>
    <p class="lead">${cur ? `${teamLink(cur.short, cur.name)} · ${esc(REGION[cur.region] || '')}` : '현재 소속 정보 없음'}${rp ? ` · ${esc(rp.c || '')}${rp.rep ? ` (대표 ${esc(rp.rep)})` : ''} · ${roleKo[rp.r] || ''}` : ''}${rp?.mix ? ' · <span class="tag kr k-member">한국계</span>' : rp && isKrP(rp) ? ' · <span class="tag kr k-team">한국</span>' : ''}</p>
    ${spoil(`<section class="sec"><h2 class="h2">챔피언십 포인트</h2>${cpP ? `<p class="lead">${esc(cpRow.name)}의 팀 CP 합산에 들어가는 상위 3인입니다.</p>` : '<p class="lead">현재 팀 CP 합산(상위 3인)에는 들어가지 않는 선수입니다.</p>'}${cpBreak(pid, name, cpP ? cpP[1] : null, cur?.short)}</section>
    <section class="sec"><h2 class="h2">Year 6 대회 기록</h2>${h.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>대회</th><th>팀</th><th class="r">순위</th><th class="r">CP</th></tr></thead><tbody>
      ${h.slice().reverse().map(({ e, r }) => `<tr><td><span class="lg-only">${esc(e.label)}</span><span class="sm-inline">${esc(e.short)}</span></td><td class="team">${r.short ? teamLink(r.short, r.name) : esc(r.name || '')}</td><td class="r num">${r.pos}</td><td class="r num">${fmt(r.cp)}</td></tr>`).join('')}
    </tbody></table></div>` : '<p class="empty">Year 6 공식 대회 기록이 없습니다.</p>'}</section>`, intlKey(), '대회 기록')}
    ${teamsSeen.length > 1 ? `<p class="lead">Year 6 소속 팀: ${teamsSeen.map((x) => esc(x.r.short || x.r.name)).join(' → ')}. 챔피언십 포인트는 팀을 옮겨도 선수에게 남습니다.</p>` : ''}
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
  return `<p style="margin:14px 0 0"><a class="more" href="#/teams">팀 목록</a></p>
    <div class="detail-id">${logo(short, 'xl')}<h1 class="title">${esc(t.name)}</h1></div>
    <p class="lead">${esc(REGION[t.region] || '')}${t.krLevel !== 'none' ? ` <span class="tag kr ${CAT[t.krLevel]}">${KR_LABEL[t.krLevel]}</span>` : ''}${t.cp ? `, 챔피언십 포인트 ${t.cp.rank}위 (${fmt(t.cp.total)} CP)` : ''}</p>
    ${si?.text ? spoil(`<p class="lead"><b>${esc(ko(A.intl.name, EVENT_KO))}</b> · ${esc(si.text)}</p>`, intlKey(), '대회 성적') : ''}
    ${t.roster?.length ? `<section class="sec"><h2 class="h2">로스터</h2><ul class="roster-list">${t.roster.map((p) => `<li><span>${isKrP(p) ? `<span class="krdot ${p.r === 'k' ? 'k-coach' : 'k-team'}"></span>` : ''}${playerLink(p.n, pName(p))}</span><span class="muted small">${esc(p.c || '')}${p.rep ? ` (대표 ${esc(p.rep)})` : ''}${roleKo[p.r] ? ', ' + roleKo[p.r] : ''}${p.mix ? ', 한국계' : ''}</span></li>`).join('')}</ul></section>` : ''}
    ${spoil(`${(() => { const c = A.cp.find((r) => r.id === t.id); return c ? `<section class="sec"><h2 class="h2">챔피언십 포인트 내역</h2><p class="lead">팀 CP ${fmt(c.total)} = 상위 3인 합</p>${c.players.map(([n, p, id]) => cpBreak(id, n, p, t.short)).join('')}</section>` : ''; })()}
    <section class="sec"><h2 class="h2">시즌 성적</h2><div class="tbl-wrap"><table class="tbl"><thead><tr><th>대회</th><th class="r">순위</th><th class="r">점수</th></tr></thead><tbody>
      ${ir ? `<tr><td>${esc(ko(A.intl.name, EVENT_KO))} 조별 리그</td><td class="r num">${ir.pos}</td><td class="r">${ir.pts}점</td></tr>` : ''}
      ${plRows.sort((a, b) => b[0].split - a[0].split).map(([P, r]) => `<tr><td>${esc(P.label)}</td><td class="r num">${r.pos}</td><td class="r">정규 ${r.rs ?? '–'}점</td></tr>`).join('')}
    </tbody></table></div></section>`, ir ? intlKey() : null, '시즌 성적')}
    ${ss.length ? `<section class="sec"><h2 class="h2">경기 결과</h2>${ss.slice(0, 12).map((s) => { const r = s.results.find((x) => x.short === short); return `<div class="stream"><span>${dayLabel(dayKey(s.start))} ${olink(officialUrl(s), esc(ko(s.name, PHASE_KO)))}<br><span class="muted small">${esc(ko(s.event, EVENT_KO))}</span></span><span>${spoil(`<b class="num">${r.pos}위</b> ${r.pts}점`, seriesKey(s), '순위')}</span></div>`; }).join('')}</section>` : ''}
    ${st.length ? `<section class="sec"><h2 class="h2">선수 방송</h2>${st.map(streamRow).join('')}</section>` : ''}
    <p class="lead" style="margin-top:20px"><a href="https://liquipedia.net/apexlegends/index.php?search=${encodeURIComponent(t.name)}" target="_blank" rel="noopener">Liquipedia에서 보기</a> · ${fbLink('데이터 오류', `팀 ${t.short} (${t.name})`, '이 팀 정보 고치기')}</p>`;
}

/* ---------- 규칙 ---------- */
function rules(parts, q) {
  const sv = q.get('s') || 'all';
  const S = A.season, sc = S.scoring;
  const vids = S.rulesVideos || [];
  const vid = (v) => `<figure class="vid"><button class="yt" type="button" data-yt="${esc(v.id)}" aria-label="${esc(v.title)} 재생">
      <img src="https://i.ytimg.com/vi/${esc(v.id)}/hqdefault.jpg" alt="" loading="lazy" width="480" height="360"><span class="yt-play" aria-hidden="true"></span></button>
      <figcaption><b>${esc(v.title)}</b><span>${esc(v.channel)} · <a href="https://youtu.be/${esc(v.id)}" target="_blank" rel="noopener">YouTube에서 보기</a></span></figcaption></figure>`;
  const place = [12, 9, 7, 5, 4, 3, 3, 2, 2, 2, 1, 1, 1, 1, 1];
  const html = `<h1 class="title">규칙</h1>
    <p class="lead">ALGS를 처음 보는 사람도 경기를 따라갈 수 있도록 핵심 규칙만 모았습니다. 자세한 기준은 맨 아래 공식 규정이 우선합니다.</p>
    ${vids.length && (sv === 'all' || sv === 'video') ? `<section class="sec" aria-labelledby="h-vid"><h2 class="h2" id="h-vid">영상으로 보기</h2><div class="vid-grid">${vids.map(vid).join('')}</div></section>` : ''}
    <div class="rules-grid">
    <section class="sec rule-card" data-k="format"><h2 class="h2">한 시즌의 흐름</h2>
      <ol class="timeline">${S.timeline.map((e) => `<li><span>${e.url ? olink(e.url, esc(e.name)) : esc(e.name)}<br><span class="when">${esc(e.where)}</span></span><span class="when">${e.start.slice(5).replace('-', '.')}–${e.end.slice(5).replace('-', '.')}</span></li>`).join('')}</ol>
      <p class="lead">지역별 프로리그에서 성적을 내 플레이오프(국제전)에 나가고, 시즌 내내 모은 챔피언십 포인트로 챔피언십 직행 여부가 정해집니다.</p></section>
    <section class="sec rule-card" data-k="points"><h2 class="h2">게임 점수</h2>
      <p>한 게임 점수 = <b>순위 점수 + 킬 1점</b>. 보통 한 시리즈는 6게임이고, 점수를 모두 더해 시리즈 순위를 정합니다.</p>
      <div class="tbl-wrap"><table class="tbl compact"><thead><tr><th>순위</th>${place.slice(0, 10).map((_, i) => `<th class="c">${i + 1}</th>`).join('')}<th class="c">11–15</th><th class="c">16–20</th></tr></thead>
      <tbody><tr><td>점수</td>${place.slice(0, 10).map((p) => `<td class="c num">${p}</td>`).join('')}<td class="c num">1</td><td class="c num">0</td></tr></tbody></table></div></section>
    <section class="sec rule-card" data-k="format"><h2 class="h2">프로리그</h2>
      <p>지역마다 30팀이 A·B·C 세 조로 나뉘어 서로 돌아가며 붙습니다(시리즈 9번). 시리즈 순위마다 프로리그 포인트를 받고, 합계로 정규 시즌 순위를 냅니다.</p>
      <ul><li>시리즈 순위별 포인트: ${sc.plRegular.slice(0, 5).join(', ')} … 20위 0</li><li>상위 20팀이 리전 결승(매치 포인트 방식)에 나갑니다.</li><li>정규 시즌 상위 팀과 리전 결승 우승팀이 플레이오프에 갑니다.</li></ul></section>
    <section class="sec rule-card" data-k="format"><h2 class="h2">플레이오프·챔피언십 진행</h2>
      <p>40팀이 조별 리그를 치른 뒤 브래킷으로 갈립니다.</p>
      <ul><li>조별 리그 상위 20팀 → 승자 라운드, 하위 20팀 → 패자부활 1라운드</li>
      <li>승자 라운드 상위 10팀 → 결승, 하위 10팀 → 패자부활 2라운드</li>
      <li>패자부활 1라운드 상위 10팀 → 패자부활 2라운드, 하위 10팀 탈락</li>
      <li>패자부활 2라운드 상위 10팀 → 결승, 하위 10팀 탈락</li>
      <li>결승 20팀은 매치 포인트 방식으로 우승을 가립니다.</li></ul>
      <p class="lead"><a href="#/standings">순위 탭</a>에서 지금 진행 상황을 승자조·패자조로 볼 수 있습니다.</p></section>
    <section class="sec rule-card" data-k="format"><h2 class="h2">매치 포인트</h2>
      <p>정해진 점수(보통 50점)를 넘긴 팀은 <b>매치 포인트</b> 상태가 됩니다. 그 뒤 게임에서 <b>1위(챔피언)</b>를 하면 그 즉시 우승입니다. 매치 포인트 팀이 없거나 1위를 못 하면 게임을 계속합니다.</p>
      <p class="lead">경기 화면의 <span class="tag mpe">MP</span>는 매치 포인트 도달, <span class="tag mpe">우승</span>은 우승을 뜻합니다.</p></section>
    <section class="sec rule-card" data-k="points"><h2 class="h2">챔피언십 포인트(CP)</h2>
      <p>CP는 <b>선수 개인</b>이 받습니다. 팀 CP는 현재 로스터에서 CP가 높은 선수 3명의 합입니다. 선수가 팀을 옮기면 CP도 따라갑니다.</p>
      <ul><li>프로리그 최종 순위별(1인): ${sc.cpProLeague.slice(0, 6).join(', ')} …</li><li>플레이오프 최종 순위별(1인): ${sc.cpPlayoffs.slice(0, 6).join(', ')} …</li>
      <li>CP 상위 ${S.cpDirectSlots}팀은 챔피언십 직행, 나머지 ${S.lcqSlots}자리는 LCQ(지역별 2팀)에서 정합니다.</li></ul>
      <p class="lead"><a href="#/points/cp">포인트 탭</a>에서 현재 순위를 볼 수 있습니다.</p></section>
    <section class="sec rule-card" data-k="format"><h2 class="h2">레전드 밴 · POI 드래프트</h2>
      <p>경기 전 일부 레전드를 쓸 수 없게 막는 <b>레전드 밴</b>과, 팀마다 맵의 낙하 지점(POI)을 순서대로 골라 가져가는 <b>POI 드래프트</b>가 있습니다. 진행 방식은 위 영상에서 1분 만에 볼 수 있습니다.</p></section>
    </div>
    <section class="sec"><h2 class="h2">공식 규정과 참고 자료</h2><div class="chips" style="margin-top:10px">${(S.rulesLinks || []).map(([n, u]) => `<a class="chip" href="${esc(u)}" target="_blank" rel="noopener">${esc(n)}</a>`).join('')}</div></section>`;;
  if (sv === 'all') return html;
  const box = document.createElement('div'); box.innerHTML = html;
  box.querySelectorAll('[data-k]').forEach((el) => { if (el.dataset.k !== sv) el.remove(); });
  if (sv === 'video') box.querySelector('.rules-grid')?.remove();
  return box.innerHTML;
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
const streamRow = (p) => `<div class="pl-row"><span class="nm"><span class="krdot ${p.role === 'coach' ? 'k-coach' : 'k-team'}"></span>${playerLink(p.name)}${p.mix ? '<sup class="mix">계</sup>' : ''}<small>${teamLink(p.team)}${p.role === 'coach' ? ', 코치' : ''}</small></span><span class="chips">${['twitch', 'soop'].map((k) => chip(k, p.links[k])).join('')}${['chzzk', 'youtube'].map((k) => (p.links[k] ? chip(k, p.links[k]) : findChip(k, p.name))).join('')}</span></div>`;
function streams(parts, q) {
  const sv = q.get('s') || 'all';
  const S = A.streams, MV = A.season.multiview || {};
  const order = (A.kr || []).map((k) => k.short);
  const players = S.players.slice().sort((a, b) => (order.indexOf(a.team) + 99 * (order.indexOf(a.team) < 0)) - (order.indexOf(b.team) + 99 * (order.indexOf(b.team) < 0)) || (a.role === 'coach') - (b.role === 'coach'));
  const show = (k) => sv === 'all' || sv === k;
  return `<h1 class="title">방송</h1>
    ${show('mv') ? `<section class="sec mv" aria-labelledby="h-mv">
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
    <div class="stream-cols${sv === 'all' ? '' : ' one'}">
      ${show('official') ? `<section class="sec"><h2 class="h2">공식 중계</h2>
        ${S.broadcasts.map((b) => `<div class="bc"><h3>${esc(b.label)}</h3><p>${esc(b.note)}</p><div class="chips">${b.links.length ? b.links.map(([n, u]) => `<a class="chip ${n.toLowerCase()}" href="${esc(u)}" target="_blank" rel="noopener"><i></i>${esc(n)}</a>`).join('') : '<span class="chip off">등록된 채널 없음</span>'}</div></div>`).join('')}
        ${S.partners.length ? `<div class="bc"><h3>공식 파트너 워치 파티</h3><p>공식 일정에 파트너로 등록된 채널입니다.</p><div class="chips">${S.partners.filter((p) => p.url).map((p) => `<a class="chip ${p.provider}" href="${esc(p.url)}" target="_blank" rel="noopener"><i></i>${esc(p.name)}</a>`).join('')}</div></div>` : ''}
      </section>` : ''}
      ${show('players') ? `<section class="sec"><h2 class="h2">한국 선수 개인 방송</h2>
        ${players.map(streamRow).join('')}
        <p class="lead">${fbLink('채널 제보', '', '선수 CHZZK·YouTube 채널 제보하기')}</p>
        <p class="lead">채움 칩은 확인된 채널(공식 API, Liquipedia 선수 페이지, 운영자 입력), 점선 칩은 확인된 채널이 없어 해당 플랫폼에서 이름으로 검색하는 링크입니다. 선수 개인 방송은 대회 규정상 지연이 걸려 있어, 이 사이트의 점수가 방송보다 먼저 바뀔 수 있습니다.</p>
      </section>` : ''}
    </div>`;
}

/* ---------- 이벤트 연결 ---------- */
function bind() {
  app.querySelectorAll('[data-toggle]').forEach((tr) => {
    const go = () => { const d = document.getElementById(tr.dataset.toggle); d.hidden = !d.hidden; tr.setAttribute('aria-expanded', String(!d.hidden)); };
    tr.addEventListener('click', (e) => { if (e.target.closest('a')) return; go(); });
    tr.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  });
  bindReplay();
  app.querySelectorAll('[data-reveal]').forEach((b) => b.addEventListener('click', () => reveal(b.dataset.reveal)));
  app.querySelectorAll('button.yt').forEach((b) => b.addEventListener('click', () => {
    const f = document.createElement('iframe');
    f.src = `https://www.youtube-nocookie.com/embed/${b.dataset.yt}?autoplay=1&rel=0`;
    f.title = b.getAttribute('aria-label'); f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen'; f.allowFullscreen = true;
    f.className = 'yt-frame'; b.replaceWith(f);
  }));
  const search = document.getElementById('teamSearch');
  if (search) search.addEventListener('input', () => {
    const v = search.value.trim().toLowerCase();
    app.querySelectorAll('.team-tile').forEach((t) => { t.hidden = v && !t.dataset.name.includes(v); });
    app.querySelectorAll('.team-group').forEach((g) => { g.hidden = ![...g.querySelectorAll('.team-tile')].some((t) => !t.hidden); });
  });
}

function setupFeedback() {
  document.getElementById('feedbackBtn')?.addEventListener('click', () => openFeedback('', ''));
  document.querySelectorAll('#feedback .fb-kind').forEach((b) => b.addEventListener('click', () => {
    window.open(feedbackUrl(b.dataset.kind, fbCtx), '_blank', 'noopener');
    document.getElementById('feedback').close();
  }));
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-feedback]'); if (b) openFeedback(b.dataset.feedback, b.dataset.ctx || ''); });
}

function setupSettings() {
  const dlg = document.getElementById('settings');
  const dark = document.getElementById('optDark'), sp = document.getElementById('optSpoiler'), kr = document.getElementById('optKrOnly');
  document.getElementById('settingsBtn').addEventListener('click', () => {
    dark.checked = document.documentElement.dataset.theme === 'dark';
    sp.checked = opt.spoiler; kr.checked = opt.krOnly;
    document.getElementById('dataInfo').innerHTML = dataInfo();
    document.getElementById('refreshInfo').innerHTML = refreshInfo();
    dlg.showModal();
  });
  document.getElementById('refreshPill').addEventListener('click', () => document.getElementById('settingsBtn').click());
  dark.addEventListener('change', () => { const t = dark.checked ? 'dark' : 'light'; document.documentElement.dataset.theme = t; try { localStorage.setItem('algskr.theme', t); } catch {} });
  sp.addEventListener('change', () => { opt.spoiler = sp.checked; store.set('spoiler', sp.checked); render(); });
  kr.addEventListener('change', () => { opt.krOnly = kr.checked; store.set('krOnly', kr.checked); render(); });
}

const dataInfo = () => {
  const s = A.sources;
  const f = (iso) => (iso ? dateTime(iso) : '수집 안 됨');
  return `데이터 갱신: ${dateTime(A.generated)} KST<br>Liquipedia: ${f(s.lp)}<br>ALGS 공식: ${f(s.algs)}<br>Battlefy: ${f(s.battlefy)}${A.conflicts?.length ? `<br>출처 간 차이 ${A.conflicts.length}건 (Liquipedia 값 표시)` : ''}`;
};
const footer = () => { document.getElementById('sourceLine').innerHTML = `데이터: <a href="https://liquipedia.net/apexlegends/" target="_blank" rel="noopener">Liquipedia</a> (CC-BY-SA 3.0), <a href="https://algs.ea.com/" target="_blank" rel="noopener">ALGS 공식</a>, Battlefy. 갱신 ${dateTime(A.generated)} KST`; };

/* ---------- 데이터 갱신: 버전 확인 + 경기 중 실시간 ---------- */
const R = A.season.refresh || { buildMinutes: 5, liveSeconds: 10 };
const LIVE = { mode: C.liveMode || (C.liveUrl ? 'worker' : 'direct'), api: C.officialApi || 'https://prod-api.algstools.com/v1', lastAt: 0, active: [] };
const ago = (t) => { const s = Math.max(0, Math.round((Date.now() - t) / 1000)); return s < 60 ? `${s}초 전` : `${Math.floor(s / 60)}분 전`; };
function refreshNote() {
  return `<details class="refresh-note"><summary><b>갱신 주기</b> 점수 ${C.livePollMs ? Math.round(C.livePollMs / 1000) : R.liveSeconds}초 · 순위·CP ${Math.round(OFF.ms / 1000)}초 <span class="more-hint">자세히</span></summary>진행 중인 시리즈 점수는 공식 API에서 약 ${C.livePollMs ? Math.round(C.livePollMs / 1000) : R.liveSeconds}초마다, 순위·챔피언십 포인트·다음 단계 출전 명단은 ${Math.round(OFF.ms / 1000)}초마다(시리즈가 끝나는 순간에는 즉시) 공식 API에서 직접 받아 바꿉니다. Liquipedia 대조는 ${R.buildMinutes}분 주기 빌드에서 합니다. 마지막 빌드 ${dateTime(A.generated)} KST.</details>`;
}
function refreshInfo() {
  return `경기 중: 진행 중인 시리즈만 공식 API에서 ${Math.round((C.livePollMs || R.liveSeconds * 1000) / 1000)}초마다 확인 (${LIVE.mode === 'worker' ? '실시간 서버 경유' : '브라우저에서 직접'}). 탭을 보고 있을 때만 확인합니다.<br>확정값: 챔피언십 포인트·조별 리그 순위·출전 명단을 공식 API에서 ${Math.round(OFF.ms / 1000)}초마다, 시리즈 종료 즉시 다시 받음${OFF.lastAt ? ` (마지막 ${ago(OFF.lastAt)})` : ''}.<br>평상시: ${R.buildMinutes}분마다 자동 빌드 (GitHub 예약 실행이라 몇 분 늦어질 수 있음). 새 빌드는 ${Math.round((C.verPollMs || 30000) / 1000)}초 안에 화면에 반영됩니다.<br>지금 상태: ${LIVE.active.length ? `실시간 확인 중 (${LIVE.active.length}개 시리즈, 마지막 ${LIVE.lastAt ? ago(LIVE.lastAt) : '대기'})` : '진행 중인 경기 없음'}`;
}
function updatePill() {
  const pill = document.getElementById('refreshPill'), txt = document.getElementById('refreshText');
  if (!pill) return;
  const on = LIVE.active.length > 0 && A.series.some((s) => s.live);
  pill.classList.toggle('is-live', on);
  txt.textContent = on ? `실시간 · ${LIVE.lastAt ? ago(LIVE.lastAt) : '확인 중'}` : LIVE.active.length ? '경기 대기 · 실시간 준비' : `${R.buildMinutes}분 갱신 · ${hhmm(A.generated)}`;
}
// 진행 중이거나 5분 안에 시작하는 시리즈 (시작 후 10시간까지)
const liveCandidates = () => A.series.filter((s) => s.status !== 'completed' && new Date(s.start) - now() < 5 * 60e3 && now() - new Date(s.start) < 10 * 3600e3);
let liveTimer = null;
async function pollDirect() {
  clearTimeout(liveTimer);
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
      const results = (st.teams || []).map((t) => ({ pos: t.position, short: t.shortName, pts: t.points, kills: t.kills, kr: krOf(t.shortName), mpe: !!t.matchPointEligible, won: !!t.wonMatchPoint })).sort((a, b) => a.pos - b.pos);
      const games = Math.max(0, ...(st.teams || []).flatMap((t) => (t.players || []).map((p) => p.latestMatchNumber || 0)));
      const sig = JSON.stringify([st.seriesStatus, results.map((x) => [x.short, x.pts, x.pos])]);
      if (sig !== s._sig) { changed = true; s._sig = sig; }
      s.results = results.length ? results : s.results; s.games = games;
      s.kr = (s.results || []).filter((x) => x.kr !== 'none').map((x) => x.short);
      s.live = st.seriesStatus === 'live';
      s.liveAt = Date.now();
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
  if (document.hidden || LIVE.mode !== 'direct') return;
  const api = LIVE.api, j = (u) => fetch(api + u, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  let changed = false;
  const jobs = [];
  // 1) 국제전 남은 시리즈의 공식 출전 명단 (12시간 안에 시작하는 것)
  for (const s of A.series.filter((x) => x.eventId === A.intl?.eventId && x.status !== 'completed' && new Date(x.start) - now() < 12 * 3600e3)) {
    jobs.push(j(`/series/${s.id}/teams`).then((r) => {
      const sh = (r?.teams || []).map((t) => t.shortName).filter(Boolean);
      if (sh.length && JSON.stringify(sh) !== JSON.stringify(s.lineup)) { s.lineup = sh; changed = true; }
    }));
  }
  // 2) 조별 리그 누적 (조별 리그가 끝나기 전까지)
  const gsLive = A.intl && A.api?.groupPhaseId && A.series.some((x) => x.eventId === A.intl.eventId && x.phase === 'Group Stage' && x.status !== 'completed' && new Date(x.start) <= now());
  if (gsLive) jobs.push(j(`/stats/phases/${A.api.groupPhaseId}/standings`).then((r) => {
    if (!r?.standings?.length) return;
    const rows = r.standings.map((x) => ({ pos: x.position, short: x.shortName, name: x.name, id: x.teamId, group: x.group, pts: x.points, kills: x.kills, region: regionOf(x.teamId, x.region), kr: krOf(x.shortName), next: x.position <= A.intl.winnersCut ? 'Winners Round' : 'Elimination Round 1' }));
    if (JSON.stringify(rows.map((x) => [x.short, x.pts])) !== JSON.stringify(A.intl.rows.map((x) => [x.short, x.pts]))) { A.intl.rows = rows; changed = true; }
  }));
  // 3) 챔피언십 포인트 순위 (공식 페이지와 같은 조건)
  if (A.api?.cpEventIds?.length) jobs.push(j(`/seasons/${A.seasonId}/standings/teams?eventIds=${encodeURIComponent(A.api.cpEventIds.join(','))}&minAmountOfMatches=12`).then((r) => {
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
document.addEventListener('visibilitychange', () => { if (!document.hidden && LIVE.mode === 'direct') pollDirect(); });
let curVer = null;
async function pollVer() {
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
    s.onload = () => { s.remove(); A = window.ALGS; applyLive(); footer(); render(); updatePill(); if (LIVE.mode === 'direct') pollDirect(); res(); };
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
    if (l.results) s.results = l.results.map((r) => ({ ...r, kr: krOf(r.short), mpe: !!r.mp }));
    s.liveAt = l.checkedAt ? Date.parse(l.checkedAt) : Date.now(); LIVE.lastAt = s.liveAt;
    if (l.status === 'completed') { s.status = 'completed'; s.liveFinal = true; }
    s.kr = (s.results || []).filter((r) => r.kr !== 'none').map((r) => r.short);
  }
}

/* ---------- 시작 ---------- */
window.addEventListener('hashchange', () => { render(); app.focus({ preventScroll: true }); window.scrollTo(0, 0); });
setupSettings();
setupFeedback();
// 세부 탭이 머리말(웹은 머리말+탭) 바로 아래에 붙도록 높이를 잰다
function measureStick() {
  const top = document.querySelector('.top'), bar = document.querySelector('.tabbar');
  const desk = matchMedia('(min-width: 768px)').matches;
  const z = parseFloat(getComputedStyle(document.querySelector('.frame')).zoom) || 1;
  const h = (top?.offsetHeight || 0) + (desk ? bar?.offsetHeight || 0 : 0);
  document.documentElement.style.setProperty('--top-h', `${top?.offsetHeight || 0}px`);
  document.documentElement.style.setProperty('--stick', `${h}px`);
}
measureStick();
addEventListener('resize', measureStick);
footer();
render();
pollVer();
setInterval(pollVer, C.verPollMs || 30000);
if (LIVE.mode === 'worker' && C.liveUrl) { pollLive(); setInterval(pollLive, C.livePollMs || 10000); }
else if (LIVE.mode === 'direct') { pollDirect(); refreshOfficial(); }
updatePill();
setInterval(updatePill, 1000);
setInterval(() => { if (!parseHash().parts[0]) render(); }, 60000); // 홈 카운트다운 갱신
