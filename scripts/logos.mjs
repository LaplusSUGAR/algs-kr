// 팀 로고 만들기.
//   1. Liquipedia 확인: 프로리그·챌린저 서킷 표(raw/lp/teams-src.json)에서 팀 이름 · 선수 · 로고 아이콘을 읽는다
//   2. 같은 팀인지 대조: 이름이 같고 선수가 1명 이상 겹치거나, 약자·같은 조직 이름이고 선수가 2명 이상 겹쳐야 Liquipedia 로고를 쓴다
//      (이름만 같거나 선수만 겹치면 팀 이름 변경·로스터 이동일 수 있어 쓰지 않고 공식 로고로, 보고서에 남김)
//   3. 로고 받기: 원본 그림을 받고, 막히면 브라우저(Chrome)로 그림을 열어 받거나 화면을 캡처한다
//   4. 줄이기: 투명 여백을 잘라 64px · 160px WebP 두 장으로 만들어 site/logos/t/ 에 둔다 (화면 크기 18~56px × 화면 배율 1~3에 맞춘 크기)
// 우선순위: 운영자가 넣은 파일(logos-src/) > Liquipedia(대조 통과) > 공식 API 로고
//
//   node scripts/logos.mjs --plan : 새로 만들 로고가 있으면 종료 코드 1 (그때만 Actions가 sharp·playwright-core를 설치해 다시 실행)
//   node scripts/logos.mjs        : 로고 만들기
// 결과: raw/logos/index.json   { key: { src, f: [어두운 배경용, 밝은 배경용], ... } }   key = 'id:<공식 팀 ID>' 또는 'cc:<2부 팀 이름 키>'
//       raw/logos/report.json  팀마다 대조 결과(같은 팀으로 본 근거, 쓰지 않은 이유)
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, UA, readJson, writeJson, hash, sleep, normRegion } from './lib.mjs';
import { lpTeams, nk, sameName, nearName } from './lp-teams-parse.mjs';

const OUT = 'site/logos/t';
const SIZES = [64, 160];
const PROC = 'v1'; // 처리 방식이 바뀌면 올린다 (파일 이름이 바뀌어 전부 다시 만듦)
const MANUAL = 'logos-src';
const PLAN = process.argv.includes('--plan');
const MAX_NEW = Number(process.env.LOGO_MAX || 80); // 한 번에 새로 만들 최대 개수 (나머지는 다음 빌드)

const snap = readJson('raw/algs/snapshot.json', {});
const lp = lpTeams(readJson('raw/lp/teams-src.json', { pages: {} }));

// ---------- 우리 팀 목록 (공식 API) ----------
function ourTeams() {
  const map = new Map();
  const add = (id, short, name, region) => {
    if (!id) return null;
    const t = map.get(id) || { key: `id:${id}`, id, short: '', name: '', region: null, players: [] };
    if (!t.short && short) t.short = String(short).trim();
    if (!t.name && name) t.name = String(name).trim();
    if (!t.region && region) t.region = normRegion(region);
    map.set(id, t);
    return t;
  };
  // 지금 사이트에 로고가 보이는 팀만: CP 순위, 가장 최근 Split 프로리그, 최근 국제전, LCQ
  for (const [, id, name, short, region] of snap.cp || []) add(id, short, name, region);
  const latest = Object.keys(snap.pl || {}).map((k) => k.split(':')[0]).sort().at(-1);
  for (const key of Object.keys(snap.pl || {}).filter((k) => k.startsWith(latest + ':'))) for (const r of snap.pl[key]) add(r[3], r[1], r[2], key.split(':')[1]);
  for (const r of snap.poGroup || []) add(r[3], r[1], r[2], r[7]);
  for (const [evId, ev] of Object.entries(snap.lcq || {})) {
    const region = (snap.events || []).find((e) => e[0] === evId)?.[3];
    for (const [id, short, name] of ev.teams || []) add(id, short, name, region);
  }
  for (const t of map.values()) {
    const ros = snap.rosters?.[t.id];
    if (ros) t.players = ros.split(';').map((x) => x.split('|')).filter(([, , r]) => r !== 'k').map(([n]) => n);
    const po = snap.poRosters?.[t.id];
    if (po) for (const [, n, r] of po) if (r !== 'k' && !t.players.includes(n)) t.players.push(n);
  }
  return [...map.values()];
}

