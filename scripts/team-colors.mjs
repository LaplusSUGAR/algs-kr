// 팀 로고(site/logos/t/<해시>-160.webp)에서 대표 색을 뽑아 config/team-colors.json 에 적는다.
// 흑백·회색 로고는 밝으면 푸른 은빛(#6f86a6), 어두우면 푸른 검빛(#34476b).
// 사용: node scripts/team-colors.mjs   (sharp 필요: npm i --no-save --no-package-lock sharp@0.33)
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DIR = path.join(ROOT, 'site/logos/t');
const OUT = path.join(ROOT, 'config/team-colors.json');
const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};

function rgb2hsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 2;
  let h = 0, s = 0;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}
function hsl2hex(h, s, l) {
  const f = (n) => { const k = (n + h / 30) % 12; const a = s * Math.min(l, 1 - l); const v = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); return Math.round(v * 255).toString(16).padStart(2, '0'); };
  return `#${f(0)}${f(8)}${f(4)}`;
}

async function pick(file) {
  const { data, info } = await sharp(file).resize(48, 48, { fit: 'inside' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const bins = Array.from({ length: 24 }, () => ({ w: 0, h: 0, hx: 0, hy: 0, s: 0 }));
  let opaque = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    opaque++;
    const [h, s, l] = rgb2hsl(data[i], data[i + 1], data[i + 2]);
    if (s < 0.35 || l < 0.18 || l > 0.9) continue;
    const w = s * (1 - Math.abs(2 * l - 1));
    const b = bins[Math.floor(h / 15) % 24];
    b.w += w; b.hx += Math.cos((h * Math.PI) / 180) * w; b.hy += Math.sin((h * Math.PI) / 180) * w; b.s += s * w; b.n = (b.n || 0) + 1;
  }
  if (!opaque) return null;
  // 무채색 로고: 밝으면 푸른 은빛, 어두우면 푸른 검빛 (색 있는 면적이 없을 때 채우는 값)
  const bluish = () => {
    let sum = 0, cnt = 0;
    for (let i = 0; i < data.length; i += 4) { if (data[i + 3] < 128) continue; sum += (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255; cnt++; }
    return sum / cnt > 0.5 ? '#6f86a6' : '#34476b';
  };
  const best = bins.reduce((a, b) => (b.w > a.w ? b : a));
  if (!best.n || best.n / opaque < 0.08) return bluish(); // 색 있는 면적이 8% 미만이면 무채색 로고로 본다
  const h = ((Math.atan2(best.hy, best.hx) * 180) / Math.PI + 360) % 360;
  const s = Math.max(0.62, Math.min(0.9, best.s / best.w));
  // 흰 글자를 올리는 버튼·밑줄 색: 너무 밝거나 어둡지 않게 (노랑·연두는 어둡게)
  const l = h > 45 && h < 170 ? 0.36 : 0.46;
  return hsl2hex(h, s, l);
}

const out = {};
const files = fs.readdirSync(DIR).filter((f) => f.endsWith('-160.webp'));
for (const f of files) {
  const key = f.replace('-160.webp', '');
  out[key] = await pick(path.join(DIR, f));
}
const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
fs.writeFileSync(OUT, JSON.stringify(sorted, null, 1) + '\n');
const n = Object.values(sorted).filter(Boolean).length;
console.log(`${n}/${files.length}개 로고에서 색을 뽑음 (나머지는 기본 색)`);
