# EASY ALGS KR — 작업 인수인계 (Claude용)

이 파일은 이 저장소에서 작업하는 Claude가 처음 읽는 안내서다. 사람이 읽어도 되도록 썼다.
자세한 구조는 `README.md`, 공식 규정 요약은 `docs/rules-year-6.md` 를 함께 본다.

## 사이트

- ALGS(Apex Legends Global Series) 한국 팬 사이트. 주소: https://laplussugar.github.io/algs-kr/
- 저장소: LaplusSUGAR/algs-kr. 정적 GitHub Pages + GitHub Actions 로 5분마다 데이터 갱신.
- 운영자는 한국어로 소통한다. 답은 한국어로. 운영자는 주로 휴대폰으로 본다.
- 화면 언어: 한국어 기본, 일본어·영어 번역(`site/assets/i18n.js`, 아래 "번역" 참고).

## 꼭 지킬 것

- **LaplusSUGAR/algsguide 저장소는 건드리지 않는다.** (운영자가 연결을 거절함)
- **커밋은 main 에 바로.** 봇이 5분마다 데이터를 커밋하므로 항상 `git pull --rebase --autostash` 먼저 하고, 커밋 전에 빌드가 만든 파일을 되돌려 의도한 파일만 올린다:
  `git checkout -- site/data/algs-data.js site/data/ver.json site/index.html` (필요하면 `logs raw` 도)
  - 예외: `site/data/stream-channels.json` 은 채널을 바꿨을 때 함께 커밋한다.
- 커밋 작성자는 운영자 계정(LaplusSUGAR)으로. 운영자 이메일은 개인정보라 파일·채팅·외부 요청에 쓰지 않는다(git 설정에만).
- **API 키 값은 GitHub Secrets 에만** 둔다. 코드·로그·채팅·배포 파일에 쓰지 않는다.
  등록된 Secrets: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, YOUTUBE_API_KEY
- x.com 링크는 읽을 수 없다(차단). 트윗 내용은 운영자에게 물어본다.
- 자동 갱신을 멈추려면 저장소 변수 `AUTO_REFRESH=off`.

## 데이터 흐름

`scripts/fetch-*.mjs` → `raw/` → `scripts/season.mjs`(메인 시즌 선택·지난 시즌 보관) → `scripts/build-data.mjs` → `site/data/algs-data.js`(ID 압축), `ver.json`, `stream-channels.json`, `seasons/`

- 공식 API(`fetch-algs.mjs`)가 기본, Liquipedia(`fetch-liquipedia.mjs`, `fetch-lp-*.mjs`)가 보조.
- 빌드 때마다 `scripts/check-rules.mjs` 가 규칙 파일과 데이터를 대조한다.
- **LCQ POI 드래프트**: `scripts/poi-maps.mjs` 가 끝난 드래프트의 선택(공식 API `poi-drafts/{id}/pick`)을 받아 좌표(%)와 함께 `site/data/poi-maps.json` 에 적고(받을 때 공식 낙하 지점 목록과 대조해 어긋나면 `[poi] 경고`), 빌드가 `A.poi` 로 싣는다. 화면(`stageMatch` → `poiSection`, LCQ 경기 탭)은 바탕 지도(`site/poi/base/<지도>.webp`, 공식 사이트 그림) 위에 팀 로고 핀을 얹고, 핀에 마우스를 올리면(휴대폰은 누르면) 팀 로고·이름·낙하 지점이 뜬다. 그림 파일은 만들지 않는다. **다음 라운드 자동 반영**: 시작 전·진행 중 드래프트는 ID와 시작 시각만 `A.poi` 에 실리고, 그 경기 탭을 보고 있는 브라우저가 시작 15분 전부터 공식 API(`poi-drafts/{id}`, `/pick`)를 직접 받아(`poiTick`, 약 10초마다, 끝나면 멈춤) 선택이 나오는 대로 핀을 보여 준다. 끝나면 빌드가 위 목록으로 확정해 `done` 이 되고 그때부터는 목록을 쓴다. 진행 중 응답 모양은 완료된 드래프트 데이터를 가공해 가짜 API로만 시험했으므로 실제 승자 2R(11-20)에서 확인 필요. 워크플로가 매 실행 이 스크립트를 돌린다(시작 시각 앞 2시간~뒤 6시간만 자주 확인, 그 밖에는 6시간에 한 번). 새 지도가 나오면 바탕 그림을 `site/poi/base/` 에 같은 이름(소문자·하이픈, 예 `worlds-edge.webp`)으로 넣는다. 다시 받으려면 `node scripts/poi-maps.mjs --force`(작업 공간에서는 `NODE_USE_ENV_PROXY=1` 필요).
- 워크플로 `build.yml`: 5분마다 스스로 다시 실행하는 사슬. 동시 실행 제한은 build·deploy 작업에만 걸려 있어 수동 실행이 대기 없이 바로 돈다.

