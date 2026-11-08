// Liquipedia 팀 페이지의 현재 로스터(Squad)와 선수 페이지 정보(현재 팀, 상태, 넘겨주기)를 받는다 → raw/lp/squads.json
// 로스터 최신화 대조용. 위키 원문(action=query)만 쓰므로 2초 간격 규칙으로 충분하다.
//   node scripts/fetch-lp-squads.mjs          (7일이 지났을 때만 받음)
//   node scripts/fetch-lp-squads.mjs --force  (지금 받기)
import { UA, readJson, writeJson, sleep } from './lib.mjs';
import { lcqOpponents } from './rosters.mjs';

const API = 'https://liquipedia.net/apexlegends/api.php';
const OUT = 'raw/lp/squads.json';
const WEEK = 7 * 864e5;
const force = process.argv.includes('--force');
const keepRaw = process.argv.includes('--raw'); // 원문 조각도 저장(해석 규칙 점검용)

async function api(params) {
  await sleep(2100);
  const res = await fetch(`${API}?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`, { headers: { 'User-Agent': UA, 'Accept-Encoding': 'gzip' } });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

// 제목 여러 개의 원문을 50개씩 받는다. 넘겨주기(옛 이름 → 새 이름)와 표기 정리도 함께 돌려준다
async function texts(titles) {
  const out = {}, redirects = {};
  for (let i = 0; i < titles.length; i += 50) {
    const chunk = titles.slice(i, i + 50);
    const j = await api({ action: 'query', prop: 'revisions', rvprop: 'content', rvslots: 'main', redirects: '1', titles: chunk.join('|') });
    const norm = Object.fromEntries((j.query?.normalized || []).map((n) => [n.to, n.from]));
    for (const r of j.query?.redirects || []) redirects[norm[r.from] || r.from] = r.to;
    for (const p of j.query?.pages || []) out[p.title] = p.missing ? null : p.revisions?.[0]?.slots?.main?.content || '';
    console.log(`[lp-squads] ${Math.min(i + 50, titles.length)}/${titles.length}`);
  }
  return { out, redirects };
}

const val = (s, k) => (s.match(new RegExp(`\\|\\s*${k}\\s*=\\s*([^|}\\n]*)`)) || [])[1]?.trim() || '';
// 각주·주석은 값 안에 '|'·'/'를 섞어 넣으므로 먼저 지운다
const clean = (t) => t.replace(/<!--[\s\S]*?-->/g, '').replace(/<ref[^>]*\/>/gi, '').replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '').replace(/<ref[^>]*>/gi, '');

