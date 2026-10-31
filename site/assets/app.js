// ALGS 코리아 트래커 — 화면 렌더링 (빌드 도구 없이 동작하는 ES 모듈)
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
const krDot = (lvl) => (lvl === 'team' ? '<span class="krdot" title="한국 팀"></span>' : lvl === 'member' ? '<span class="krdot m" title="한국 선수 소속"></span>' : '');
const teamLink = (short, label) => (team(short) ? `<a href="#/teams/${encodeURIComponent(short)}">${esc(label || short)}</a>` : esc(label || short));
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
  document.querySelectorAll('.tabbar a').forEach((a) => { if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  const view = { home, schedule, standings, points, teams, streams }[tab] || home;
  app.innerHTML = view(parts, q);
  bind();
}

/* ---------- 홈 ---------- */
function home() {
  const krs = A.kr || [];
  const lead = krs.find((k) => k.level === 'team') || krs[0];
  const others = krs.filter((k) => k !== lead);
  const upcoming = A.series.filter((s) => s.status !== 'completed').sort((a, b) => a.start.localeCompare(b.start));
  return `
    ${lead ? heroCard(lead) : '<p class="empty">현재 시즌에 한국 팀 데이터가 없습니다.</p>'}
    ${ringLine(krs)}
    ${others.length ? `<section class="sec" aria-labelledby="h-kr2">
      <div class="sec-head"><h2 class="h2" id="h-kr2">한국 선수가 뛰는 팀</h2></div>
      <div class="kr-list">${others.map(krRow).join('')}</div>
    </section>` : ''}
    ${A.intl ? `<section class="sec" aria-labelledby="h-now">
      <div class="sec-head"><h2 class="h2" id="h-now">${esc(ko(A.intl.name, EVENT_KO))}</h2><a class="more" href="#/standings">전체 순위</a></div>
      ${intlMini()}
    </section>` : ''}
    <section class="sec" aria-labelledby="h-up">
      <div class="sec-head"><h2 class="h2" id="h-up">다가오는 경기</h2><a class="more" href="#/schedule">경기 전체</a></div>
      ${upcoming.slice(0, 4).map(matchItem).join('') || '<p class="empty">예정된 경기가 없습니다.</p>'}
    </section>
    <section class="sec" aria-labelledby="h-season">
      <div class="sec-head"><h2 class="h2" id="h-season">${esc(A.season.name)} 일정</h2></div>
      ${seasonTimeline()}
    </section>`;
}

function heroCard(k) {
  const t = team(k.short);
  const next = k.nextSeries;
  const roster = t?.roster?.filter((p) => p.r !== 'k').map((p) => p.n).join(', ') || k.krPlayers.join(', ');
  return `<section class="kr-hero" aria-labelledby="h-hero">
    <span class="flag">${k.level === 'team' ? '한국 팀' : '한국 선수 소속'}</span>
    <h1 id="h-hero"><a href="#/teams/${encodeURIComponent(k.short)}" style="text-decoration:none">${esc(k.name)}</a></h1>
    <p class="roster">${esc(roster)}</p>
    <div class="kr-stats">
      <div><b>${k.cp ? k.cp.rank + '위' : '–'}</b><span>챔피언십 포인트<br>${k.cp ? fmt(k.cp.total) + ' CP' : ''}</span></div>
      <div><b>${k.intl ? k.intl.pos + '위' : '–'}</b><span>${k.intl ? esc(ko(A.intl.name, EVENT_KO)) + '<br>조별 리그 ' + k.intl.of + '팀' : '국제전 미출전'}</span></div>
      <div><b>${k.pl ? k.pl.pos + '위' : '–'}</b><span>Split 2 프로리그<br>${REGION[t?.region] || ''}</span></div>
    </div>
    ${next ? `<div class="kr-next"><span>다음 경기 · ${esc(ko(next.name, PHASE_KO))}<br><span style="opacity:.7">${dateTime(next.start)} KST</span></span><b>${esc(until(next.start) || '진행 중')}</b></div>` : ''}
  </section>`;
}

// 챔피언십 포인트 순위 위의 한국 팀 위치 (이 사이트의 대표 시각 요소)
function ringLine(krs) {
  const N = A.cp.length, cut = A.season.cpDirectSlots;
  if (!N) return '';
  const W = 440, L = 12, R = 428, y = 54;
  const x = (rank) => L + ((rank - 1) / (N - 1)) * (R - L);
  const pts = krs.filter((k) => k.cp).sort((a, b) => a.cp.rank - b.cp.rank);
  let lastX = -99, lane = 0;
  const marks = pts.map((k) => {
    const px = x(k.cp.rank);
    lane = px - lastX < 34 ? (lane + 1) % 3 : 0; lastX = px;
    const ly = y - 14 - lane * 13;
    const filled = k.level === 'team';
    return `<g class="marker"><line x1="${px}" y1="${ly + 3}" x2="${px}" y2="${y - 6}" stroke="var(--ring)" stroke-width="1"/>
      <circle cx="${px}" cy="${y}" r="${filled ? 5.5 : 4.5}" fill="${filled ? 'var(--ring)' : 'var(--paper)'}" stroke="var(--ring)" stroke-width="2"/>
      <text x="${px}" y="${ly}" text-anchor="middle" font-size="11" font-weight="700" fill="var(--ink)">${esc(k.short)} ${k.cp.rank}</text></g>`;
  }).join('');
  const ticks = [1, 32, 60, 90, N].map((r) => `<text x="${x(r)}" y="${y + 22}" text-anchor="middle" font-size="10.5" fill="var(--steel)">${r}위</text>`).join('');
  return `<section class="ringline" aria-label="챔피언십 포인트 순위에서 한국 팀 위치">
    <svg viewBox="0 0 ${W} 86" role="img" aria-label="챔피언십 포인트 ${N}팀 중 한국 관련 팀 위치, ${cut}위까지 직행">
      <rect x="${L}" y="${y - 2}" width="${x(cut) - L}" height="4" rx="2" fill="var(--ink)"/>
      <rect x="${x(cut)}" y="${y - 1}" width="${R - x(cut)}" height="2" rx="1" fill="var(--rule)"/>
      <line x1="${x(cut) + 0.5}" y1="${y - 10}" x2="${x(cut) + 0.5}" y2="${y + 10}" stroke="var(--ink)" stroke-width="1.5" stroke-dasharray="2 2"/>
      ${ticks}${marks}
    </svg>
    <p class="caption">챔피언십 포인트 ${N}팀 중 위치. 굵은 선 안쪽(${cut}위까지)이 챔피언십 직행이며, 지금 진행 중인 대회 결과가 들어가기 전 값입니다.</p>
  </section>`;
}

function krRow(k) {
  const bits = [];
  if (k.intl) bits.push(`${ko(A.intl.name, EVENT_KO)} 조별 ${k.intl.pos}위, 다음 ${ko(k.intl.next, PHASE_KO)}`);
  if (k.pl) bits.push(`Split 2 프로리그 ${k.pl.pos}위`);
  return `<a class="kr-row" href="#/teams/${encodeURIComponent(k.short)}">
    <span class="who">${krDot(k.level)}${esc(k.name)}<small>${esc(k.krPlayers.join(', '))}</small></span>
    <span class="val">${k.cp ? 'CP ' + k.cp.rank + '위' : ''}</span>
    <span class="sub">${esc(bits.join(' / '))}${k.cp && k.cp.status !== 'direct' ? ` / 직행권까지 ${fmt(k.cp.gap)} CP 부족` : ''}</span>
  </a>`;
}

function intlMini() {
  const rows = A.intl.rows;
  const show = rows.filter((r, i) => i < 5 || r.kr !== 'none');
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>팀</th><th class="r">점수</th><th class="r">다음 단계</th></tr></thead><tbody>
    ${show.map((r) => `<tr class="${r.kr !== 'none' ? 'kr' : ''}"><td class="rank">${r.pos}</td><td class="team">${krDot(r.kr)}${teamLink(r.short, r.name)}</td><td class="r num">${r.pts}</td><td class="r small muted">${esc(ko(r.next, PHASE_KO))}</td></tr>`).join('')}
  </tbody></table></div>
  <p class="lead">조별 리그 누적 기준. 상위 ${A.intl.winnersCut}팀은 승자 라운드, 나머지는 패자부활 라운드로 갑니다.</p>`;
}

function seasonTimeline() {
  const t = now();
  return `<ol class="timeline">${A.season.timeline.map((e) => {
    const s = new Date(e.start + 'T00:00:00+09:00'), en = new Date(e.end + 'T23:59:59+09:00');
    const cls = t > en ? 'done' : t >= s ? 'now' : '';
    return `<li class="${cls}"><span>${esc(e.name)}<br><span class="when">${esc(e.where)}</span></span><span class="when">${e.start.slice(5).replace('-', '.')}–${e.end.slice(5).replace('-', '.')}</span></li>`;
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
  const tags = [s.mp ? '<span class="tag mp">매치 포인트</span>' : '', s.live ? '<span class="tag live">LIVE · 비공식</span>' : '', isKrSeries(s) ? '<span class="tag kr">한국</span>' : ''].join(' ');
  let res = '';
  if (s.results?.length) {
    const top = s.results[0];
    const krs = s.results.filter((r) => r.kr !== 'none');
    const inner = `<span><b>1위 ${teamLink(top.short)}</b> ${top.pts}점</span>${krs.filter((r) => r !== top).map((r) => `<span>${krDot(r.kr)}${teamLink(r.short)} ${r.pos}위 ${r.pts}점 (${r.kills}킬)</span>`).join('')}`;
    const full = s.results.length > 5 ? `<details><summary>${s.eventSlug.includes('pro-league') ? '상위 3팀과 한국 관련 팀 표' : `전체 ${s.results.length}팀 결과`}</summary>${resultTable(s.results)}</details>` : '';
    res = `<div class="res ${opt.spoiler ? 'spoiler' : ''}" ${opt.spoiler ? 'tabindex="0" role="button" aria-label="결과 보기"' : ''}>${inner}</div>${opt.spoiler ? '' : full}`;
  }
  return `<article class="match">
    <time datetime="${s.start}">${hhmm(s.start)}</time>
    <div><div class="what">${esc(ko(s.name, PHASE_KO))} ${tags}</div>
      <div class="meta">${esc([ko(s.event, EVENT_KO), s.name === 'Regional Finals' ? '' : ko(s.phase, PHASE_KO), REGION[s.region], s.status !== 'completed' ? state : ''].filter(Boolean).join(', '))}</div>
      ${res}</div>
  </article>`;
}

const resultTable = (rows) => `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>팀</th><th class="r">점수</th><th class="r">킬</th></tr></thead><tbody>${rows.map((r) => `<tr class="${r.kr !== 'none' ? 'kr' : ''}"><td class="rank">${r.pos}</td><td class="team">${krDot(r.kr)}${teamLink(r.short)}</td><td class="r num">${r.pts}</td><td class="r">${r.kills}</td></tr>`).join('')}</tbody></table></div>`;

function schedule(parts, q) {
  const view = q.get('view') === 'results' ? 'results' : 'upcoming';
  const kronly = q.get('kr') === '1';
  let list = A.series.filter((s) => (view === 'results' ? s.status === 'completed' : s.status !== 'completed'));
  if (kronly) list = list.filter(isKrSeries);
  list.sort((a, b) => (view === 'results' ? b.start.localeCompare(a.start) : a.start.localeCompare(b.start)));
  const days = {};
  for (const s of list) (days[dayKey(s.start)] ||= []).push(s);
  return `<h1 class="title">경기</h1><p class="lead">모든 시간은 한국 시간(KST)입니다. 한 시리즈는 보통 6게임입니다.</p>
    <div class="controls">
      <div class="seg" role="group" aria-label="보기"><a href="${qsLink('/schedule', q, { view: 'upcoming' })}" aria-current="${view === 'upcoming'}">예정</a><a href="${qsLink('/schedule', q, { view: 'results' })}" aria-current="${view === 'results'}">결과</a></div>
      <div class="seg"><a href="${qsLink('/schedule', q, { kr: kronly ? '0' : '1' })}" aria-current="${kronly}">한국 팀 경기만</a></div>
    </div>
    ${Object.entries(days).map(([d, ss]) => `<section class="day"><h2 class="day-h">${dayLabel(d)}<small>${ss.length}시리즈</small></h2>${ss.map(matchItem).join('')}</section>`).join('') || '<p class="empty">조건에 맞는 경기가 없습니다. 필터를 끄면 전체 경기를 볼 수 있습니다.</p>'}`;
}

/* ---------- 순위 (진행 중 국제전) ---------- */
function standings() {
  if (!A.intl) return '<h1 class="title">순위</h1><p class="empty">진행 중인 국제전이 없습니다. 프로리그 순위는 포인트 탭에서 볼 수 있습니다.</p>';
  const ev = A.intl;
  const phases = ['Group Stage', 'Bracket Stage', 'Match Point Finals'].map((p) => {
    const ss = A.series.filter((s) => s.eventId === ev.eventId && s.phase === p);
    const done = ss.length && ss.every((s) => s.status === 'completed');
    const first = ss.map((s) => s.start).sort()[0];
    return `<li class="${done ? 'done' : ss.some((s) => s.status !== 'completed') && (first && new Date(first) - now() < 864e5) ? 'now' : ''}"><span>${ko(p, PHASE_KO)}</span><span class="when">${first ? dateTime(first) : ''}</span></li>`;
  }).join('');
  let rows = ev.rows;
  if (opt.krOnly) rows = rows.filter((r) => r.kr !== 'none');
  return `<h1 class="title">순위</h1><p class="lead">${esc(ko(ev.name, EVENT_KO))} 조별 리그 누적 점수입니다.</p>
    <section class="sec"><ol class="timeline">${phases}</ol></section>
    <section class="sec"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>팀</th><th class="c">조</th><th class="r">점수</th><th class="r">킬</th><th class="r">다음 단계</th></tr></thead><tbody>
      ${rows.map((r) => `<tr class="${r.kr !== 'none' ? 'kr' : ''} ${!opt.krOnly && r.pos === ev.winnersCut ? 'cut' : ''}"><td class="rank">${r.pos}</td><td class="team">${krDot(r.kr)}${teamLink(r.short, r.name)}<small>${esc(REGION[r.region] || '')}</small></td><td class="c">${esc(r.group)}</td><td class="r num">${r.pts}</td><td class="r">${r.kills}</td><td class="r small muted">${esc(ko(r.next, PHASE_KO))}</td></tr>${!opt.krOnly && r.pos === ev.winnersCut ? `<tr class="cut-label"><td colspan="6">여기까지 승자 라운드</td></tr>` : ''}`).join('')}
    </tbody></table></div></section>`;
}

/* ---------- 포인트 ---------- */
function points(parts, q) {
  const sub = parts[1] === 'pl' ? 'pl' : 'cp';
  return `<h1 class="title">포인트</h1>
    <div class="controls"><div class="seg" role="group" aria-label="포인트 종류"><a href="#/points/cp" aria-current="${sub === 'cp'}">챔피언십 포인트</a><a href="#/points/pl" aria-current="${sub === 'pl'}">프로리그 포인트</a></div></div>
    ${sub === 'cp' ? cpView(q) : plView(q)}`;
}

function cpView(q) {
  const mode = q.get('m') === 'players' ? 'players' : 'teams';
  const region = q.get('r') || 'all';
  const cut = A.season.cpDirectSlots;
  const krNames = new Set(Object.values(A.teams).flatMap((t) => t.krPlayers || []));
  const regionSeg = `<div class="seg" role="group" aria-label="지역">${['all', 'apac-n', 'apac-s', 'emea', 'americas'].map((r) => `<a href="${qsLink('/points/cp', q, { r })}" aria-current="${region === r}">${r === 'all' ? '전체' : REGION[r]}</a>`).join('')}</div>`;
  const modeSeg = `<div class="seg" role="group" aria-label="단위"><a href="${qsLink('/points/cp', q, { m: 'teams' })}" aria-current="${mode === 'teams'}">팀</a><a href="${qsLink('/points/cp', q, { m: 'players' })}" aria-current="${mode === 'players'}">선수</a></div>`;
  const krSummary = (A.kr || []).filter((k) => k.cp).map((k) => `<tr class="kr"><td class="rank">${k.cp.rank}</td><td class="team">${krDot(k.level)}${teamLink(k.short, k.name)}</td><td class="r num">${fmt(k.cp.total)}</td><td class="r small">${k.cp.status === 'direct' ? `<span class="tag ok">직행권</span> 33위와 +${fmt(k.cp.gap)}` : `32위까지 −${fmt(k.cp.gap)}`}</td></tr>`).join('');

  let table;
  if (mode === 'teams') {
    let rows = A.cp.filter((r) => region === 'all' || r.region === region);
    if (opt.krOnly) rows = rows.filter((r) => r.kr !== 'none');
    table = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>팀</th><th class="r">CP</th><th class="r">상태</th></tr></thead><tbody>
      ${rows.map((r, i) => {
        const isCut = region === 'all' && !opt.krOnly && r.rank === cut;
        return `<tr class="expandable ${r.kr !== 'none' ? 'kr' : ''} ${isCut ? 'cut' : ''}" data-toggle="cp-${i}" tabindex="0" aria-expanded="false"><td class="rank">${r.rank}</td><td class="team">${krDot(r.kr)}${teamLink(r.short, r.name)}<small>${esc(REGION[r.region] || '')}</small></td><td class="r num">${fmt(r.total)}</td><td class="r">${r.status === 'direct' ? '<span class="tag ok">직행권</span>' : '<span class="tag">LCQ 대상</span>'}</td></tr>
        <tr class="detail" id="cp-${i}" hidden><td></td><td colspan="3">합산 선수: ${r.players.map(([n, p]) => `${esc(n)} ${fmt(p)}`).join(', ')}</td></tr>
        ${isCut ? `<tr class="cut-label"><td colspan="4">여기까지 챔피언십 직행 (현재 기준)</td></tr>` : ''}`;
      }).join('')}
    </tbody></table></div>`;
  } else {
    const ps = A.cp.filter((r) => region === 'all' || r.region === region).flatMap((r) => r.players.map(([n, p]) => ({ n, p, short: r.short, kr: krNames.has(n) })))
      .filter((x) => !opt.krOnly || x.kr).sort((a, b) => b.p - a.p).slice(0, 150);
    table = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>선수</th><th>팀</th><th class="r">CP</th></tr></thead><tbody>
      ${ps.map((x, i) => `<tr class="${x.kr ? 'kr' : ''}"><td class="rank">${i + 1}</td><td class="team">${x.kr ? krDot('team') : ''}${esc(x.n)}</td><td>${teamLink(x.short)}</td><td class="r num">${fmt(x.p)}</td></tr>`).join('')}
    </tbody></table></div><p class="lead">공식 순위표가 팀별로 공개하는 합산 대상 선수(상위 3인)만 표시합니다.</p>`;
  }
  return `<p class="lead">${A.season.cpDirectSlots}위까지 챔피언십 직행, 나머지 ${A.season.lcqSlots}자리는 LCQ에서 정합니다. 팀 CP는 현재 로스터에서 CP가 높은 선수 3명의 합입니다.</p>
    ${krSummary ? `<section class="sec"><h2 class="h2">한국 관련 팀</h2><div class="tbl-wrap" style="margin-top:8px"><table class="tbl"><tbody>${krSummary}</tbody></table></div></section>` : ''}
    <section class="sec"><div class="controls">${modeSeg}${regionSeg}</div>${table}</section>
    <div class="explain"><b>선수 1명이 받는 CP</b> (최종 순위별)
      <table><tr><td>프로리그</td><td>${A.season.scoring.cpProLeague.slice(0, 10).join(', ')} … (30위 ${A.season.scoring.cpProLeague.at(-1)})</td></tr>
      <tr><td>플레이오프</td><td>${A.season.scoring.cpPlayoffs.slice(0, 10).join(', ')} …</td></tr></table>
      <p style="margin:6px 0 0">진행 중인 대회의 CP는 대회가 끝난 뒤 공식 순위표에 반영됩니다. 값이 다르면 공식 순위표가 기준입니다.</p></div>`;
}

function plView(q) {
  const keys = Object.keys(A.pl);
  const split = q.get('s') || String(Math.max(...keys.map((k) => +k.slice(1, 2))));
  const region = q.get('r') || 'apac-n';
  const sort = q.get('sort') === 'rs' ? 'rs' : 'final';
  const P = A.pl[`s${split}:${region}`];
  const seg = (name, cur, items) => `<div class="seg" role="group" aria-label="${name}">${items.map(([v, l, patch]) => `<a href="${qsLink('/points/pl', q, patch)}" aria-current="${cur === v}">${l}</a>`).join('')}</div>`;
  const controls = `<div class="controls">
    ${seg('지역', region, ['apac-n', 'apac-s', 'emea', 'americas'].map((r) => [r, REGION[r], { r }]))}
    ${seg('스플릿', split, [['1', 'Split 1', { s: '1' }], ['2', 'Split 2', { s: '2' }]])}
    ${seg('정렬', sort, [['final', '최종 순위', { sort: 'final' }], ['rs', '정규 시즌', { sort: 'rs' }]])}
  </div>`;
  if (!P) return controls + '<p class="empty">이 지역·스플릿 데이터가 아직 없습니다.</p>';
  let rows = P.rows.slice();
  if (sort === 'rs') rows.sort((a, b) => (b.rs ?? 0) - (a.rs ?? 0) || (b.kills ?? 0) - (a.kills ?? 0)).forEach((r, i) => (r._rk = i + 1));
  else rows.forEach((r) => (r._rk = r.pos));
  if (opt.krOnly) rows = rows.filter((r) => r.kr !== 'none');
  const lines = sort === 'rs' && !opt.krOnly ? { [P.playoffsLine]: `여기까지 정규 시즌 순위로 플레이오프 진출 (리전 결승 우승팀 1자리 추가)`, [P.rfLine]: '여기까지 리전 결승 진출' } : {};
  const krHere = rows.filter((r) => r.kr !== 'none');
  return `${controls}
    <p class="lead">${esc(P.label)}. 시리즈(하루 6게임) 순위마다 프로리그 포인트를 받고, 9개 시리즈 합으로 정규 시즌 순위를 정합니다. 최종 순위는 리전 결승까지 반영한 값입니다.</p>
    ${krHere.length && !opt.krOnly ? `<div class="kr-list" style="margin-top:12px">${krHere.map((r) => `<a class="kr-row" href="#/teams/${encodeURIComponent(r.short)}"><span class="who">${krDot(r.kr)}${esc(r.name)}</span><span class="val">${r.pos}위</span><span class="sub">정규 시즌 ${r.rs ?? '–'}점, ${r.kills ?? '–'}킬${r.qualified ? ', 플레이오프 진출' : ''}</span></a>`).join('')}</div>` : ''}
    <section class="sec"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>팀</th><th class="c">조</th><th class="r">정규 점수</th><th class="r">킬</th><th class="r">CP/인</th></tr></thead><tbody>
      ${rows.map((r) => `<tr class="${r.kr !== 'none' ? 'kr' : ''} ${lines[r._rk] ? 'cut' : ''}"><td class="rank">${r._rk}</td><td class="team">${krDot(r.kr)}${teamLink(r.short, r.name)}${r.qualified ? ' <span class="tag ok">PO</span>' : ''}</td><td class="c">${esc(r.group)}</td><td class="r num">${r.rs ?? '–'}</td><td class="r">${r.kills ?? '–'}</td><td class="r">${fmt(r.cpPP)}</td></tr>${lines[r._rk] ? `<tr class="cut-label"><td colspan="6">${lines[r._rk]}</td></tr>` : ''}`).join('')}
    </tbody></table></div></section>
    <div class="explain"><b>점수 계산</b>
      <table><tr><td>게임</td><td>순위 점수 + 킬당 1점 (1위 12, 2위 9, 3위 7, 4위 5, 5위 4 …)</td></tr>
      <tr><td>정규 시즌</td><td>시리즈 순위별 ${A.season.scoring.plRegular.slice(0, 5).join(', ')} … 20위 0</td></tr>
      <tr><td>리전 결승</td><td>${A.season.scoring.plFinals.slice(0, 5).join(', ')} … 20위 0</td></tr></table></div>`;
}

/* ---------- 팀 ---------- */
function teams(parts) {
  if (parts[1]) return teamDetail(decodeURIComponent(parts[1]));
  const all = Object.values(A.teams).filter((t) => t.cp || t.krLevel !== 'none');
  const tile = (t) => `<a class="team-tile ${t.krLevel !== 'none' ? 'kr' : ''}" href="#/teams/${encodeURIComponent(t.short)}" data-name="${esc((t.short + ' ' + t.name + ' ' + (t.roster || []).map((p) => p.n).join(' ')).toLowerCase())}"><b>${esc(t.short)}</b><span>${esc(t.name)}${t.cp ? `, CP ${t.cp.rank}위` : ''}</span></a>`;
  const groups = [['한국 관련', all.filter((t) => t.krLevel !== 'none')], ...['apac-n', 'apac-s', 'emea', 'americas'].map((r) => [REGION[r], all.filter((t) => t.region === r && t.krLevel === 'none').sort((a, b) => (a.cp?.rank ?? 999) - (b.cp?.rank ?? 999))])];
  return `<h1 class="title">팀</h1>
    <label class="visually-hidden" for="teamSearch">팀 또는 선수 검색</label>
    <input class="search" id="teamSearch" type="search" placeholder="팀이나 선수 이름으로 찾기" autocomplete="off">
    ${groups.map(([g, ts]) => ts.length ? `<section class="sec team-group"><h2 class="h2">${esc(g)}</h2><div class="team-grid">${ts.map(tile).join('')}</div></section>` : '').join('')}`;
}

function teamDetail(short) {
  const t = team(short);
  if (!t) return `<h1 class="title">팀</h1><p class="empty">${esc(short)} 팀을 찾지 못했습니다. <a href="#/teams">팀 목록</a>에서 다시 고르세요.</p>`;
  const plRows = Object.entries(A.pl).map(([k, P]) => [P, P.rows.find((r) => r.id === t.id)]).filter(([, r]) => r);
  const ir = A.intl?.rows.find((r) => r.id === t.id);
  const ss = A.series.filter((s) => s.results?.some((r) => r.short === short)).sort((a, b) => b.start.localeCompare(a.start));
  const st = A.streams.players.filter((p) => p.team === short && p.url);
  const roleKo = { p: '선수', c: '주장', k: '코치' };
  return `<p style="margin:14px 0 0"><a class="more" href="#/teams">팀 목록</a></p>
    <h1 class="title">${esc(t.name)}</h1>
    <p class="lead">${esc(REGION[t.region] || '')}${t.krLevel === 'team' ? ' <span class="tag kr">한국 팀</span>' : t.krLevel === 'member' ? ' <span class="tag kr">한국 선수 소속</span>' : ''}${t.cp ? `, 챔피언십 포인트 ${t.cp.rank}위 (${fmt(t.cp.total)} CP)` : ''}</p>
    ${t.roster?.length ? `<section class="sec"><h2 class="h2">로스터</h2><ul class="roster-list">${t.roster.map((p) => `<li><span>${p.c === 'KR' ? krDot('team') : ''}${esc(p.n)}</span><span class="muted small">${esc(p.c || '')}${roleKo[p.r] ? ', ' + roleKo[p.r] : ''}</span></li>`).join('')}</ul></section>` : ''}
    <section class="sec"><h2 class="h2">시즌 성적</h2><div class="tbl-wrap"><table class="tbl"><thead><tr><th>대회</th><th class="r">순위</th><th class="r">점수</th></tr></thead><tbody>
      ${ir ? `<tr><td>${esc(ko(A.intl.name, EVENT_KO))} 조별 리그</td><td class="r num">${ir.pos}</td><td class="r">${ir.pts}점</td></tr>` : ''}
      ${plRows.sort((a, b) => b[0].split - a[0].split).map(([P, r]) => `<tr><td>${esc(P.label)}</td><td class="r num">${r.pos}</td><td class="r">정규 ${r.rs ?? '–'}점</td></tr>`).join('')}
    </tbody></table></div></section>
    ${ss.length ? `<section class="sec"><h2 class="h2">경기 결과</h2>${ss.slice(0, 12).map((s) => { const r = s.results.find((x) => x.short === short); return `<div class="stream"><span>${dayLabel(dayKey(s.start))} ${esc(ko(s.name, PHASE_KO))}<br><span class="muted small">${esc(ko(s.event, EVENT_KO))}</span></span><span class="${opt.spoiler ? 'spoiler' : ''}"><b class="num">${r.pos}위</b> ${r.pts}점</span></div>`; }).join('')}</section>` : ''}
    ${st.length ? `<section class="sec"><h2 class="h2">선수 방송</h2>${st.map((p) => `<div class="stream"><a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.name)}</a><span class="muted small">${esc(p.provider)}</span></div>`).join('')}</section>` : ''}
    <p class="lead" style="margin-top:20px"><a href="https://liquipedia.net/apexlegends/index.php?search=${encodeURIComponent(t.name)}" target="_blank" rel="noopener">Liquipedia에서 보기</a></p>`;
}

/* ---------- 방송 ---------- */
function streams() {
  const S = A.streams;
  return `<h1 class="title">방송</h1><p class="lead">APAC North 공식 중계는 일본어, 국제전 공식 중계는 영어입니다.</p>
    <section class="sec"><h2 class="h2">공식 중계</h2>${S.official.map((s) => `<div class="stream"><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.ch)}</a><span class="muted small">${esc(s.name)}, ${esc(s.provider)}</span></div>`).join('')}</section>
    <section class="sec"><h2 class="h2">한국어 중계</h2>${S.korean.filter((s) => s.url).map((s) => `<div class="stream"><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a></div>`).join('') || '<p class="empty">등록된 한국어 중계가 없습니다.</p>'}</section>
    <section class="sec"><h2 class="h2">한국 선수 개인 방송</h2>${S.players.map((p) => `<div class="stream"><span>${krDot('team')}${p.url ? `<a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.name)}</a>` : esc(p.name)} <span class="muted small">${teamLink(p.team)}</span></span><span class="muted small">${p.url ? esc(p.provider) : '채널 정보 없음'}</span></div>`).join('')}</section>`;
}

/* ---------- 이벤트 연결 ---------- */
function bind() {
  app.querySelectorAll('[data-toggle]').forEach((tr) => {
    const go = () => { const d = document.getElementById(tr.dataset.toggle); d.hidden = !d.hidden; tr.setAttribute('aria-expanded', String(!d.hidden)); };
    tr.addEventListener('click', (e) => { if (e.target.closest('a')) return; go(); });
    tr.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  });
  app.querySelectorAll('.spoiler').forEach((el) => {
    const show = () => el.classList.remove('spoiler');
    el.addEventListener('click', show);
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show(); } });
  });
  const search = document.getElementById('teamSearch');
  if (search) search.addEventListener('input', () => {
    const v = search.value.trim().toLowerCase();
    app.querySelectorAll('.team-tile').forEach((t) => { t.hidden = v && !t.dataset.name.includes(v); });
    app.querySelectorAll('.team-group').forEach((g) => { g.hidden = ![...g.querySelectorAll('.team-tile')].some((t) => !t.hidden); });
  });
}

