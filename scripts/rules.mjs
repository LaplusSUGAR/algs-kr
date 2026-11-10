// 공식 규정에서 뽑은 규칙 파일(config/rules/<시즌>.json) 읽기와, 규칙으로 계산하는 값
//   규칙 파일이 사이트 로직의 기준이다: 점수표, 직행·LCQ 자리 수, LCQ 일정, 챔피언십 직행 확정 시점.
//   메인 시즌의 규칙 파일이 아직 없으면 가장 최근 시즌 것을 쓰고 mine=false로 알린다(화면에 '지난 시즌 규정 기준' 안내).
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, readJson } from './lib.mjs';
import { ptDate } from './season.mjs';

export function loadRules(seasonSlug) {
  const dir = path.join(ROOT, 'config/rules');
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort((a, b) => a.localeCompare(b, 'en', { numeric: true })) : [];
  if (!files.length) throw new Error('config/rules/ 에 규칙 파일이 없습니다');
  const file = files.includes(`${seasonSlug}.json`) ? `${seasonSlug}.json` : files.at(-1);
  const rules = readJson(`config/rules/${file}`);
  return { rules, file, mine: rules.season === seasonSlug };
}

// 화면이 쓰는 점수표 (예전 config/season.json scoring과 같은 꼴)
export const scoringOf = (rules) => ({
  game: rules.match.placement,
  plRegular: rules.proLeague.points.regular,
  plFinals: rules.proLeague.points.regionalFinals,
  cpProLeague: rules.championshipPoints.proLeague,
  cpPlayoffs: rules.championshipPoints.playoffs,
});

// 어떤 시간대의 현지 시각(YYYY-MM-DD, HH:MM)을 UTC ISO로
export function localToUtc(date, time, tz) {
  const guess = Date.parse(`${date}T${time}:00Z`);
  const shown = new Date(guess).toLocaleString('sv-SE', { timeZone: tz, hour12: false }).replace(' ', 'T');
  const off = Date.parse(shown + 'Z') - guess; // 그 시간대가 UTC보다 앞선 만큼
  return new Date(guess - off).toISOString();
}
const addDays = (date, n) => new Date(Date.parse(date + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);

// LCQ 단계의 규정상 시작 시각 (부록 D4: 지역 현지 시각). 대회 첫날 = 공식 대회 시작일(태평양 시간 날짜)
export function lcqRuleStart(rules, region, stageName, eventStart) {
  const key = String(stageName).replace(/ Lobby [A-Z]$/, '');
  const row = rules.lcq?.schedule?.[key], tz = rules.regions?.[region]?.tz;
  if (!row || !tz || !eventStart) return null;
  const time = typeof row.time === 'string' ? row.time : row.time?.[region];
  return time ? localToUtc(addDays(ptDate(eventStart), row.day - 1), time, tz) : null;
}
// LCQ 단계 순서 (앞 단계보다 먼저 시작할 수 없다)
export const LCQ_ORDER = { 'Winners Round 1': 1, 'Winners Round 2': 2, 'Elimination Round 1': 2, 'Elimination Round 2': 3, 'Match Point Finals': 4 };
export const lcqStage = (name) => String(name).replace(/ Lobby [A-Z]$/, '');