// 팀 페이지의 로스터 묶음({{Squad|status=…|type=staff}} … }})을 차례로 돌려준다
export function squadBlocks(text) {
  const out = [];
  const re = /\{\{\s*Squad\s*\|([^\n]*)/gi;
  for (let m; (m = re.exec(text)); ) {
    // 묶음 끝: 줄 머리의 '}}'
    const e = text.indexOf('\n}}', m.index);
    const body = text.slice(m.index, e > 0 ? e + 3 : text.length);
    const head = '|' + m[1];
    out.push({ status: (val(head, 'status') || 'active').toLowerCase(), staff: /staff/i.test(val(head, 'type')), body });
    re.lastIndex = e > 0 ? e : text.length;
  }
  return out;
}

// 로스터 줄: {{Person|id=|flag=|role=|joindate=|leavedate=|inactivedate=|newteam=|link=}} (옛 틀 {{SquadPlayer}}도 같은 꼴)
export function squadOf(text) {
  if (!text) return null;
  const rows = [];
  for (const b of squadBlocks(clean(text))) {
    for (const m of b.body.matchAll(/\{\{\s*(?:Person|SquadPlayer)\s*\|((?:[^{}]|\{\{[^{}]*\}\})*)\}\}/gi)) {
      const s = '|' + m[1];
      const leave = val(s, 'leavedate'), inactive = val(s, 'inactivedate'), role = val(s, 'role') || val(s, 'position');
      rows.push({
        n: val(s, 'id'), link: val(s, 'link'), c: val(s, 'flag').toUpperCase(), role,
        staff: b.staff || /coach|analyst|manager|owner|ceo|director|strateg|trainer/i.test(role),
        join: val(s, 'joindate'), leave, inactive, newteam: val(s, 'newteam'),
        status: b.status === 'former' || leave ? 'former' : b.status === 'inactive' || inactive ? 'inactive' : 'active',
      });
    }
  }
  return rows.filter((r) => r.n);
}

// 선수 페이지 정보: 지금 팀, 상태, 국적
export function playerOf(text) {
  if (!text) return null;
  const i = text.search(/\{\{\s*Infobox player/i);
  if (i < 0) return null;
  const e = text.indexOf('\n}}', i);
  const box = text.slice(i, e > i ? e + 3 : i + 3000);
  return { id: val(box, 'id'), team: val(box, 'team'), team2: val(box, 'team2'), status: val(box, 'status'), c: val(box, 'country'), role: val(box, 'role') };
}

async function main() {
  const prev = readJson(OUT, null);
  if (!force && prev && Date.now() - Date.parse(prev.at) < WEEK) { console.log('[lp-squads] 7일 안에 받음 → 건너뜀'); return; }
  // 팀 페이지: Liquipedia 프로리그·서킷 표에 걸린 팀 페이지 + LCQ 참가 팀 이름
  const src = readJson('raw/lp/teams-src.json', { pages: {} });
  const teamTitles = new Set();
  for (const [k, pg] of Object.entries(src.pages || {})) (pg.teams || []).forEach((t, i) => { if (t.page && (k.startsWith('pl:') || i < 40)) teamTitles.add(t.page.replace(/_/g, ' ')); });
  const lcq = readJson('raw/lp/lcq.json', { pages: {} });
  const opp = [];
  for (const r of ['apac-n', 'apac-s', 'emea', 'americas']) for (const o of lcqOpponents(lcq.pages?.[r]?.text || '')) { teamTitles.add(o.name); opp.push(...o.roster.map((p) => p.n)); }
  // 선수 페이지: 공식 현재 로스터 선수 + LCQ 참가 명단 선수
  const snap = readJson('raw/algs/snapshot.json', {});
  const playerTitles = new Set(opp);
  for (const ps of Object.values(snap.rosters || {})) for (const p of ps) playerTitles.add(String(p[1]).trim());
  const T = await texts([...teamTitles].filter(Boolean));
  const P = await texts([...playerTitles].filter(Boolean));
  const teams = {};
  const yearAgo = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
  for (const [title, text] of Object.entries(T.out)) {
    const sq = squadOf(text)?.filter((r) => r.status !== 'former' || (r.leave || '') >= yearAgo);
    if (sq?.length) teams[title] = sq;
  }
  const players = {};
  for (const [title, text] of Object.entries(P.out)) { const p = playerOf(text); if (p) players[title] = p; }
  const out = { at: new Date().toISOString(), teamRedirects: T.redirects, playerRedirects: P.redirects, teams, players };
  if (keepRaw) {
    // 원문은 지금 묶음(active·inactive·staff)과 최근 1년 안에 나간 기록이 있는 묶음만
    const cut = (t) => squadBlocks(t).filter((b) => b.status !== 'former' || [...b.body.matchAll(/leavedate\s*=\s*(\d{4}-\d\d-\d\d)/g)].some((m) => m[1] >= yearAgo)).map((b) => b.body).join('\n');
    out.teamsRaw = Object.fromEntries(Object.entries(T.out).filter(([, t]) => t).map(([k, t]) => [k, cut(t)]));
    out.playersRaw = Object.fromEntries(Object.entries(P.out).filter(([, t]) => t).map(([k, t]) => { const i = t.search(/\{\{\s*Infobox player/i); const e = t.indexOf('\n}}', i); return [k, i < 0 ? '' : t.slice(i, e > i ? e + 3 : i + 3000)]; }));
  }
  writeJson(OUT, out);
  console.log(`[lp-squads] 팀 ${Object.keys(teams).length}곳, 선수 ${Object.keys(players).length}명 저장`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.log('[lp-squads] 실패:', e.message); process.exitCode = 0; });
