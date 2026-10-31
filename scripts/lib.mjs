// 공통 유틸: 요청(재시도·User-Agent), 파일 입출력, 지역 이름 정규화
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
export const UA = process.env.ALGS_KR_UA || 'algs-kr-fan-site/1.0 (+https://github.com/LaplusSUGAR/algs-kr)';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function fetchJson(url, { headers = {}, retries = 2, delayMs = 400 } = {}) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json', ...headers } });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText} ← ${url}`);
      const json = await res.json();
      await sleep(delayMs); // 출처 서버에 부담을 주지 않도록 요청 사이 간격
      return json;
    } catch (e) {
      lastErr = e;
      await sleep(1000 * (i + 1));
    }
  }
  throw lastErr;
}

export function readJson(rel, fallback = null) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) return fallback;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

export function writeJson(rel, data, pretty = false) {
  const p = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, pretty ? 2 : 0));
}

export function writeText(rel, text) {
  const p = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text);
}

export const hash = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 8);

// 공식 API는 같은 지역을 'apac-north', 'asia-pacific-north', 'Asia Pacific North' 등으로 섞어 쓴다
const REGION_ALIASES = {
  'apac-north': 'apac-n', 'asia-pacific-north': 'apac-n', 'asia pacific north': 'apac-n', 'apac north': 'apac-n',
  'apac-south': 'apac-s', 'asia-pacific-south': 'apac-s', 'asia pacific south': 'apac-s', 'apac south': 'apac-s',
  emea: 'emea', 'europe-middle-east-and-africa': 'emea', 'europe middle east and africa': 'emea',
  americas: 'americas', global: 'global',
};
export const normRegion = (r) => (r ? REGION_ALIASES[String(r).toLowerCase()] || String(r).toLowerCase() : null);

export const REGION_LABEL = { 'apac-n': 'APAC North', 'apac-s': 'APAC South', emea: 'EMEA', americas: 'Americas', global: 'Global' };

// 팀 이름 비교용 키 (출처 간 매칭)
export const nameKey = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9가-힣]/g, '');
