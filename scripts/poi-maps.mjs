// LCQ POI 드래프트: 공식 API(poi-drafts)에서 끝난 드래프트의 선택을 받아 site/data/poi-maps.json 에 적는다.
// 화면(app.js poiSection)이 바탕 지도(site/poi/base/<지도>.webp, 공식 사이트 'Map View'와 같은 그림) 위에
// 팀 핀을 좌표(%)로 얹어 그린다. 그림 파일은 만들지 않는다.
//
//   입력 : raw/algs/snapshot.json (LCQ 시리즈 목록), 공식 API /series/{id}, /poi-drafts/{draftId}[/pick|/locations]
//   출력 : site/data/poi-maps.json  { ver, series: { 시리즈ID: { region, name, draft, date, done, maps: [{ map, base, picks }], missed } } }
//          picks = [[선택 순서, 팀 ID, 팀 이름, 낙하 지점, x(%), y(%)]]
//
// 끝난 드래프트(completed)만 적는다. 한 번 적은 시리즈는 다시 받지 않는다(--force로 모두 다시).
// 아직 시작 전인 드래프트는 시작 시각 가까이(앞 2시간~뒤 6시간)일 때만 확인하고, 그 밖에는 6시간에 한 번만 확인한다.
// 받을 때마다 좌표를 공식 낙하 지점 목록과 대조해 어긋나면 [poi] 경고를 남긴다(빌드는 멈추지 않는다).
// 새 지도가 나오면 바탕 그림을 site/poi/base/<지도 이름: 소문자·하이픈>.webp 로 넣는다 (예: worlds-edge.webp).
// 사용: node scripts/poi-maps.mjs [--force]
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, readJson, writeJson, fetchJson, normRegion, sleep } from './lib.mjs';

const API = process.env.ALGS_API || 'https://prod-api.algstools.com/v1';
const MANIFEST = 'site/data/poi-maps.json', BASE = 'site/poi/base';
const VER = 2; // 2: 그림 대신 좌표를 적는다 (이전 형식 항목은 다시 받는다)
const FORCE = process.argv.includes('--force');
const slug = (x) => String(x || '').toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const snap = readJson('raw/algs/snapshot.json', null);
if (!snap) { console.log('[poi] 스냅샷이 없어 건너뜀'); process.exit(0); }
let man = readJson(MANIFEST, null);
if (!man || man.ver !== VER) man = { ver: VER, series: {} };
const live = new Set(snap.series.map((s) => s[0]));
for (const id of Object.keys(man.series)) if (!live.has(id)) delete man.series[id]; // 지난 시즌 것은 지운다

const now = Date.now();
const bucket = Math.floor(now / (6 * 3600e3)); // 6시간 구간 번호: 파일이 매번 바뀌어 커밋이 생기지 않게 시각 대신 구간만 적는다
let checked = 0, added = 0;

// 좌표 점검: 범위, 공식 낙하 지점 목록과의 일치, 한 지점 중복 선택, 한 팀의 같은 지도 중복 선택
function audit(label, chosen, locs) {
  const warn = [];
  const known = new Map((locs || []).filter((l) => l.map?.name).map((l) => [`${l.map.name}|${l.name}`, `${l.x}|${l.y}`]));
  const spot = new Set(), team = new Set();
  for (const p of chosen) {
    const sl = p.spawnLocation, k = `${p.map.name}|${sl.name}`;
    if (!(Number(sl.x) >= 0 && Number(sl.x) <= 100 && Number(sl.y) >= 0 && Number(sl.y) <= 100)) warn.push(`${k} 좌표가 범위 밖 (${sl.x}, ${sl.y})`);
    if (known.size && known.get(k) !== `${sl.x}|${sl.y}`) warn.push(`${k} 좌표가 공식 낙하 지점 목록과 다름 (${sl.x}, ${sl.y})`);
    if (spot.has(k)) warn.push(`${k} 를 두 팀이 선택`); spot.add(k);
    const t = `${p.team?.id}|${p.map.name}`;
    if (team.has(t)) warn.push(`${p.team?.name} 가 ${p.map.name} 을 두 번 선택`); team.add(t);
  }
  for (const w of warn) console.warn(`[poi] 경고 ${label}: ${w}`);
  return warn.length;
}

for (const ev of snap.events.filter((e) => /^last-chance-qualifier/.test(e[1]))) {
  const region = normRegion(ev[3]);
  for (const s of snap.series.filter((x) => x[1] === ev[0])) {
    const [id, , , name] = s;
    const old = man.series[id] || {};
    if (old.done && !FORCE) continue;
    // 시작 전 드래프트는 시각 가까이(앞 2시간~뒤 6시간)일 때만, 그 밖에는 6시간에 한 번만 확인
    const near = old.date && now > Date.parse(old.date) - 2 * 3600e3 && now < Date.parse(old.date) + 6 * 3600e3;
    if (!FORCE && old.checked === bucket && !near) continue;
    checked++;
    try {
      const draft = old.draft || (await fetchJson(`${API}/series/${id}`)).poiDraftId;
      if (!draft) { man.series[id] = { region, name, checked: bucket }; continue; }
      const d = (await fetchJson(`${API}/poi-drafts/${draft}`)).poiDraft || {};
      if (!d.completed) { man.series[id] = { region, name, draft, date: d.date || null, checked: bucket }; continue; }
      const picks = (await fetchJson(`${API}/poi-drafts/${draft}/pick`)).picks || [];
      const locs = (await fetchJson(`${API}/poi-drafts/${draft}/locations`)).spawnLocations || [];
      const chosen = picks.filter((p) => p.map?.name && p.spawnLocation?.name && p.spawnLocation.x != null);
      const missed = picks.filter((p) => !(p.map?.name && p.spawnLocation?.name)).map((p) => [p.team?.id, p.team?.name]);
      audit(`${region} ${name}`, chosen, locs);
      const order = [...new Set(chosen.slice().sort((a, b) => a.actualPickNumber - b.actualPickNumber).map((p) => p.map.name))]; // 드래프트 순서대로
      const maps = order.map((mapName) => {
        const base = `${slug(mapName)}.webp`;
        if (!fs.existsSync(path.join(ROOT, BASE, base))) console.warn(`[poi] 경고 바탕 지도가 없음: ${BASE}/${base} (공식 사이트의 ${mapName} 그림을 이 이름으로 넣으세요)`);
        const mp = chosen.filter((p) => p.map.name === mapName).sort((a, b) => a.pickNumber - b.pickNumber);
        return { map: mapName, base: `poi/base/${base}`, picks: mp.map((p) => [p.pickNumber, p.team?.id, p.team?.name, p.spawnLocation.name, Number(p.spawnLocation.x), Number(p.spawnLocation.y)]) };
      });
      man.series[id] = { region, name, draft, date: d.date || null, completedAt: d.completedAt || null, done: true, checked: bucket, maps, ...(missed.length ? { missed: [...new Map(missed).entries()] } : {}) };
      added++;
      console.log(`[poi] ${region} ${name}: ${maps.map((m) => `${m.map} ${m.picks.length}팀`).join(', ')}${missed.length ? ` · 미선택 ${[...new Set(missed.map((m) => m[1]))].join(', ')}` : ''}`);
    } catch (e) {
      console.error(`[poi] ${region} ${name} 실패: ${e.message}`);
    }
    await sleep(100);
  }
}
if (JSON.stringify(readJson(MANIFEST, null)) !== JSON.stringify(man)) writeJson(MANIFEST, man, true);
console.log(`[poi] 확인 ${checked}개 시리즈, 새로 적은 드래프트 ${added}개`);