// ---------- 대조: 이름 + 선수 명단 ----------
function match(t) {
  const mine = new Set(t.players.map(nk).filter(Boolean));
  const cands = lp.filter((x) => x.kind === 'pl' || x.kind === 'cc');
  let best = null;
  for (const x of cands) {
    const overlap = x.players.filter((p) => mine.has(nk(p))).length;
    const name = sameName(t, x), near = !name && nearName(t, x);
    const sameRegion = !t.region || x.region === t.region;
    const score = (name ? 10 : near ? 6 : 0) + overlap * 3 + (sameRegion ? 1 : 0);
    if (!best || score > best.score) best = { x, overlap, name, near, sameRegion, score };
  }
  if (!best || (!best.name && best.overlap === 0)) return { ok: false, why: 'Liquipedia 표에서 같은 이름·선수를 찾지 못함' };
  const { x, overlap, name, near } = best;
  const base = { lpName: x.name, lpPage: x.page, from: x.pageKey, overlap, players: x.players };
  if (name && overlap >= 1) return { ok: true, by: `이름 같음 · 선수 ${overlap}명 겹침`, ...base };
  if (near && overlap >= 2) return { ok: true, by: `약자·같은 조직 이름 · 선수 ${overlap}명 겹침`, ...base };
  if (name && !mine.size) return { ok: true, by: '이름 같음 (우리 쪽 로스터 정보 없음)', ...base };
  if (name) return { ok: false, why: '이름은 같지만 선수가 겹치지 않음', ...base };
  if (near) return { ok: false, why: `비슷한 이름이지만 선수가 ${overlap}명만 겹침`, ...base };
  return { ok: false, why: `선수 ${overlap}명이 겹치지만 이름이 다름 (팀 이름 변경 가능성)`, ...base };
}

// ---------- 운영자 파일 (logos-src/) ----------
// 이름: <약칭>.png(밝은 배경용) · <약칭>@dark.png(어두운 배경용). 2부 팀은 팀 이름 그대로. png·webp·jpg·svg
function manualFiles() {
  const dir = path.join(ROOT, MANUAL);
  if (!fs.existsSync(dir)) return {};
  const out = {};
  for (const f of fs.readdirSync(dir)) {
    const m = /^(.+?)(@dark)?\.(png|webp|jpe?g|svg)$/i.exec(f);
    if (!m) continue;
    const k = nk(m[1]);
    (out[k] ||= [null, null])[m[2] ? 0 : 1] = path.join(MANUAL, f);
  }
  return out;
}

// ---------- 로고 출처 정하기 ----------
const fileBase = (srcId) => `${OUT}/${hash(PROC + '|' + srcId)}`;
const done = (srcId) => SIZES.every((s) => fs.existsSync(path.join(ROOT, `${fileBase(srcId)}-${s}.webp`)));

function plan() {
  const manual = manualFiles();
  const teams = ourTeams();
  const entries = {};
  const report = [];
  const usedLp = new Set();
  for (const t of teams) {
    const m = match(t);
    if (m.ok) usedLp.add(`${m.from}|${nk(m.lpName)}`);
    const man = manual[nk(t.short)] || manual[nk(t.name)];
    const lpx = m.ok ? lp.find((x) => x.page === m.lpPage && x.pageKey === m.from && nk(x.name) === nk(m.lpName)) : null;
    const off = snap.logos?.[t.id];
    let src = null, pick = null;
    if (man) { src = 'manual'; pick = man.map((p) => (p ? { kind: 'file', id: `file:${p}:${fs.statSync(path.join(ROOT, p)).mtimeMs}`, path: p } : null)); }
    else if (lpx && (lpx.icon[0] || lpx.icon[1])) { src = 'lp'; pick = lpx.icon.map((u) => (u ? { kind: 'lp', id: u, url: u, page: lpx.pageUrl } : null)); }
    else if (off && (off[0] || off[1])) { src = 'official'; pick = off.map((u) => (u ? { kind: 'url', id: u, url: u } : null)); }
    entries[t.key] = { key: t.key, short: t.short, name: t.name, src, pick };
    report.push({ key: t.key, short: t.short, name: t.name, region: t.region, src, lp: m.ok ? { name: m.lpName, by: m.by } : { why: m.why, name: m.lpName || null, overlap: m.overlap ?? null } });
  }
  // 2부(챌린저 서킷) 팀: 프로리그 팀과 대조되지 않은 Liquipedia 서킷 팀
  // 서킷 순위 40위까지만 (LCQ 남은 자리는 이 안에서 채워짐)
  const ccTop = lp.filter((y) => y.kind === 'cc' && lp.filter((z) => z.pageKey === y.pageKey).indexOf(y) < 40);
  for (const x of ccTop.filter((y) => !usedLp.has(`${y.pageKey}|${nk(y.name)}`))) {
    const key = `cc:${nk(x.name)}`;
    if (entries[key]) continue;
    const man = manual[nk(x.name)];
    let src = null, pick = null;
    if (man) { src = 'manual'; pick = man.map((p) => (p ? { kind: 'file', id: `file:${p}:${fs.statSync(path.join(ROOT, p)).mtimeMs}`, path: p } : null)); }
    else if (x.icon[0] || x.icon[1]) { src = 'lp'; pick = x.icon.map((u) => (u ? { kind: 'lp', id: u, url: u, page: x.pageUrl } : null)); }
    entries[key] = { key, short: '', name: x.name, src, pick };
    report.push({ key, name: x.name, region: x.region, src, lp: { name: x.name, by: 'Liquipedia 서킷 순위표의 팀 (선수: ' + x.players.join(', ') + ')' } });
  }
  // 한쪽 배경용만 있으면 다른 쪽도 같은 그림 (화면이 반대색 받침을 깔아 줌)
  const todo = [];
  for (const e of Object.values(entries)) {
    if (!e.pick) continue;
    for (const p of e.pick) if (p && !done(p.id) && !todo.some((q) => q.id === p.id)) todo.push(p);
  }
  return { entries, report, todo };
}

