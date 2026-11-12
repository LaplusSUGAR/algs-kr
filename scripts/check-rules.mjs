// 규칙 파일(config/rules/<시즌>.json)과 실제 데이터가 맞는지 검사한다. 어긋나면 [rules] 경고를 남긴다(빌드는 멈추지 않는다).
//   규정이 바뀌었거나, 공식 데이터가 규정과 다르게 들어왔거나, 규칙 파일을 잘못 옮겨 적었을 때 가장 먼저 여기서 드러난다.
// 사용: node scripts/check-rules.mjs
import { readJson } from './lib.mjs';
import { loadRules, lcqRuleStart, lcqStage } from './rules.mjs';

const snap = readJson('raw/algs/snapshot.json', null);
if (!snap) { console.log('[rules] 스냅샷이 없어 건너뜀'); process.exit(0); }
const slug = snap.seasonSlug || 'year-6';
const { rules, file, mine } = loadRules(slug);
const warn = [], ok = [];
const check = (name, bad) => (bad.length ? warn.push(`${name}: ${bad.slice(0, 4).join(' / ')}${bad.length > 4 ? ` 외 ${bad.length - 4}건` : ''}`) : ok.push(name));
if (!mine) warn.push(`규칙 파일이 ${rules.season} 것(${file})입니다. ${slug} 규정이 나오면 config/rules/${slug}.json을 추가하세요`);

