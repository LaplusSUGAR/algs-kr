// 링크 공유: 화면마다 따로 링크로 공유할 수 있게, 주소를 '#'·'?'·'&'·'=' 없는 경로로 만든다.
//
// 배경: 사이트는 화면 상태를 주소의 '#/standings?r=emea&m=a' 처럼 담는데, DC인사이드 같은 게시판은 '#'·'?'·'&' 부터 잘라 버려
//       링크가 홈으로만 열리고, 카카오톡·디스코드·X 의 미리보기 수집기는 '#' 뒤를 읽지 못한다.
// 해법: 상태를 주소 경로에 담는다.   …/algs-kr/s/standings/-/r/emea/m/a/pm/storm-point/
//        s/ 뒤에 화면 경로(standings, teams/RID0 …), 그다음 '-' 와 '이름/값' 쌍(r/emea …)이 이어진다. 언어·지난 시즌도 같은 쌍(lang/en, y/year-5).
//   - 자주 공유되는 화면(주요 화면, 팀, LCQ 지역×경기×지도 …)은 실제 파일(site/s/…/index.html)로 만든다: 미리보기 카드(og 태그)가 있고 정상(200)으로 열린다.
//   - 그 밖의 상태(선수 화면, 대회 기록 …)는 site/404.html 이 같은 규칙으로 풀어 준다(GitHub Pages 는 없는 경로에 404.html 을 보여 준다).
//   - 두 경우 모두 열면 곧바로 실제 화면(#/…)으로 이동한다. 예전 방식 링크(…/s/standings/?r=emea&m=a)도 그대로 열린다.
// 경로 규칙(sharePath)은 site/assets/app.js 의 같은 이름 함수와 반드시 같아야 한다(둘 다 고칠 것).
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, REGION_LABEL } from './lib.mjs';

export const SITE_URL = (process.env.SITE_URL || 'https://laplussugar.github.io/algs-kr/').replace(/\/?$/, '/');
const SITE_PATH = new URL(SITE_URL).pathname;
const BRAND = 'EASY ALGS KR';

// ---------- 경로 규칙 (app.js 와 같게) ----------
const ORDER = ['r', 'm', 'pm'];
const seg = (s) => encodeURIComponent(String(s)).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
export function sharePath(parts, pairs) {
  const ps = pairs.slice().sort((a, b) => { const i = ORDER.indexOf(a[0]), j = ORDER.indexOf(b[0]); return (i < 0 ? 99 : i) - (j < 0 ? 99 : j) || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0); });
  return [...parts.map(seg), ...(ps.length ? ['-', ...ps.flatMap(([k, v]) => [seg(k), seg(v)])] : [])].join('/');
}
const slug = (x) => String(x || '').toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ---------- 공유 페이지 목록 ----------
const PAGES = [ // [화면 경로, 제목, 설명]
  ['schedule', '경기 일정·결과', 'ALGS 예정 경기와 지난 결과, 게임 다시보기를 한국 팀 중심으로 확인합니다.'],
  ['schedule/replay', '게임 다시보기', '경기별 게임 결과로 탈락 순서를 재생해 봅니다.'],
  ['standings', '순위', '진행 중인 국제전·LCQ 순위와 진출선, 조 편성, POI 드래프트를 확인합니다.'],
  ['standings/finals', '결승', 'ALGS 국제전 결승 진행 상황과 순위를 확인합니다.'],
  ['standings/bracket', '브래킷', 'ALGS 국제전 브래킷과 진출 현황을 확인합니다.'],
  ['standings/group', '조별 리그', 'ALGS 국제전 조별 리그 순위와 진출선을 확인합니다.'],
  ['standings/champs', '챔피언십', 'ALGS 챔피언십 조 편성, 조별 리그, 브래킷, 결승을 확인합니다.'],
  ['standings/past', '이전 결과', '끝난 ALGS 국제전의 단계별 순위와 결과를 확인합니다.'],
  ['points', '챔피언십 포인트', '팀·선수별 챔피언십 포인트(CP)와 직행권·LCQ 경계선을 확인합니다.'],
  ['points/cp', '챔피언십 포인트', '팀·선수별 챔피언십 포인트(CP)와 직행권·LCQ 경계선을 확인합니다.'],
  ['points/events', '대회별 CP 내역', '팀과 선수가 어느 대회에서 몇 CP를 받았는지 확인합니다.'],
  ['points/pl', '프로리그 포인트', '지역별 프로리그 Split 순위와 포인트, 진출선을 확인합니다.'],
  ['teams', '팀', 'ALGS 참가 팀 목록과 로스터, 한국 팀·한국 선수 소속 팀을 확인합니다.'],
  ['streams', '방송', 'ALGS 공식 중계와 선수·코치·스트리머 방송, 지금 방송 중인 채널을 확인합니다.'],
  ['rules', '규칙', 'ALGS 대회 방식과 점수·포인트 규정을 영상과 그림으로 확인합니다.'],
];
const STATES = [ // [화면 경로, 이름, 값들 {값: 제목}, 설명]
  ['teams', 'g', { kr: '한국 관련 팀', 'apac-n': 'APAC North 팀', 'apac-s': 'APAC South 팀', emea: 'EMEA 팀', americas: 'Americas 팀', moves: '로스터 변경' }, 'ALGS 참가 팀과 로스터를 확인합니다.'],
  ['streams', 's', { live: '방송 중·영상', mv: '멀티뷰', official: '공식 중계', players: '선수·코치 방송', creators: '스트리머·전 프로' }, 'ALGS 방송과 영상을 확인합니다.'],
  ['rules', 's', { video: '규칙 영상', format: '대회 방식', points: '점수·포인트' }, 'ALGS 대회 규정을 확인합니다.'],
  ['schedule', 'view', { results: '지난 결과' }, 'ALGS 지난 경기 결과를 한국 팀 중심으로 확인합니다.'],
];