// ---------- 받기 · 캡처 ----------
async function download(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'image/*' } });
  if (!res.ok) throw new Error(`${res.status}`);
  const type = res.headers.get('content-type') || '';
  if (!/image|octet-stream|svg/.test(type)) throw new Error(`그림이 아님 (${type})`);
  return Buffer.from(await res.arrayBuffer());
}

let browser = null;
async function capture(url) {
  if (!browser) {
    const { chromium } = await import('playwright-core');
    const exe = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => p && fs.existsSync(p));
    browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  }
  const page = await browser.newPage({ userAgent: UA, deviceScaleFactor: 1 });
  try {
    // ① 진짜 브라우저로 그림 주소를 열어 응답 그대로 받기
    const resp = await page.goto(url, { waitUntil: 'load', timeout: 30000 });
    if (resp && resp.ok() && /image/.test(resp.headers()['content-type'] || '')) return { buf: await resp.body(), how: 'browser' };
    // ② 화면에 뜬 그림을 투명 배경으로 캡처
    await page.addStyleTag({ content: 'html,body{background:transparent!important;margin:0}' });
    const img = await page.$('img');
    if (!img) throw new Error('그림 요소 없음');
    return { buf: await img.screenshot({ omitBackground: true }), how: 'capture' };
  } finally { await page.close(); }
}

async function getBytes(p) {
  if (p.kind === 'file') return { buf: fs.readFileSync(path.join(ROOT, p.path)), how: 'manual' };
  try { return { buf: await download(p.url), how: 'download' }; } catch (e) {
    if (p.kind !== 'lp') throw e;
    console.log(`[logos] 받기 실패(${e.message}) → 브라우저로 시도: ${p.url}`);
    return capture(p.url);
  }
}