// 1) 대회별 CP가 규정 표(C6.5)와 같은가
{
  const bad = [];
  for (const [, evSlug, rows] of snap.cpEvents || []) {
    const table = /pro-league/.test(evSlug) ? rules.championshipPoints.proLeague : /playoffs/.test(evSlug) ? rules.championshipPoints.playoffs : null;
    if (!table) continue;
    for (const [pos, cp, teamId] of rows) if (teamId && table[pos - 1] != null && cp !== table[pos - 1]) bad.push(`${evSlug} ${pos}위 ${cp} (규정 ${table[pos - 1]})`);
  }
  check('대회별 CP = 규정 C6.5', bad);
}
// 2) 프로리그 지역별 팀 수 (3.2)
{
  const last = Math.max(0, ...Object.keys(snap.pl || {}).map((k) => Number(k.slice(1, 2)) || 0));
  check(`프로리그 Split ${last} 지역별 ${rules.proLeague.teamsPerRegion}팀`, Object.entries(snap.pl || {}).filter(([k, rows]) => k.startsWith(`s${last}:`) && rows.length !== rules.proLeague.teamsPerRegion).map(([k, rows]) => `${k} ${rows.length}팀`));
}
// 3) LCQ: 단계 구성(C4)과 시각(D4)
{
  const evs = (snap.events || []).filter((e) => /^last-chance-qualifier/.test(e[1]));
  const want = ['Winners Round 1', 'Winners Round 2', 'Elimination Round 1', 'Elimination Round 2', 'Match Point Finals'];
  const badStage = [], off = [];
  const norm = { 'apac-north': 'apac-n', 'asia-pacific-north': 'apac-n', 'apac-south': 'apac-s', 'asia-pacific-south': 'apac-s', 'europe-middle-east-and-africa': 'emea' };
  for (const e of evs) {
    const region = norm[e[3]] || e[3];
    const ss = (snap.series || []).filter((r) => r[1] === e[0]);
    if (!ss.length) continue;
    const have = new Set(ss.map((r) => lcqStage(r[3])));
    for (const w of want) if (!have.has(w)) badStage.push(`${region} ${w} 없음`);
    for (const r of ss) { const rule = lcqRuleStart(rules, region, r[3], e[4]); if (rule && r[5] !== rule && r[4] !== 'completed') off.push(`${region} ${r[3]}`); }
  }
  check('LCQ 단계 구성 = 규정 C4', badStage);
  if (off.length) ok.push(`LCQ 시각: 공식 값 ${off.length}건이 규정 D4와 달라 빌드가 가려 씀`);
}
// 4) 챔피언십 직행 자리 수와 확정 대회 (3.6.3)
{
  const bad = [];
  if ((snap.cp || []).length && snap.cp.length < rules.championship.direct) bad.push(`CP 순위가 ${snap.cp.length}팀뿐`);
  if (rules.championship.direct + rules.championship.fromLcq !== rules.championship.teams) bad.push('직행 + LCQ ≠ 전체 팀 수');
  if (rules.championship.fromLcq !== rules.lcq.advance * Object.keys(rules.regions).filter((k) => !k.startsWith('_')).length) bad.push('LCQ 진출 수 × 지역 수 ≠ LCQ 자리');
  check('챔피언십 40팀 = 직행 32 + LCQ 8', bad);
}
// 5) 상금 합계 (E)
{
  const bad = [];
  for (const [k, v] of Object.entries(rules.prizes || {})) if (v?.byRank && v.byRank.reduce((a, b) => a + b, 0) !== v.pool) bad.push(k);
  check('상금 표 합계 = 총상금', bad);
}
// 6) 대진 구조 표(brackets)가 스스로 맞고, 규정 숫자(lcq·championship)와도 맞는가
{
  const bad = [];
  const B = rules.brackets;
  if (!B?.lcq || !B?.championship || !B?.playoffs) bad.push('brackets.lcq / championship / playoffs 가 없음');
  else {
    const one = (label, stages, feeds, flow, extra = {}) => {
      const n = { ...extra, ...Object.fromEntries(stages.map((s) => [s.key, s.n])) };
      for (const [to, from] of Object.entries(feeds)) {
        if (n[to] == null) { bad.push(`${label} feeds: 없는 단계 ${to}`); continue; }
        let sum = 0;
        for (const [k, a, b] of from) { if (n[k] == null) bad.push(`${label} feeds ${to}: 없는 단계 ${k}`); else if (b > n[k] || a < 1 || a > b) bad.push(`${label} feeds ${to}: ${k} ${a}~${b}위가 범위 밖`); sum += b - a + 1; }
        if (sum !== n[to]) bad.push(`${label} ${to}: 올라오는 팀 ${sum} ≠ ${n[to]}팀`);
      }
      for (const s of stages) if (s.cut != null && !Object.values(feeds).some((f) => f.some(([k, a, b]) => k === s.key && a === 1 && b === s.cut))) bad.push(`${label} ${s.key}: 상위 ${s.cut}팀이 가는 곳이 feeds에 없음`);
      for (const k of Object.keys(flow.nodes)) if (n[k] == null) bad.push(`${label} 그림: 없는 단계 ${k}`);
      for (const k of Object.keys(n)) if (!flow.nodes[k]) bad.push(`${label} 그림에 ${k} 단계가 빠짐`);
      for (const e of flow.edges) if (!flow.nodes[e[0]] || !flow.nodes[e[1]]) bad.push(`${label} 그림 화살표 ${e[0]}→${e[1]}`);
    };
    one('LCQ', B.lcq.stages, B.lcq.feeds, B.lcq.flow);
    one('챔피언십', B.championship.stages, B.championship.feeds, B.championship.flow, { gs: rules.championship.teams });
    const L = rules.lcq, C = rules.championship;
    if (B.lcq.stages.some((s) => s.n !== L.heatSize)) bad.push('LCQ 단계 팀 수 ≠ lcq.heatSize');
    if (B.lcq.stages.filter((s) => /Lobby/.test(s.name)).length !== L.heats) bad.push('LCQ 1라운드 그룹 수 ≠ lcq.heats');
    if (B.lcq.stages.at(-1).top !== L.advance) bad.push('LCQ 결승 진출 팀 수 ≠ lcq.advance');
    if (L.bracket?.winners1?.toWinners2 != null && B.lcq.stages[0].cut !== L.bracket.winners1.toWinners2) bad.push('LCQ 승자 1R 통과 수 ≠ lcq.bracket.winners1.toWinners2');
    const gm = B.championship.groupMatches, cnt = {};
    for (const [x, y] of gm) { cnt[x] = (cnt[x] || 0) + 1; cnt[y] = (cnt[y] || 0) + 1; }
    if (Object.keys(cnt).length !== C.groups || Object.values(cnt).some((v) => v !== C.groups - 1)) bad.push('챔피언십 조별 리그 대진이 조마다 다른 조와 한 번씩이 아님');
    if (B.championship.feeds.wr?.[0]?.[2] !== C.groupStage.toWinners) bad.push('챔피언십 승자 라운드 진출 수 ≠ championship.groupStage.toWinners');
  }
  check('대진 구조 표 = 규정 숫자', bad);
}
for (const w of warn) console.log(`[rules] 경고 ${w}`);
console.log(`[rules] ${rules.season} 규칙 ${rules.source?.edition || ''}: 확인 ${ok.length}항목${warn.length ? `, 경고 ${warn.length}건` : ''} (${ok.join(' · ')})`);
