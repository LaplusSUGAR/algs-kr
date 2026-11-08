// 로스터 변경 자동 확인과 기록 (build-data.mjs에서 부른다)
//
// 1) 공식 API 로스터: 지난 빌드와 비교해 바뀐 선수를 기록한다. 공식 값은 원래 그대로 사이트에 반영된다.
// 2) Liquipedia LCQ 참가 명단 → 공식 로스터보다 먼저 반영(자동 이동)
//    · 이적: 같은 지역 다른 팀의 공식 선수가 이 팀 명단에 있으면(이름이 같음) 그 선수를 옮긴다
//    · 그 밖의 차이: 처음 본 차이(이름 표기 차이 등)는 기준으로 두고, 그 뒤 새로 생긴 차이만 반영한다
//      (새로 들어온 선수 = in, 명단에서 빠진 공식 선수 = out)
//    · 공식 로스터가 같아지면(공식 반영) 또는 Liquipedia에서 되돌리면 자동 이동을 거둔다
//      공식 로스터가 바뀐 팀은 기준을 새로 잡는다
// 3) 2부(챌린저 서킷) 팀: 명단은 늘 Liquipedia 값. 바뀌면 기록, 팀 이름 변경도 기록
// 4) 수동 이동(config/overrides.json rosterMoves): 새로 넣거나 지우면 기록
//
// 상태: raw/rosters/state.json (지난 빌드 값)
// 기록: logs/roster-changes.json (새것이 위), logs/roster-changes.md (사람이 읽는 표)
import fs from 'node:fs';
import path from 'node:path';
import { nk } from './lp-teams-parse.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const STATE = path.join(ROOT, 'raw/rosters/state.json');
const LOG_JSON = path.join(ROOT, 'logs/roster-changes.json');
const LOG_MD = path.join(ROOT, 'logs/roster-changes.md');
const read = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const write = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
const REGION_LP = { 'apac-n': 'apac-n', 'apac-s': 'apac-s', emea: 'emea', americas: 'americas' };

// 이름 맞추기: 정규화가 같으면 같은 선수, 아니면 한쪽이 다른 쪽을 포함(3자 이상) 또는 편집 거리 2 이하(4자 이상)
function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
const near = (a, b) => { a = nk(a); b = nk(b); if (!a || !b) return false; if (a === b) return true; if (Math.min(a.length, b.length) >= 3 && (a.includes(b) || b.includes(a))) return true; return Math.min(a.length, b.length) >= 4 && lev(a, b) <= 2; };
// 공식 명단과 Liquipedia 명단을 짝지어 짝 없는 쪽만 돌려준다 (같은 이름 먼저, 그다음 비슷한 이름)
function align(off, lp) {
  const o = [...off], l = [...lp];
  for (const pass of [(a, b) => nk(a) === nk(b), near]) {
    for (let i = o.length - 1; i >= 0; i--) { const j = l.findIndex((x) => pass(o[i], x)); if (j >= 0) { o.splice(i, 1); l.splice(j, 1); } }
  }
  return { off: o, lp: l };
}
// Liquipedia LCQ 참가 명단(wikitext): 팀 이름 · 선수(스태프 제외, 서브 표시 · 국적)
export function lcqOpponents(text) {
  return [...(text || '').matchAll(/\{\{Opponent\|([^\n|}]*)\s*\|players=\{\{Persons([\s\S]*?)\n\s*\}\}/g)].map((m) => ({
    name: m[1].trim(),
    roster: [...m[2].matchAll(/\{\{Person\|([^|}]+)([^}]*)\}\}/g)].filter((p) => !/type=staff/.test(p[2]))
      .map((p) => ({ n: p[1].trim().replace(/_/g, ' '), c: (p[2].match(/flag=([a-z]{2})\b/i)?.[1] || '').toUpperCase(), sub: /status=sub|played=false/.test(p[2]) })),
  }));
}