// ---------- 줄이기 ----------
// 밝기 검사: 로고의 불투명한 부분 평균 밝기(0 검정 ~ 1 흰색). 밝은 배경용이 거의 흰색이거나 어두운 배경용이 거의 검정이면
// 그 배경에서 안 보이므로 쓰지 않는다(화면이 다른 쪽 로고를 반대색 받침 위에 놓음)
const STATS = 'raw/logos/stats.json';
async function measure(sharp, base) {
  const { data, info } = await sharp(path.join(ROOT, `${base}-64.webp`)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let sum = 0, n = 0;
  for (let i = 0; i < data.length; i += info.channels) if (data[i + 3] > 32) { sum += (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255; n++; }
  return { lum: n ? +(sum / n).toFixed(3) : 0.5, fill: +(n / (data.length / info.channels)).toFixed(3) };
}

async function processImage(sharp, buf, base) {
  let img = sharp(buf, { density: 300 }).ensureAlpha();
  // 투명 여백 자르기 (가장자리가 투명할 때만)
  try { img = sharp(await img.trim({ threshold: 1 }).png().toBuffer()); } catch {}
  for (const s of SIZES) {
    await img.clone().resize(s, s, { fit: 'inside', withoutEnlargement: false, kernel: 'lanczos3' })
      .webp({ quality: 90, alphaQuality: 100, effort: 6, smartSubsample: true })
      .toFile(path.join(ROOT, `${base}-${s}.webp`));
  }
}

async function main() {
  const { entries, report, todo } = plan();
  fs.mkdirSync(path.join(ROOT, 'raw/logos'), { recursive: true });
  writeJson('raw/logos/report.json', { at: new Date().toISOString(), teams: report }, true);
  const s = report.reduce((a, r) => ((a[r.src || 'none'] = (a[r.src || 'none'] || 0) + 1), a), {});
  console.log(`[logos] 팀 ${report.length} · 출처 ${JSON.stringify(s)} · 새로 만들 로고 ${todo.length}`);
  if (PLAN) {
    writeIndex(entries);
    const stats = readJson(STATS, {});
    process.exit(todo.length || allBases(entries).some((b) => !stats[b]) ? 1 : 0);
  }
  if (todo.length) {
    const sharp = (await import('sharp')).default;
    fs.mkdirSync(path.join(ROOT, OUT), { recursive: true });
    let ok = 0;
    for (const p of todo.slice(0, MAX_NEW)) {
      try {
        const { buf, how } = await getBytes(p);
        await processImage(sharp, buf, fileBase(p.id));
        ok++;
        if (how !== 'download' && how !== 'manual') console.log(`[logos] ${how}: ${p.url}`);
      } catch (e) { console.error('[logos] 실패', p.url || p.path, e.message); }
      if (p.kind !== 'file') await sleep(p.kind === 'lp' ? 1200 : 200);
    }
    if (browser) await browser.close();
    console.log(`[logos] ${ok}/${Math.min(todo.length, MAX_NEW)}개 만듦`);
  }
  // 밝기 기록이 없는 로고 재기
  const stats = readJson(STATS, {});
  const missing = allBases(entries).filter((b) => !stats[b]);
  if (missing.length) {
    const sharp = (await import('sharp')).default;
    for (const b of missing) { try { stats[b] = await measure(sharp, b); } catch (e) { console.error('[logos] 밝기 재기 실패', b, e.message); } }
    writeJson(STATS, stats, true);
  }
  writeIndex(entries);
  prune(entries);
}

const allBases = (entries) => [...new Set(Object.values(entries).flatMap((e) => (e.pick || []).filter((p) => p && done(p.id)).map((p) => fileBase(p.id))))];

// 화면이 쓸 대응표: 만들어진 파일만 넣는다 (아직 못 만든 것은 다음 빌드에)
function writeIndex(entries) {
  const index = {};
  const stats = readJson(STATS, {});
  for (const e of Object.values(entries)) {
    if (!e.pick) continue;
    const b = e.pick.map((p) => (p && done(p.id) ? fileBase(p.id) : null));
    if (!b[0] && !b[1]) continue;
    // [0] 어두운 배경용이 너무 어두우면, [1] 밝은 배경용이 너무 밝으면 뺀다 (둘 다 빠지면 그대로 둠)
    const ok = [b[0] && !(stats[b[0]]?.lum < 0.15), b[1] && !(stats[b[1]]?.lum > 0.9)];
    const f = ok[0] || ok[1] ? [ok[0] ? b[0] : null, ok[1] ? b[1] : null] : b;
    index[e.key] = { src: e.src, f: f.map((x) => (x ? x.replace(/^site\//, '') : null)) };
  }
  writeJson('raw/logos/index.json', index, true);
}

// 쓰지 않는 파일 지우기: site/logos/t 의 옛 파일, 그리고 옛 128px PNG(모든 팀이 새 로고로 옮겨 간 뒤)
// 지금 고른 로고의 파일은 모두 남긴다 (밝기 검사로 화면에서 뺀 쪽도: 지우면 다음 빌드가 다시 만들기 때문)
function prune(entries) {
  const index = readJson('raw/logos/index.json', {});
  const keep = new Set(allBases(entries).flatMap((b) => SIZES.map((s) => path.basename(`${b}-${s}.webp`))));
  const dir = path.join(ROOT, OUT);
  let n = 0;
  if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) if (!keep.has(f)) { fs.unlinkSync(path.join(dir, f)); n++; }
  const teams = ourTeams().filter((t) => snap.logos?.[t.id]);
  if (teams.every((t) => index[t.key])) {
    const old = path.join(ROOT, 'site/logos');
    for (const f of fs.readdirSync(old)) if (f.endsWith('.png')) { fs.unlinkSync(path.join(old, f)); n++; }
  }
  if (n) console.log(`[logos] 쓰지 않는 파일 ${n}개 지움`);
}

main().catch((e) => { console.error('[logos] 실패:', e.message); process.exitCode = 0; });
