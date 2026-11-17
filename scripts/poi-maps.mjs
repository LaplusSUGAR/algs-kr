// LCQ POI 드래프트 지도: 공식 API(poi-drafts)에서 끝난 드래프트의 선택을 받아, 바탕 지도 위에
// 팀 로고 핀(선택 순서 번호)을 얹은 그림을 만든다. 공식 사이트(algs.ea.com)의 'Map View'와 같은 자료다.
//
//   입력 : raw/algs/snapshot.json (LCQ 시리즈 목록), 공식 API /series/{id}, /poi-drafts/{draftId}[/pick]
//          raw/poi-base/<지도>.webp (공식 사이트의 바탕 지도 그림. 새 지도가 나오면 여기에 같은 이름으로 추가)
//   출력 : site/poi/<지역>-<시리즈>-<지도>.webp (1255px), site/data/poi-maps.json (선택 목록, 빌드가 읽음)
//
// 끝난 드래프트(completed)만 만든다. 한 번 만든 시리즈는 다시 받지 않는다(--force로 모두 다시).
// 아직 시작 전인 드래프트는 시작 시각 가까이(앞 2시간~뒤 6시간)일 때만 확인하고, 그 밖에는 6시간에 한 번만 확인한다.
// 필요: npm i --no-save --no-package-lock sharp@0.33 (logos.mjs와 같은 방식)
// 사용: node scripts/poi-maps.mjs [--force]
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, UA, readJson, writeJson, fetchJson, hash, normRegion, sleep } from './lib.mjs';

const API = process.env.ALGS_API || 'https://prod-api.algstools.com/v1';
const OUT = 'site/poi', BASE = 'raw/poi-base', MANIFEST = 'site/data/poi-maps.json';
const SIZE = 1255; // 공식 'Map View' 바탕 그림과 같은 크기
const FORCE = process.argv.includes('--force');
const PLAN = process.argv.includes('--plan'); // 그릴 것이 있으면 그림을 만들지 않고 종료 코드 3 (도구 설치 전에 가볍게 확인하는 용도, logos.mjs --plan과 같은 방식)
const slug = (x) => String(x || '').toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let sharp = null;
if (!PLAN) {
  try { sharp = (await import('sharp')).default; } catch { console.error('[poi] sharp 가 없습니다: npm i --no-save --no-package-lock sharp@0.33'); process.exit(1); }
}
const snap = readJson('raw/algs/snapshot.json', null);
if (!snap) { console.log('[poi] 스냅샷이 없어 건너뜀'); process.exit(0); }
const man = readJson(MANIFEST, { series: {} });
man.series ||= {};
const live = new Set(snap.series.map((s) => s[0]));
for (const id of Object.keys(man.series)) if (!live.has(id)) delete man.series[id]; // 지난 시즌 것은 지운다