export function createRosterWatch(nowIso) {
  const state = read(STATE, null);
  const first = !state;
  const st = state || { official: {}, base: {}, moves: [], cc: {}, renames: {}, manual: [] };
  const log = read(LOG_JSON, []);
  const add = (e) => log.unshift({ at: nowIso, ...e });
  const names = (arr) => arr.map((x) => (typeof x === 'string' ? x : x.n));
  const W = {};

  // 1) 공식 로스터 비교. teams = build-data의 팀(로스터 이동 전), ids = 현재 팀 id
  W.official = (teams, ids) => {
    const cur = {};
    for (const t of Object.values(teams)) if (ids.has(t.id) && t.roster?.length) cur[t.short] = { region: t.region, name: t.name, players: t.roster.filter((p) => p.r !== 'k').map((p) => p.n), coaches: t.roster.filter((p) => p.r === 'k').map((p) => p.n) };
    W.changedTeams = new Set();
    for (const [sh, c] of Object.entries(cur)) {
      const p = st.official[sh];
      if (!p) continue;
      // 선수 ↔ 코치 역할만 바뀐 사람(config/players.json 역할 보정 포함)은 변경으로 보지 않는다
      const pAll = [...p.players, ...p.coaches], cAll = [...c.players, ...c.coaches];
      const out = [...p.players.filter((n) => !cAll.includes(n)), ...p.coaches.filter((n) => !cAll.includes(n)).map((n) => `${n} (코치)`)];
      const inn = [...c.players.filter((n) => !pAll.includes(n)), ...c.coaches.filter((n) => !pAll.includes(n)).map((n) => `${n} (코치)`)];
      if (out.length || inn.length) { add({ kind: 'official', team: sh, teamName: c.name, region: c.region, out, in: inn }); W.changedTeams.add(sh); }
    }
    W.cur = cur;
    st.official = cur;
  };

  // 2) Liquipedia LCQ 명단 → 자동 이동. lpLcq = raw/lp/lcq.json
  W.lcq = (lpLcq) => {
    const cur = W.cur;
    const moves = [];
    const flags = {};
    for (const region of Object.keys(REGION_LP)) {
      const opps = lcqOpponents(lpLcq?.pages?.[region]?.text);
      if (!opps.length) continue;
      const teamsR = Object.entries(cur).filter(([, c]) => c.region === region);
      // 참가 팀 ↔ 공식 팀: 이름이 같거나, 선수 2명 이상이 같은 팀 (예: 'Alternative Gaming' = ALTERNATIVE, 'RIDDLE ZERO' = RIDDLEORDER ZERO)
      const teamOf = (o) => {
        const byName = teamsR.find(([sh, c]) => nk(c.name) === nk(o.name) || nk(sh) === nk(o.name));
        if (byName) return byName[0];
        const main = o.roster.filter((p) => !p.sub).map((p) => p.n);
        const hits = teamsR.map(([sh, c]) => [sh, c.players.filter((n) => main.some((m) => nk(m) === nk(n))).length]).filter(([, k]) => k >= 2).sort((a, b) => b[1] - a[1]);
        return hits.length && (hits.length === 1 || hits[0][1] > hits[1][1]) ? hits[0][0] : null;
      };
      // 같은 지역 공식 선수 이름 → 팀 (이름이 한 팀에만 있을 때)
      const owner = new Map(), dup = new Set();
      for (const [sh, c] of teamsR) for (const n of c.players) { const k = nk(n); if (k.length < 3) continue; if (owner.has(k) && owner.get(k).sh !== sh) dup.add(k); else owner.set(k, { sh, n }); }
      for (const k of dup) owner.delete(k);
      const lpOf = {};
      for (const o of opps) { const sh = teamOf(o); if (sh) lpOf[sh] = o; }
      for (const [sh, o] of Object.entries(lpOf)) {
        for (const p of o.roster) if (p.c) flags[nk(p.n)] = p.c;
        const off = cur[sh].players, lpAll = o.roster.map((p) => p.n), lpMain = o.roster.filter((p) => !p.sub).map((p) => p.n);
        const a = align(off, lpAll);
        // 기준: 처음 본 차이, 또는 공식 로스터가 바뀐 팀은 새로 잡는다
        if (!st.base[sh] || W.changedTeams.has(sh)) st.base[sh] = { off: a.off, lp: a.lp };
        const base = st.base[sh];
        const inn = [], out = [];
        for (const n of a.lp) {
          if (!lpMain.includes(n)) continue; // 서브는 넣지 않는다
          const from = owner.get(nk(n));
          if (from && from.sh !== sh) { inn.push(from.n); moves.push({ team: from.sh, out: [from.n], in: [], src: 'lp-transfer', to: sh }); continue; } // 이적 (공식 이름으로)
          if (!base.lp.some((x) => nk(x) === nk(n))) inn.push(n);
        }
        for (const n of a.off) if (!base.off.some((x) => nk(x) === nk(n))) out.push(n);
        if (inn.length || out.length) moves.push({ team: sh, out, in: inn, src: 'lp' });
      }
    }
    // 같은 팀 이동 합치기
    const merged = {};
    for (const m of moves) { const x = (merged[m.team] ||= { team: m.team, out: [], in: [] }); for (const n of m.out) if (!x.out.includes(n)) x.out.push(n); for (const n of m.in) if (!x.in.includes(n)) x.in.push(n); }
    const now = Object.values(merged).filter((m) => m.out.length || m.in.length);
    // 지난 빌드와 비교해 새로 생긴 / 거둔 자동 이동 기록
    const key = (m) => `${m.team}|${[...m.out].sort().join(',')}|${[...m.in].sort().join(',')}`;
    const prev = new Map((st.moves || []).map((m) => [key(m), m]));
    const curK = new Map(now.map((m) => [key(m), m]));
    for (const [k, m] of curK) if (!prev.has(k)) add({ kind: 'auto', team: m.team, teamName: cur[m.team]?.name, region: cur[m.team]?.region, out: m.out, in: m.in });
    for (const [k, m] of prev) if (!curK.has(k)) add({ kind: 'auto-end', team: m.team, teamName: cur[m.team]?.name, region: cur[m.team]?.region, out: m.out, in: m.in });
    st.moves = now.map((m) => ({ ...m, since: prev.get(key(m))?.since || nowIso }));
    W.flags = flags;
    return st.moves.map((m) => ({ team: m.team, out: m.out, in: m.in, date: m.since.slice(0, 10), auto: 1 }));
  };

  // 4) 수동 이동 (config rosterMoves) 넣기·지우기 기록
  W.manual = (list) => {
    const key = (m) => `${m.team}|${(m.out || []).join(',')}|${(m.in || []).join(',')}`;
    const prev = new Set(st.manual || []);
    const cur = (list || []).filter((m) => m.team);
    for (const m of cur) if (!prev.has(key(m))) add({ kind: 'manual', at: m.date ? `${m.date}T00:00:00+09:00` : nowIso, team: m.team, teamName: W.cur?.[m.team]?.name, region: W.cur?.[m.team]?.region, out: m.out || [], in: m.in || [] });
    for (const k of prev) if (!cur.some((m) => key(m) === k)) { const [team, out, inn] = k.split('|'); add({ kind: 'manual-end', team, out: out ? out.split(',') : [], in: inn ? inn.split(',') : [] }); }
    st.manual = cur.map(key);
  };

  // 3) 2부 팀 명단·이름. lcq = build-data의 lcq (cc: [{ name, was, players: [[이름, 국적, 서브]] }])
  W.cc = (lcq) => {
    for (const e of lcq) for (const c of e.cc || []) {
      const k = `${e.region}:${nk(c.was || c.name)}`;
      const cur = (c.players || []).filter((p) => !p[2]).map((p) => p[0]);
      const p = st.cc[k];
      if (p && !first) {
        const out = p.filter((n) => !cur.some((x) => nk(x) === nk(n))), inn = cur.filter((n) => !p.some((x) => nk(x) === nk(n)));
        if (out.length || inn.length) add({ kind: 'cc', team: c.name, region: e.region, out, in: inn });
      }
      st.cc[k] = cur;
      if (c.was && st.renames[k] !== c.name) { add({ kind: 'rename', team: c.name, region: e.region, was: c.was, out: [], in: [] }); st.renames[k] = c.name; }
    }
  };

  W.save = () => {
    if (first) add({ kind: 'start', team: '', out: [], in: [] });
    log.sort((a, b) => b.at.localeCompare(a.at));
    const trimmed = log.slice(0, 1000);
    write(STATE, JSON.stringify(st, null, 1) + '\n');
    const prevJson = read(LOG_JSON, []);
    const baseKey = JSON.stringify(st.base);
    if (JSON.stringify(prevJson) !== JSON.stringify(trimmed) || st._mdBase !== baseKey) {
      st._mdBase = baseKey;
      write(STATE, JSON.stringify(st, null, 1) + '\n');
      write(LOG_JSON, JSON.stringify(trimmed, null, 1) + '\n');
      write(LOG_MD, md(trimmed, st));
    }
    return trimmed;
  };
  return W;
}

