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

// 팀 페이지의 로스터: {{SquadPlayer|...}} 줄마다 이름·국적·역할·들어온 날·나간 날과, 그 줄이 속한 묶음(active/inactive/former)
export function squadOf(text) {
  if (!text) return null;
  const rows = [];
  let status = 'active';
  // 묶음 머리: {{Squad|status=former …}}, {{SquadStart|…}}, ==Former== 같은 제목
  const re = /\{\{\s*Squad\s*\|([^\n]*)|\{\{\s*SquadStart[^\n]*|^=+\s*([^=\n]+?)\s*=+\s*$|\{\{\s*SquadPlayer\s*\|((?:[^{}]|\{\{[^{}]*\}\})*)\}\}/gim;
  for (const m of text.matchAll(re)) {
    if (m[1] != null) { const st = val('|' + m[1], 'status').toLowerCase(); status = st || 'active'; continue; }
    if (m[2] != null) { const h = m[2].toLowerCase(); if (/former/.test(h)) status = 'former'; else if (/inactive/.test(h)) status = 'inactive'; else if (/active|player roster|roster/.test(h)) status = 'active'; continue; }
    if (m[3] != null) {
      const s = '|' + m[3];
      rows.push({ n: val(s, 'id'), link: val(s, 'link'), c: val(s, 'flag').toUpperCase(), role: val(s, 'role') || val(s, 'position'), join: val(s, 'joindate'), leave: val(s, 'leavedate'), inactive: val(s, 'inactivedate'), status: val(s, 'leavedate') ? 'former' : val(s, 'inactivedate') ? 'inactive' : status });
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
  for (const [title, text] of Object.entries(T.out)) { const sq = squadOf(text); if (sq?.length) teams[title] = sq; }
  const players = {};
  for (const [title, text] of Object.entries(P.out)) { const p = playerOf(text); if (p) players[title] = p; }
  const out = { at: new Date().toISOString(), teamRedirects: T.redirects, playerRedirects: P.redirects, teams, players };
  if (keepRaw) {
    const cut = (t) => { const a = t.search(/\{\{\s*Squad/i), b = t.lastIndexOf('SquadPlayer'); return a < 0 ? '' : t.slice(a, b > a ? Math.min(t.length, b + 600) : a + 600); };
    out.teamsRaw = Object.fromEntries(Object.entries(T.out).filter(([, t]) => t).map(([k, t]) => [k, cut(t)]));
    out.playersRaw = Object.fromEntries(Object.entries(P.out).filter(([, t]) => t).map(([k, t]) => { const i = t.search(/\{\{\s*Infobox player/i); const e = t.indexOf('\n}}', i); return [k, i < 0 ? '' : t.slice(i, e > i ? e + 3 : i + 3000)]; }));
  }
  writeJson(OUT, out);
  console.log(`[lp-squads] 팀 ${Object.keys(teams).length}곳, 선수 ${Object.keys(players).length}명 저장`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.log('[lp-squads] 실패:', e.message); process.exitCode = 0; });