function setupSettings() {
  const dlg = document.getElementById('settings');
  const dark = document.getElementById('optDark'), sp = document.getElementById('optSpoiler'), kr = document.getElementById('optKrOnly');
  document.getElementById('settingsBtn').addEventListener('click', () => {
    dark.checked = document.documentElement.dataset.theme === 'dark';
    sp.checked = opt.spoiler; kr.checked = opt.krOnly;
    document.getElementById('dataInfo').innerHTML = dataInfo();
    dlg.showModal();
  });
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
    s.onload = () => { s.remove(); A = window.ALGS; applyLive(); footer(); render(); res(); };
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
    if (l.results) s.results = l.results.map((r) => ({ ...r, kr: krOf(r.short) }));
    s.kr = (s.results || []).filter((r) => r.kr !== 'none').map((r) => r.short);
  }
}

/* ---------- 시작 ---------- */
window.addEventListener('hashchange', () => { render(); app.focus({ preventScroll: true }); window.scrollTo(0, 0); });
setupSettings();
footer();
render();
pollVer();
setInterval(pollVer, C.verPollMs || 60000);
if (C.liveUrl) { pollLive(); setInterval(pollLive, C.livePollMs || 10000); }
setInterval(() => { if (!parseHash().parts[0]) render(); }, 60000); // 홈 카운트다운 갱신
