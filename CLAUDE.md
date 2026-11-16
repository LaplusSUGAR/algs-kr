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
- Cloudflare 무료 한도(요청당 외부 호출 50회) 때문에 호출 예산을 두고 나눠 갱신한다. 상태는 저장소 항목 하나(`state`)에 담는다. 지금 요청당 약 22~33회.
- Worker 는 60초 지난 결과도 바로 돌려주고 뒤에서 새로 모은다(최대 15분 보관). 사이트는 지난 응답(5분 이내)을 localStorage 에 두고 열자마자 쓴다.
- 채널 목록은 Worker 가 10분마다 다시 읽으므로, 채널 추가는 최대 10분 뒤 반영.

**방송 표출 규칙 (운영자 확정)**
1. 대전제: 선수·코치·스트리머 방송은 **Apex 를 하고 있을 때만** 방송 중으로 친다. Twitch·치지직은 게임(카테고리)으로 판단. YouTube 는 게임 표시가 없어 선수 채널은 그대로, 스트리머·공식 파트너·RAGE 는 제목·태그에 Apex/ALGS 등이 있을 때만.
2. 선수 방송 카드는 지금 고른 보기(한국 관련 / APAC North / 내 응원 팀)에 드는 팀 + 별표한 팀 위주. 나머지는 방송 탭의 접힌 "다른 팀 선수 방송" 목록.
3. 스트리머·전 프로는 보기와 상관없이 항상 표출하되 **프로(선수·코치)보다 뒤**.
4. 순서: 응원 팀 선수 → 공식 중계 → 다른 선수 → 스트리머·전 프로 → 공식 파트너. 홈 "지금 방송 중"은 3칸(파트너 제외).
5. 로스터 변경으로 팀을 나간 사람은 방송 목록에서 자동 제외(예: Re9zq).
6. Twitch 다시보기는 운영자 요청으로 제거했다. 최근 영상은 YouTube 영상·쇼츠만(쇼츠는 따로).

## LCQ 시드 (2026-11 확정 사항)

- 네 지역 모두 확정 시드를 `lcqSeeds` 에 넣었다. APAC North 는 운영자가 준 확정표(11-14 재확정본), 나머지는 공식 사이트 POI 드래프트 선택 순서를 지그재그(A: 1·4·5·8…, B: 2·3·6·7…)로 풀어 적은 것.
- 실제 운영은 로스터 변경(영입 포함)으로 오른 CP 와 2부 팀의 챌린저 시리즈 포인트를 모두 반영했다(규정 3.7.1 문구와 다름). 확정본이 없을 때 사이트는 로스터 반영 CP 로 계산한다.
- 2부 팀 약칭이 프로리그 팀과 겹치면 2부 쪽 약칭을 바꾼다(`lcqShortFix`): GROWGaming→GROW, Burger Boys→BURG, VOID ESPORTS→VE, Aura→AURA2. 같은 대회 안 약칭 중복(EMEA MEOW 두 팀)도 팀 ID 로 구분.

## 화면

- 주 메뉴: 홈·경기·순위·방송·팀 + 더보기(포인트·규칙). 넓은 화면은 7개 한 줄.
- 디자인(11-16 개편, 운영자가 준 Stitch 시안 기준 "택티컬 HUD"): 판은 6px 모서리 + 1px 선, 배지는 4px·대문자·넓은 자간, 제목 앞 빗금(/), 선택된 탭은 강조판 + 아래 2px 빨간 선, 홈 맨 위 "다음 경기" 카드(큰 D-day 숫자, 왼쪽 빨간 막대). 글꼴 Inter + Pretendard. **밝은 모드는 기존 색(밝은 바탕 + 검은 머리 + 빨강)**, **어두운 모드는 시안 색**(바탕 #0B0F15, 판 #141B24, 강조판 #1E2836, 선 #283547, 글자 #ECE9E4 / #8A99AD, 빨강 #DA292A·#FF2A2A, 청록 #00E5FF, 호박 #FFAE00, KR 파랑 #3B82F6). 규칙은 style.css 맨 끝 "2026-11 디자인 개편" 층에 모여 있다.
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

- **[확인 필요] 보기 설정에 따른 선수 방송 카드 거르기.** 운영자가 "안 되는 것 같다"고 함(11-15). 코드상 `liveShown`(site/assets/app.js)은 선수 방송을 `starred(team) || isF(team)` 로 거른다. 모의 데이터 시험에서는 동작했으므로, 실제 화면에서 어느 부분(방송 카드 / 홈 / 선수·코치 채널 목록의 LIVE 표시 / 배지 숫자)이 안 걸러지는지 운영자에게 확인하고 고칠 것. 채널 목록 카드의 LIVE 표시와 메뉴 배지는 보기와 상관없이 전부 세는 점도 확인 대상.
- Americas 2부 4팀(Coughing Baby, Mugs, Niche, RIQON Gaming)은 챌린저 서킷 순위표와 못 맞춰 포인트·선수가 비어 있다.
- 디자인 개편은 홈만 적용. 경기·순위·팀 화면에도 같은 카드·둥근 탭을 넓힐지 운영자 결정 대기.
- LCQ 일정: 11-17 POI 드래프트, 11-20~22 LCQ(지역별 시각 상이), 이후 챔피언십. 경기 중 "중계 보기" 버튼·LIVE 상태는 실제 경기로 아직 확인 못 함.