// teams: 지금 팀(약칭 → 팀). lcq: [{ region, maps: { 경기 키: [지도 이름…] } }]. lcqStages: [{ key, tab }] (규칙 파일 brackets.lcq.stages)
export function buildSharePages(teams, { seasonName = '', lcq = [], lcqStages = [] } = {}) {
  const pages = [];
  const add = (parts, pairs, title, desc) => pages.push({ path: sharePath(parts, pairs), parts, pairs, title: `${title} · ${BRAND}`, desc });
  for (const [p, title, desc] of PAGES) add(p.split('/'), [], title, desc);
  for (const [p, key, vals, desc] of STATES) for (const [v, title] of Object.entries(vals)) add(p.split('/'), [[key, v]], `${title} · ${{ teams: '팀', streams: '방송', rules: '규칙', schedule: '경기' }[p]}`, desc);
  for (const t of Object.values(teams)) {
    if (!t.short) continue;
    const region = REGION_LABEL[t.region] || '';
    const kr = t.krLevel === 'team' ? '한국 팀' : t.krLevel === 'member' ? '한국 선수 소속 팀' : t.krLevel === 'coach' ? '한국 코치 팀' : '';
    add(['teams', t.short], [], `${t.name || t.short} · 팀`, `${t.name || t.short}${t.was ? `(구 ${t.was})` : ''} — ${[seasonName, region, kr].filter(Boolean).join(' · ')}. 로스터, 챔피언십 포인트, 경기 결과, 선수 방송을 확인합니다.`);
  }
  // LCQ: 지역 × (조 편성 + 경기별) × (그 경기에 POI 드래프트 지도가 있으면 지도별)
  for (const { region, maps } of lcq) {
    const R = REGION_LABEL[region] || region;
    for (const [m, tab] of [['groups', '조 편성'], ...lcqStages.map((s) => [s.key, s.tab || s.key])]) {
      add(['standings'], [['r', region], ['m', m]], `LCQ ${R} · ${tab} · 순위`, `${R} LCQ ${tab}: 경기 일정, 출전 팀, 점수표, POI 드래프트를 확인합니다.`);
      for (const map of maps?.[m] || []) add(['standings'], [['r', region], ['m', m], ['pm', slug(map)]], `LCQ ${R} · ${tab} · ${map} POI · 순위`, `${R} LCQ ${tab}의 POI 드래프트 — ${map}에서 팀별 낙하 지점 선택을 확인합니다.`);
    }
  }
  return pages;
}