## 운영자가 손으로 고치는 설정

| 파일 | 내용 |
|---|---|
| `config/overrides.json` | `rosterMoves`(로스터 변경: 팀, out, in, date), `rosterAutoIgnore`, `cpSubs`, `cpRosterAdd`, `ccRenames`(챌린저 팀 이름 변경), `schedExtra`(공식에 없는 일정, 예: POI 드래프트), `lcqSchedule`, `lcqSeeds`(확정 LCQ 시드, 지역별 40팀), `lcqCcAlias`, `streams`(코치 등 방송 목록 추가). 시즌별 값은 `SEASON_KEYS` 로 묶여 시즌이 바뀌면 함께 보관된다 |
| `config/players.json` | `players`: 선수·코치별 role, title, country, twitch/youtube/chzzk/soop 주소. `creators`: 대회 선수가 아닌 한국 스트리머·전 프로(kind: streamer / expro, org) |
| `config/season.json` | 공식 중계 채널(`broadcasts`, `apexOnly` 표시) 등 |
| `config/rules/year-6.json` | 공식 규정 숫자(점수, 슬롯, LCQ·챔피언십 방식)와 `brackets`(대진 단계·진출 규칙·진행 그림). Year 7 방식이 바뀌면 이 파일만 고치면 된다 |

JSON 을 고친 뒤에는 꼭 문법을 확인한다(운영자가 따옴표 없이 주소를 넣어 빌드가 깨진 적 있음).

## 방송 기능

- Cloudflare Worker `algs-kr-streams` (`worker/streams/`), 주소 `https://algs-kr-streams.laplussugar.workers.dev/streams.json`. `worker/streams/**` 를 푸시하면 `worker-streams.yml` 이 배포하고, 응답을 점검해 로그에 남긴다(`/debug/chzzk` 점검 경로 포함).
- 확인 방식: Twitch Helix(게임 이름), YouTube 채널 RSS + videos.list(방송 확정), 치지직 비공식 `live-detail`(카테고리).
- Cloudflare 무료 한도(요청당 외부 호출 50회) 때문에 호출 예산(40)을 두고 나눠 갱신한다.
- **2분마다 예약 실행(cron)** 이 방송 상태를 모아 KV 한 칸(`blob` = state + latest)에 적고, 사이트 요청에는 그 값을 바로 돌려준다(KV 쓰기 하루 720번, 무료 한도 1,000). KV 저장소는 배포 워크플로가 만들어 wrangler.toml 에 덧붙인다. 사이트는 지난 응답(5분 이내)을 localStorage 에 두고 열자마자 쓴다.
- 채널 목록은 Worker 가 10분마다 다시 읽으므로, 채널 추가는 최대 10분 뒤 반영.

**방송 표출 규칙 (운영자 확정, 11-16 갱신)**
1. 대전제: 선수·코치·스트리머 방송은 **Apex 를 하고 있을 때만** 방송 중으로 친다. Twitch·치지직은 게임(카테고리)으로 판단. YouTube 는 게임 표시가 없어 선수 채널은 그대로, 스트리머·공식 파트너·RAGE 는 제목·태그에 Apex/ALGS 등이 있을 때만.
2. 카드로 보여 줄 방송은 보기에 따라 정한다(`liveShown`). 나머지는 방송 탭의 접힌 "그 밖의 방송" 목록(같은 플레이어·멀티뷰로 재생 가능).
   - 한국 관련: 한국 선수·코치(한국 국적·한국계) + 한국 스트리머·전 프로. 대회 때는 영어·일본어 공식 중계 + 한국 관련 팀의 공식 팀 화면
   - APAC North: APAC North 팀 선수. 대회 때는 일본어 공식 중계 + APAC North 팀의 공식 팀 화면
   - 내 응원 팀: 고른 팀 선수. 대회 때는 영어·일본어 공식 중계 + 고른 팀의 공식 팀 화면
3. 순서: 공식 중계 → 공식 팀 화면 → 선수·코치 → 스트리머·전 프로. 홈 "지금 방송 중"은 3칸.
4. 공식 팀 화면: Twitch `algs1_team1`…`algs4_team20`, `algsN_map` (`config/season.json` 의 `povChannels`). 대회 때만 켜지고 제목 맨 앞이 팀 이름("Team Falcons | ALGS …")이라, 그 이름으로 팀을 찾는다(`povTeam`). algs2~4 는 이름 규칙으로 미리 넣은 것이라 실제로 쓰이는지는 대회 때 확인 필요.
5. 로스터 변경으로 팀을 나간 사람은 방송 목록에서 자동 제외(예: Re9zq).
6. Twitch 다시보기는 운영자 요청으로 제거했다. 최근 영상은 YouTube 영상·쇼츠만(쇼츠는 따로).
7. 플레이어: 멀티뷰(최대 4화면), 시네마 모드. 치지직은 공식 임베드가 없어 새 창으로 이동.
8. 방송 제목은 Worker 가 Workers AI 로 한·일·영 번역해 둔다(`tr`).

