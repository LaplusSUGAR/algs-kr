// 공식 팀 로고를 작게 줄여 site/logos/ 에 저장한다.
// 공식 로고 원본은 가로 8000px까지 있어 모바일에서 늦게 뜨거나 안 뜨는 일이 생기므로, 128px PNG로 줄여 같은 사이트에서 내보낸다.
//   node scripts/fetch-logos.mjs --check : 새로 받을 로고가 있으면 종료 코드 1 (그때만 sharp를 설치해 실행)
//   node scripts/fetch-logos.mjs         : 없는 로고만 받아서 줄임
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, readJson, hash, sleep, UA } from './lib.mjs';

const OUT = path.join(ROOT, 'site/logos');
const snap = readJson('raw/algs/snapshot.json', {});
const urls = [...new Set(Object.values(snap.logos || {}).flat().filter(Boolean))];
const fileOf = (u) => `${hash(u)}.png`;
const todo = urls.filter((u) => !fs.existsSync(path.join(OUT, fileOf(u))));

if (process.argv.includes('--check')) {
  console.log(`[logos] 새 로고 ${todo.length}개`);
  process.exit(todo.length ? 1 : 0);
}
if (!todo.length) { console.log('[logos] 새 로고 없음'); process.exit(0); }

const sharp = (await import('sharp')).default;
fs.mkdirSync(OUT, { recursive: true });
let ok = 0;
for (const u of todo) {
  try {
    const res = await fetch(u, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(res.status);
    const buf = Buffer.from(await res.arrayBuffer());
    await sharp(buf).resize(128, 128, { fit: 'inside', withoutEnlargement: true }).png({ compressionLevel: 9 }).toFile(path.join(OUT, fileOf(u)));
    ok++;
    await sleep(150);
  } catch (e) {
    console.error('[logos] 실패', u, e.message);
  }
}
console.log(`[logos] ${ok}/${todo.length}개 저장`);
