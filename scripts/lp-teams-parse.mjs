// Liquipedia 그려진 HTML에서 팀 이름 · 선수 · 로고 아이콘을 뽑는다 (fetch-lp-teams.mjs가 저장 전에, logos.mjs가 대조할 때 씀)
//   프로리그 페이지: 'Participants' 절의 팀 카드 (팀 이름, 로고, 주전 선수. 코치·분석가는 뺌)
//   챌린저 서킷 페이지: 'Standings' 표의 줄 (팀 이름, 로고, 선수 3명)
// 로고 주소는 표에 쓰인 작은 그림(thumb)에서 원본 주소로 바꾼다. Liquipedia 기본 그림(로고 없는 팀)은 '없음'으로 본다
const BASE = 'https://liquipedia.net';
const PLACEHOLDER = /Apex_?Legends_?default|ApexLegendsLogo|Logo_filler|Liquipedia_logo/i;
const STAFF = /^(coach|head coach|assistant coach|analyst|manager|staff|owner|strategic coach)$/i;

export const unent = (x) => String(x || '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#160;/g, ' ').replace(/&#95;/g, '_');
// 이름 비교용: 소문자, 글자·숫자만 (한글·일본어·한자 포함)
export const nk = (s) => String(s || '').normalize('NFKC').toLowerCase().replace(/[^a-z0-9가-힣ぁ-んァ-ヶ一-龥]/g, '');

// 표의 작은 그림 주소 → 원본 그림 주소
export function original(src) {
  if (!src) return null;
  let p = unent(src).replace(/^https?:\/\/liquipedia\.net/, '');
  const m = /^\/commons\/images\/thumb\/(.+)\/[^/]+$/.exec(p);
  if (m) p = `/commons/images/${m[1]}`;
  if (PLACEHOLDER.test(p.split('/').pop())) return null;
  return BASE + p;
}

// 한 구간에서 처음 나오는 팀 로고 아이콘: [어두운 배경용(darkmode), 밝은 배경용(lightmode)]. 한 장(allmode)이면 둘 다 같은 그림
function icons(seg) {
  let light, dark, all;
  for (const m of seg.matchAll(/<span class="team-template-image-icon([^"]*)">\s*(?:<a[^>]*>)?\s*<img[^>]*?src="([^"]+)"/g)) {
    const u = original(m[2]);
    if (/lightmode/.test(m[1])) { if (light === undefined) light = u; }
    else if (/darkmode/.test(m[1])) { if (dark === undefined) dark = u; }
    else if (all === undefined) all = u;
    if (light !== undefined && dark !== undefined) break;
  }
  return [dark ?? all ?? null, light ?? all ?? null];
}

const pageOf = (href) => { const m = /^\/apexlegends\/([^?#"]+)$/.exec(unent(href || '')); return m ? decodeURIComponent(m[1]) : null; };

// 프로리그 페이지의 팀 카드
export function plCards(html) {
  const a = html.indexOf('id="Participants"'), b = html.indexOf('id="Results"');
  const sec = html.slice(a > 0 ? a : 0, b > a ? b : undefined);
  const cards = sec.split(/class="general-collapsible[^"]*team-participant-card"/).slice(1);
  const out = [];
  for (const c of cards) {
    const nm = /<span class="name"><a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/.exec(c);
    if (!nm) continue;
    const head = c.split(/team-participant-roster/)[0];
    const players = [];
    for (const mem of c.split(/class="team-participant-card(?:__|&#95;&#95;)member"/).slice(1)) {
      const p = /<span class="name"><a[^>]*?(?:title="([^"]*)")?[^>]*>([^<]*)<\/a>/.exec(mem);
      if (!p) continue;
      const role = /member-role-right">([^<]*)</.exec(mem)?.[1]?.trim() || '';
      if (STAFF.test(role)) continue;
      const n = unent(p[2]).trim();
      if (n && !players.includes(n)) players.push(n);
    }
    out.push({ name: unent(nm[2]).trim(), page: pageOf(nm[1]), players, icon: icons(head) });
  }
  return out;
}

// 챌린저 서킷 페이지의 종합 순위 줄
export function ccRows(html) {
  const a = html.indexOf('id="Standings"');
  const b = html.indexOf('<h2', a + 20);
  const sec = html.slice(a > 0 ? a : 0, b > a ? b : undefined);
  const out = [];
  const seen = new Set();
  for (const row of sec.split(/<tr[^>]*>/).slice(1)) {
    if (!/team-template-text/.test(row)) continue;
    const nm = /team-template-text"><a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/.exec(row);
    if (!nm) continue;
    const name = unent(nm[2]).trim();
    if (seen.has(nk(name))) continue;
    seen.add(nk(name));
    const players = [...row.matchAll(/class="inline-player">[\s\S]*?<a[^>]*>([^<]*)<\/a>/g)].map((m) => unent(m[1]).trim()).filter(Boolean);
    out.push({ name, page: /redlink=1/.test(nm[1]) ? null : pageOf(nm[1]), players, icon: icons(row) });
  }
  return out;
}

// 저장된 원본(raw/lp/teams-src.json) → 대조용 목록
export function lpTeams(src) {
  const out = [];
  for (const [key, pg] of Object.entries(src.pages || {})) {
    const [kind, region] = key.split(':');
    const teams = pg.teams || (pg.html ? (kind === 'pl' ? plCards(pg.html) : ccRows(pg.html)) : []);
    for (const t of teams) {
      // 표 로고가 기본 그림이면 팀 페이지 정보 상자의 로고(fetch-lp-teams가 따로 확인)
      const ex = !t.icon[0] && !t.icon[1] && t.page ? src.extra?.[t.page]?.icon : null;
      out.push({ ...t, icon: ex && (ex[0] || ex[1]) ? ex : t.icon, iconFrom: ex && (ex[0] || ex[1]) ? 'infobox' : 'table', kind, region, pageKey: key, pageUrl: `${BASE}/apexlegends/${pg.title}` });
    }
  }
  return out;
}

// 이름이 같은 팀인지
//   sameName: 글자·숫자만 비교, 'Team'·'Esports'·'Gaming' 같은 앞뒤 말은 떼고도 비교 → 확실히 같은 이름
//   nearName: 약자(PXX = Pork Xiaolongbao Xpert)·같은 조직 앞말(Gen.G Citadel ↔ Gen.G Esports)·포함 관계 → 선수가 2명 이상 겹칠 때만 같은 팀으로 인정
const core = (s) => nk(s).replace(/^team/, '').replace(/(esports?|gaming|club|gg|team)$/, '');
export function sameName(t, x) {
  const a = [t.name].map(nk).filter(Boolean);
  const b = [x.name, x.page ? x.page.replace(/_/g, ' ') : ''].map(nk).filter(Boolean);
  for (const p of a) for (const q of b) {
    if (p === q) return true;
    const cp = core(p), cq = core(q);
    if (cp.length >= 3 && cp === cq) return true;
    if (p.length >= 6 && q.length >= 6 && (p.startsWith(q) || q.startsWith(p))) return true;
  }
  return false;
}

const words = (s) => String(s || '').normalize('NFKC').toLowerCase().split(/[^a-z0-9가-힣ぁ-んァ-ヶ一-龥]+/).filter(Boolean);
const acronyms = (s) => { const w = words(s); const out = new Set(); for (let i = 2; i <= w.length; i++) out.add(w.slice(0, i).map((x) => x[0]).join('')); return out; };
// 자매 팀 표시(아카데미·블랙·제로 …)가 한쪽에만 있거나 서로 다르면 다른 팀
const SISTER = new Set(['academy', 'black', 'white', 'red', 'blue', 'green', 'zero', 'one', 'two', 'three', 'b', 'c', 'jr', 'junior', 'youth', 'next', 'rising']);
const sisters = (s) => words(s).filter((w) => SISTER.has(w)).sort().join(',');
export function nearName(t, x) {
  if (sameName(t, x)) return true;
  if (sisters(t.name) !== sisters(x.name)) return false;
  const mineW = [...words(t.name), nk(t.short)].filter((w) => w.length >= 2);
  const lpA = acronyms(x.name), myA = acronyms(t.name);
  if (mineW.some((w) => lpA.has(w)) || words(x.name).some((w) => w.length >= 2 && myA.has(w))) return true;
  const a = words(t.name), b = words(x.name);
  if (a[0] && b[0] && a[0].length >= 3 && a[0] === b[0]) return true;
  if (a[0] && b[0] && Math.min(a[0].length, b[0].length) >= 5 && (a[0].startsWith(b[0]) || b[0].startsWith(a[0]))) return true;
  const p = nk(t.name), q = nk(x.name);
  return Math.min(p.length, q.length) >= 5 && (p.includes(q) || q.includes(p));
}