## LCQ 시드 (2026-11 확정 사항)

- 네 지역 모두 확정 시드를 `lcqSeeds` 에 넣었다. APAC North 는 운영자가 준 확정표(11-14 재확정본), 나머지는 공식 사이트 POI 드래프트 선택 순서를 지그재그(A: 1·4·5·8…, B: 2·3·6·7…)로 풀어 적은 것.
- 실제 운영은 로스터 변경(영입 포함)으로 오른 CP 와 2부 팀의 챌린저 시리즈 포인트를 모두 반영했다(규정 3.7.1 문구와 다름). 확정본이 없을 때 사이트는 로스터 반영 CP 로 계산한다.
- 2부 팀 약칭이 프로리그 팀과 겹치면 2부 쪽 약칭을 바꾼다(`lcqShortFix`): GROWGaming→GROW, Burger Boys→BURG, VOID ESPORTS→VE, Aura→AURA2. 같은 대회 안 약칭 중복(EMEA MEOW 두 팀)도 팀 ID 로 구분.

## 링크 공유

- 헤더의 공유 버튼(`shareBtn` → `sharePage`)이 휴대폰은 공유 시트, PC는 클립보드 복사(`toast`)로 현재 화면 링크를 내보낸다.
- **공유 주소에는 `#`·`?`·`&`·`=`·`+` 를 쓰지 않는다.** DC인사이드 같은 게시판은 그 뒤를 잘라 링크가 홈으로만 열리고(2026-11 운영자 확인), 미리보기 수집기(카카오톡·디스코드·X)도 `#` 뒤를 못 읽는다. 그래서 화면 상태를 주소 경로에 담는다:
  `…/algs-kr/s/standings/-/r/emea/m/a/pm/storm-point/` = `s/` + 화면 경로 + `-` + `이름/값` 쌍(정렬 규칙: r, m, pm, 나머지는 가나다순). 언어는 브라우저 기본 언어와 다를 때만 `lang/ja` 로, 지난 시즌은 `y/year-5` 로 담는다. 재생 중 방송(`play`)은 뺀다. LCQ 화면은 지금 보는 지역·경기·지도를 명시한다(`shareUrl`).
- 규칙은 `app.js` 의 `sharePath` 와 `scripts/share.mjs` 의 `sharePath` 가 같아야 한다(둘 다 고칠 것). 지도 이름은 소문자·하이픈(`storm-point`)으로 담고, 앱은 이름·경로용 이름 둘 다 받는다(`poiSlug`).
- 열릴 때: 자주 공유되는 화면(주요 화면, 팀 전부, LCQ 지역×경기×지도, 팀·방송·규칙의 보기 …)은 빌드(`scripts/share.mjs`)가 실제 파일 `site/s/<경로>/index.html` 로 만든다. 정상(200)이고 og 태그(제목·설명·`assets/og.png`)가 있어 미리보기 카드가 뜬다. 그 밖의 상태(선수 화면, 대회 기록 …)는 `site/404.html` 이 같은 규칙으로 풀어 준다(GitHub Pages 가 없는 경로에 404.html 을 보여 줌; 카드는 없음). 둘 다 열면 곧바로 `#/…` 화면으로 이동한다. 예전 방식 `…/s/standings/?r=emea&m=a` 도 열린다.
- 새 화면·새 보기 값을 만들면 `share.mjs` 의 `PAGES`/`STATES` 에 한 줄(없어도 404.html 이 풀어 주지만 카드가 없다). 페이지 제목은 `setPageTitle`. 사이트 주소가 바뀌면 `SITE_URL` 환경 변수와 `index.html` 의 og 태그를 고친다. 카드는 각 서비스가 캐시를 가지고 있어 바뀐 뒤에도 한동안 예전 모양일 수 있다.

## 화면