// ---------- HTML ----------
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// 주소 경로 → 실제 화면 주소. base: 사이트 맨 위 경로(예: /algs-kr/). 파일이 없는 주소(404.html)와 공유용 페이지가 같이 쓴다
const decoder = (baseExpr) => `(function(){try{
var L=location,b=${baseExpr},m=L.pathname.match(/\\/s\\/(.*)$/),rest=m?m[1].split('/').filter(Boolean).map(decodeURIComponent):[];
var i=rest.indexOf('-'),route=i<0?rest:rest.slice(0,i),kv=i<0?[]:rest.slice(i+1),a=new URLSearchParams(),q=new URLSearchParams();
function put(k,v){(k==='lang'||k==='y'?a:q).set(k,v)}
for(var j=0;j+1<kv.length;j+=2)put(kv[j],kv[j+1]);
new URLSearchParams(L.search).forEach(function(v,k){put(k,v)});
var s=a.toString(),h=q.toString();
L.replace(b+(s?'?'+s:'')+'#/'+route.map(encodeURIComponent).join('/')+(h?'?'+h:''));
}catch(e){location.replace(${baseExpr})}})();`;
const head = (title, desc, url, extra = '') => `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="robots" content="noindex,follow">
<meta name="theme-color" content="#121317">
${extra}<meta property="og:type" content="website">
<meta property="og:site_name" content="${BRAND}">
<meta property="og:locale" content="ko_KR">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${SITE_URL}assets/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${SITE_URL}assets/og.png">`;
const stub = (p) => {
  const url = `${SITE_URL}s/${p.path}/`, up = '../'.repeat(p.path.split('/').length + 1);
  return `<!doctype html>
<html lang="ko">
<head>
${head(p.title, p.desc, url, `<link rel="canonical" href="${esc(url)}">\n`)}
</head>
<body>
<p><a href="${up}#/${p.parts.map(seg).join('/')}${p.pairs.length ? '?' + p.pairs.map(([k, v]) => `${seg(k)}=${seg(v)}`).join('&') : ''}">${esc(p.title)} 열기</a></p>
<script>
${decoder(`new URL(${JSON.stringify(up)},location.href).pathname`)}
</script>
</body>
</html>
`;
};
const NOT_FOUND = `<!doctype html>
<html lang="ko">
<head>
${head(`${BRAND} · 비공식 팬 사이트`, 'ALGS 한국 팀 순위, 경기 일정·결과, 프로리그 포인트, 챔피언십 포인트를 한눈에.', SITE_URL)}
</head>
<body>
<p><a href="${SITE_PATH}">${BRAND} 열기</a></p>
<script>
${decoder(JSON.stringify(SITE_PATH))}
</script>
</body>
</html>
`;

// site/s/ 와 site/404.html 에 쓴다: 내용이 같으면 건드리지 않고, 이제 필요 없는 파일(없어진 팀 등)은 지운다
export function writeSharePages(pages) {
  const dir = path.join(ROOT, 'site/s');
  const want = new Set(pages.map((p) => path.join(dir, p.path, 'index.html')));
  let wrote = 0, removed = 0;
  const put = (f, body) => { if (fs.existsSync(f) && fs.readFileSync(f, 'utf8') === body) return; fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, body); wrote++; };
  for (const p of pages) put(path.join(dir, p.path, 'index.html'), stub(p));
  put(path.join(ROOT, 'site/404.html'), NOT_FOUND);
  const walk = (d) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) { walk(f); if (!fs.readdirSync(f).length) fs.rmdirSync(f); } else if (!want.has(f)) { fs.unlinkSync(f); removed++; }
    }
  };
  walk(dir);
  if (wrote || removed) console.log(`[share] 공유용 페이지 ${pages.length}개 (새로 씀 ${wrote}, 지움 ${removed})`);
}