const KIND = { official: '공식 로스터 변경', auto: '자동 반영 (Liquipedia)', 'auto-end': '자동 반영 끝 (공식 반영 또는 Liquipedia 되돌림)', manual: '수동 반영 (config)', 'manual-end': '수동 반영 삭제', cc: '2부 팀 명단 변경', rename: '2부 팀 이름 변경', start: '로스터 자동 확인 시작' };
const REGION = { 'apac-n': 'APAC North', 'apac-s': 'APAC South', emea: 'EMEA', americas: 'Americas' };
function md(log, st) {
  const kst = (iso) => new Date(iso).toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(0, 16);
  const rows = log.map((e) => `| ${kst(e.at)} | ${KIND[e.kind] || e.kind} | ${REGION[e.region] || ''} | ${e.team}${e.teamName && e.teamName !== e.team ? ` (${e.teamName})` : ''} | ${e.out?.join(', ') || ''} | ${e.in?.join(', ') || ''}${e.was ? `구 ${e.was}` : ''} |`);
  const base = Object.entries(st.base || {}).filter(([, v]) => v.off.length || v.lp.length)
    .map(([sh, v]) => `| ${sh}${st.official?.[sh]?.name && st.official[sh].name !== sh ? ` (${st.official[sh].name})` : ''} | ${REGION[st.official?.[sh]?.region] || ''} | ${v.off.join(', ')} | ${v.lp.join(', ')} |`);
  return `# 로스터 변경 기록\n\n빌드(약 5분마다)가 공식 API 로스터와 Liquipedia LCQ 참가 명단을 확인해 자동으로 남기는 기록입니다. 새것이 위에 있습니다. 시각은 한국 시간(KST).\n\n| 시각 (KST) | 종류 | 지역 | 팀 | 빠진 선수 | 들어온 선수 |\n| --- | --- | --- | --- | --- | --- |\n${rows.join('\n')}\n`
    + `\n## 확인용: 처음부터 달랐던 명단 (자동 반영하지 않음)\n\n공식 로스터와 Liquipedia LCQ 명단이 확인을 시작한 때부터 다른 선수입니다. 이름 표기 차이, 4번째 선수, 이미 있었던 이동이 섞여 있어 자동으로 바꾸지 않습니다. 실제 이동이면 config/overrides.json rosterMoves에 적어 주세요. 공식 로스터가 바뀌면 그 팀은 기준을 새로 잡습니다.\n\n| 팀 | 지역 | 공식에만 있는 선수 | Liquipedia에만 있는 선수 |\n| --- | --- | --- | --- |\n${base.join('\n')}\n`;
}
