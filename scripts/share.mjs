// 공유용 페이지: 페이지마다 따로 링크로 공유할 수 있게, 미리보기 카드(제목·설명·그림) 태그가 든 작은 HTML을 site/s/<경로>/index.html 로 만든다.
//
// 사이트는 주소의 '#' 뒤로 화면을 나누는데, 카카오톡·디스코드·X 같은 미리보기 수집기는 '#' 뒤를 읽지 못하고 JS도 돌리지 않는다.
// 그래서 같은 화면에 실제 파일 경로(…/s/teams/E36/)를 하나씩 만들어 두고, 수집기는 그 파일의 태그를 읽고, 사람이 열면 곧바로 실제 화면(#/teams/E36)으로 보낸다.
//   - 주소 뒤 ?lang=·?y= 는 사이트 설정(언어·지난 시즌)이라 그대로 두고, 나머지(?r=apac-n&m=a …)는 화면 안 상태라 '#' 뒤로 옮긴다.
//   - 팀 이름은 안 바뀌는 글자만 쓴다(순위처럼 자주 바뀌는 값은 넣지 않는다: 빌드마다 파일이 바뀌어 커밋이 늘지 않게).
// app.js 의 공유 버튼은 data 의 share(경로 목록)에 있는 화면이면 이 주소를, 없으면(선수 화면 등) 기존 '#/…' 주소를 쓴다.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, REGION_LABEL } from './lib.mjs';

export const SITE_URL = (process.env.SITE_URL || 'https://laplussugar.github.io/algs-kr/').replace(/\/?$/, '/');
const BRAND = 'EASY ALGS KR';
// 경로, 제목, 설명 (앱의 화면과 같은 이름. 새 화면을 만들면 여기에도 한 줄)
const PAGES = [
  ['schedule', '경기 일정·결과', 'ALGS 예정 경기와 지난 결과, 게임 다시보기를 한국 팀 중심으로 확인합니다.'],
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
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// 공유용 페이지 목록: [{ path, title, desc }]. teams: 지금 팀(약칭 → 팀)
export function buildSharePages(teams, seasonName = '') {
  const pages = PAGES.map(([p, title, desc]) => ({ path: p, title: `${title} · ${BRAND}`, desc }));
  for (const t of Object.values(teams)) {
    if (!t.short || !/^[A-Za-z0-9_.-]+$/.test(t.short)) continue; // 파일 경로로 쓸 수 없는 약칭은 기존 '#/' 주소로
    const region = REGION_LABEL[t.region] || '';
    const kr = t.krLevel === 'team' ? '한국 팀' : t.krLevel === 'member' ? '한국 선수 소속 팀' : t.krLevel === 'coach' ? '한국 코치 팀' : '';
    pages.push({
      path: `teams/${t.short}`,
      title: `${t.name || t.short} · 팀 · ${BRAND}`,
      desc: `${t.name || t.short}${t.was ? `(구 ${t.was})` : ''} — ${[seasonName, region, kr].filter(Boolean).join(' · ')}. 로스터, 챔피언십 포인트, 경기 결과, 선수 방송을 확인합니다.`,
    });
  }
  return pages;
}

const html = (p) => {
  const url = `${SITE_URL}s/${p.path}/`, depth = p.path.split('/').length + 1, up = '../'.repeat(depth);
  const img = `${SITE_URL}assets/og.png`;
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(p.title)}</title>
<meta name="description" content="${esc(p.desc)}">
<meta name="robots" content="noindex,follow">
<meta name="theme-color" content="#121317">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${BRAND}">
<meta property="og:locale" content="ko_KR">
<meta property="og:title" content="${esc(p.title)}">
<meta property="og:description" content="${esc(p.desc)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(img)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(p.title)}">
<meta name="twitter:description" content="${esc(p.desc)}">
<meta name="twitter:image" content="${esc(img)}">
</head>
<body>
<p><a href="${up}#/${esc(p.path)}">${esc(p.title)} 열기</a></p>
<script>
(function(){var q=new URLSearchParams(location.search),a=new URLSearchParams(),r=new URLSearchParams();
q.forEach(function(v,k){(k==='lang'||k==='y'?a:r).append(k,v)});
var s=a.toString(),h=r.toString();
location.replace(new URL(${JSON.stringify(up)},location.href).href+(s?'?'+s:'')+'#/'+${JSON.stringify(p.path)}+(h?'?'+h:''));})();
</script>
</body>
</html>
`;
};

// site/s/ 에 쓴다: 내용이 같으면 건드리지 않고, 이제 필요 없는 파일(없어진 팀 등)은 지운다
export function writeSharePages(pages) {
  const dir = path.join(ROOT, 'site/s');
  const want = new Set(pages.map((p) => path.join(dir, p.path, 'index.html')));
  let wrote = 0;
  for (const p of pages) {
    const f = path.join(dir, p.path, 'index.html'), body = html(p);
    if (fs.existsSync(f) && fs.readFileSync(f, 'utf8') === body) continue;
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, body);
    wrote++;
  }
  let removed = 0;
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