- 주 메뉴: 홈·경기·순위·방송·팀 + 더보기(포인트·규칙). 넓은 화면은 7개 한 줄.
- 디자인(11-16 개편, 운영자가 준 Stitch 시안 기준 "택티컬 HUD"): 판은 6px 모서리 + 1px 선, 배지는 4px·대문자·넓은 자간, 제목 앞 빗금(/), 선택된 탭은 강조판 + 아래 2px 빨간 선, 홈 맨 위 "다음 경기" 카드(큰 D-day 숫자, 왼쪽 빨간 막대). 글꼴 Inter + Pretendard. **밝은 모드는 기존 색(밝은 바탕 + 검은 머리 + 빨강)**, **어두운 모드는 시안 색**(바탕 #0B0F15, 판 #141B24, 강조판 #1E2836, 선 #283547, 글자 #ECE9E4 / #8A99AD, 빨강 #DA292A·#FF2A2A, 청록 #00E5FF, 호박 #FFAE00, KR 파랑 #3B82F6). 규칙은 style.css 맨 끝 "2026-11 디자인 개편" 층에 모여 있다.
- **게임별 점수 열(g1…g6)**: LCQ·챔피언십 경기 탭 표(`stageGrid`)와 브래킷 단계 표(`stageTable`)의 '종합'과 '다음' 사이(`gameCols`). 표가 충분히 넓을 때만 보인다(CSS 컨테이너 쿼리 `.gtab`, 720px 이상; 브라우저 폭 800px 미만이면 데이터도 받지 않는다). 일반 경기는 g1~g6 고정(시리즈 게임 수, 안 치른 게임은 '–'), 결승(`key === 'f'`)은 게임이 진행될 때마다 g1부터 하나씩 생긴다. 점수는 공식 API 게임 통계(`/series/{id}/matches` 로 시작한 게임을 알고, `/stats/series/{id}/match/number/{n}` 의 팀별 `points`·`kills`·`placement`)를 그 시리즈를 보고 있을 때만 받는다(`loadGames`, 진행 중이면 `livePollMs` 주기, 진행 중 게임은 머리글에 점·숫자 기울임). 끝난 시리즈는 `localStorage('algskr.gm:<시리즈>')` 에 저장해 다시 받지 않는다(최대 40개). 그 게임 1·2·3위 팀의 점수는 금·은·동 글자색(`.m1 .m2 .m3`, 변수 `--gold --silver --bronze`, 밝은/어두운 모드 각각; 게임 다시보기의 게임 결과 표 종합 점수도 같음, `ptsTd(pts, kills, place)`). 6게임 합계 = 시리즈 종합은 실제 데이터로 확인했다. 진행 중 게임의 응답 모양은 완료된 게임 데이터를 가공해 시험했으므로 실제 LCQ(11-20)에서 확인 필요.
- **구조 개편(11-17)**: 메뉴는 헤더 안(`.tabbar`: 휴대폰은 아래 고정 6칸, PC는 한 줄 7칸, 더보기 없음). 모든 화면은 `render()` 가 맨 앞 `<h1 class="title">` 를 `.ph`(윗줄 `시즌 / 세부 메뉴` + 제목)로 감싸고 그 아래 알약형 세부 메뉴(`.subtabs`, 고정 아님)를 둔다. 새 화면은 본문을 `<h1 class="title">` 로 시작하면 된다. 규칙·문의는 푸터·설정 창.
- 방송 탭: 채널 목록은 카드 격자(PC 5칸, 휴대폰 2칸).
- 성능: 날짜·숫자 포매터 재사용, 같은 내용이면 다시 그리지 않음, 포인트 표 내역은 펼칠 때 생성(`lazy()`).

## 번역

- `site/assets/i18n.js`: 행 `[ko, ja, en]`. 템플릿은 원문 `{n}`/`{t}` → 번역 `{1}`,`{2}`.
- 새 행은 기존 행 옆(예: `['더보기', 'その他', 'More'],` 다음)에 넣고, 기준 줄이 실제로 있는지 꼭 확인한다(없으면 조용히 안 들어간다).
- 동적으로 넣는 화면 조각은 `I.tree(el)` 로 번역한다.

## 검증 습관

- 바꾼 화면은 Playwright 로 휴대폰(320·390)·PC(1280·1440), 한국어·영어·일본어로 확인. 전체 화면 오류 점검(35개 경로)을 돌린다.
- 데이터 로직을 바꿀 때는 바꾸기 전후 모든 화면 HTML 이 같은지 대조한다.
- 작업 공간에서는 공식 API·Liquipedia·Worker 에 직접 접속이 안 된다. 실제 확인은 GitHub Actions 로그(`gh run view --log`)로 한다.

## 남은 일

- 공식 팀 화면 채널(algs1~4)과 경기 중 "중계 보기"·LIVE 표시는 실제 대회(11-20 LCQ)에서 확인 필요.
- LCQ 승자 2R 이후 POI 드래프트 지도(11-20~22 드래프트)는 자동으로 올라오는지 실제 대회에서 확인 필요(승자 1R 로비 A·B 16장은 11-17 에 만들어 둠).
- Americas 2부 4팀(Coughing Baby, Mugs, Niche, RIQON Gaming)은 챌린저 서킷 순위표와 못 맞춰 포인트·선수가 비어 있다.
- LCQ 일정: 11-17 POI 드래프트, 11-20~22 LCQ(지역별 시각 상이), 이후 챔피언십. 경기 중 "중계 보기" 버튼·LIVE 상태는 실제 경기로 아직 확인 못 함.