// 팀 로고 → 지름 48px 원에 넣을 PNG (data URI). 못 받으면 null (핀에 약칭 글자를 쓴다)
const logoCache = new Map();
async function logoOf(t) {
  const url = t?.logoLight || t?.logoDark;
  if (!url) return null;
  if (!logoCache.has(url)) {
    logoCache.set(url, (async () => {
      try {
        const r = await fetch(`${url}?format=webp&width=96`, { headers: { 'User-Agent': UA } });
        if (!r.ok) return null;
        const png = await sharp(Buffer.from(await r.arrayBuffer())).resize(96, 96, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
        return `data:image/png;base64,${png.toString('base64')}`;
      } catch { return null; }
    })());
  }
  return logoCache.get(url);
}

// 로고가 없는 팀의 핀 글자: 여러 단어면 단어 머리글자(최대 3), 한 단어면 앞 3글자. 영문·숫자만 쓴다(그림 글꼴에 한글·일본어가 없다)
const initials = (name) => {
  const words = String(name || '').split(/[^A-Za-z0-9]+/).filter(Boolean);
  const s = words.length > 1 ? words.map((w) => w[0]).join('').slice(0, 3) : (words[0] || '').slice(0, 3);
  return (s || '?').toUpperCase();
};
async function renderMap(file, picks) {
  const px = (v) => Math.min(SIZE - 36, Math.max(36, (Number(v) / 100) * SIZE)); // 가장자리 핀이 잘리지 않게
  const pins = [];
  for (const p of picks.slice().sort((a, b) => b.pickNumber - a.pickNumber)) { // 앞 순번 핀이 위에 오도록 뒤 순번부터 그린다
    const cx = px(p.spawnLocation.x), cy = px(p.spawnLocation.y), logo = await logoOf(p.team);
    pins.push(`<g transform="translate(${cx.toFixed(1)} ${cy.toFixed(1)})">
      <circle r="31" fill="#0b0f15" stroke="#fff" stroke-width="3"/>
      ${logo ? `<image xlink:href="${logo}" x="-24" y="-24" width="48" height="48" clip-path="url(#c)"/>` : `<text y="5" font-size="14" font-weight="700" text-anchor="middle" fill="#fff">${esc(initials(p.team?.name))}</text>`}
      <circle cx="23" cy="-23" r="14" fill="#da292a" stroke="#fff" stroke-width="2"/>
      <text x="23" y="-17.5" font-size="16" font-weight="700" text-anchor="middle" fill="#fff">${p.pickNumber}</text></g>`);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${SIZE}" height="${SIZE}" font-family="DejaVu Sans, Arial, Helvetica, sans-serif">
    <defs><clipPath id="c"><circle r="24"/></clipPath></defs>${pins.join('')}</svg>`;
  const base = path.join(ROOT, BASE, `${slug(picks[0].map.name)}.webp`);
  if (!fs.existsSync(base)) throw new Error(`바탕 지도가 없음: ${path.relative(ROOT, base)} (공식 사이트의 ${picks[0].map.name} 그림을 이 이름으로 넣으세요)`);
  fs.mkdirSync(path.join(ROOT, OUT), { recursive: true });
  const buf = await sharp(base).resize(SIZE, SIZE).flatten({ background: '#0b0f15' }).composite([{ input: Buffer.from(svg) }]).webp({ quality: 80 }).toBuffer();
  fs.writeFileSync(path.join(ROOT, OUT, file), buf);
  return hash(buf.toString('base64'));
}

const now = Date.now();
const bucket = Math.floor(now / (6 * 3600e3)); // 6시간 구간 번호: 파일이 매번 바뀌어 커밋이 생기지 않게 시각 대신 구간만 적는다
let made = 0, checked = 0, todo = 0;
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
      if (PLAN) { man.series[id] = { ...old, region, name, draft, date: d.date || null, checked: undefined }; todo++; continue; } // 끝났고 아직 안 그렸다 → 그리러 다시 실행
      const picks = (await fetchJson(`${API}/poi-drafts/${draft}/pick`)).picks || [];
      const chosen = picks.filter((p) => p.map?.name && p.spawnLocation?.name && p.spawnLocation.x != null);
      const missed = picks.filter((p) => !(p.map?.name && p.spawnLocation?.name)).map((p) => [p.team?.id, p.team?.name]);
      const order = [...new Set(chosen.slice().sort((a, b) => a.actualPickNumber - b.actualPickNumber).map((p) => p.map.name))]; // 드래프트 순서대로
      const maps = [];
      for (const mapName of order) {
        const mp = chosen.filter((p) => p.map.name === mapName).sort((a, b) => a.pickNumber - b.pickNumber);
        const file = `${region}-${slug(name)}-${slug(mapName)}.webp`;
        const v = await renderMap(file, mp);
        maps.push({ map: mapName, img: `poi/${file}`, v, picks: mp.map((p) => [p.pickNumber, p.team?.id, p.team?.name, p.spawnLocation.name]) });
        made++;
      }
      man.series[id] = { region, name, draft, date: d.date || null, completedAt: d.completedAt || null, done: true, checked: bucket, maps, ...(missed.length ? { missed: [...new Map(missed).entries()] } : {}) };
      console.log(`[poi] ${region} ${name}: 지도 ${maps.length}장 (${maps.map((m) => `${m.map} ${m.picks.length}팀`).join(', ')})${missed.length ? ` · 미선택 ${[...new Set(missed.map((m) => m[1]))].join(', ')}` : ''}`);
    } catch (e) {
      console.error(`[poi] ${region} ${name} 실패: ${e.message}`);
    }
    await sleep(100);
  }
}
if (JSON.stringify(readJson(MANIFEST, null)) !== JSON.stringify(man)) writeJson(MANIFEST, man, true);
console.log(`[poi] 확인 ${checked}개 시리즈, ${PLAN ? `그릴 것 ${todo}개` : `새 그림 ${made}장`}`);
if (PLAN && todo) process.exit(3);
