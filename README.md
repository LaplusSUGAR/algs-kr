# EASY ALGS KR

배포 주소(Pages 활성화 후): https://laplussugar.github.io/algs-kr/

ALGS(Apex Legends Global Series) 결과를 한국 팀 중심으로 보여주는 비공식 팬 사이트입니다. OWticker와 같은 규격(모바일 우선 480px, 하단 탭, 정적 호스팅 + 데이터 파일 1개 + 버전 폴링)으로 만들었습니다.

## 화면

| 경로 | 내용 |
| --- | --- |
| `#/` | 한국 팀 카드, CP 순위 위의 한국 팀 위치, 한국 선수 소속 팀, 진행 중 국제전 요약, 다가오는 경기, 시즌 일정 |
| `#/schedule` | 예정/결과, 한국 팀 경기만 보기, 시리즈별 1위와 한국 팀 결과, 국제전 전체 결과 |
| `#/standings` | 진행 중 국제전 단계 순위와 진출선, LCQ(지역별 · 경기별 탭), `#/standings/champs` 챔피언십(조 편성 · 조별 리그 6경기 · 조별 순위 · 브래킷 · 결승 탭, 앞 단계 결과로 다음 단계 칸 자동 배정) |
| `#/points/cp` | 챔피언십 포인트 (팀/선수, 지역 필터, 32위 직행선, 합산 선수 펼치기) |
| `#/points/pl` | 지역별 프로리그 포인트 (Split 1/2, 최종/정규 시즌 정렬, 진출선) |
| `#/teams`, `#/teams/E36` | 팀 목록·검색, 팀 상세 (로스터 국적, 시즌 성적, 경기 결과, 선수 방송) |
| `#/streams` | ALGS 멀티뷰 소개·링크, 영어(PlayApex)·일본어(RAGE) 공식 중계, 공식 파트너 워치 파티, 한국 선수 개인 방송(Twitch·CHZZK·YouTube·SOOP) |

설정: 다크 모드, 결과 가리기(스포일러 방지), 표에서 한국 팀만 보기.

표기 규칙
- 점수표는 모두 **순위 / 킬 / 종합**(순위 점수 / 킬 점수 / 종합 점수) 세 칸으로 적고, 등수 칸은 `#`로 쓴다 (킬 1개 = 1점이라 순위 점수 = 종합 − 킬). 새 표도 `app.js`의 `PTS_TH`·`ptsTd`·`ptsLine`을 쓴다. 프로리그 포인트(시리즈 순위마다 받는 리그 포인트)는 나뉘지 않으므로 예외.
- 시각은 모두 24시간제 `HH:mm` (`hhmm`).
- 로스터 변경 자동 확인(`scripts/rosters.mjs`, 빌드마다): 공식 API 로스터 변경을 기록하고, Liquipedia LCQ 참가 명단에 먼저 올라온 이동(같은 지역 공식 선수의 이적, 확인 시작 뒤 새로 생긴 차이)은 팀 로스터·팀 CP에 자동 반영한다. 공식 로스터가 같아지면 자동 반영을 거둔다. 기록은 `logs/roster-changes.md`(처음부터 달랐던 명단은 아래 '확인용' 표), 사이트 팀 탭 '로스터 변경', 상태는 `raw/rosters/state.json`.
- 로스터 최신화 점검: Actions의 build를 `refresh=squads`로 실행하면 Liquipedia 팀 페이지 로스터를 지금 받는다(`refresh=1`은 팀 표·LCQ 명단까지 모두). 공식 로스터와 다른 점 중 팀 페이지에 나간 날짜가 있거나 LCQ 명단·팀 페이지 둘 다에 없는 선수는 `config/overrides.json`의 `rosterMoves`로, 공식 API에 선수로 올라 있지만 팀 페이지에서 코치·운영진인 사람은 `config/players.json`의 `role`(필요하면 `title`)로 고친다. 이름 표기만 다른 같은 선수(예: W-L-A2 = Walking L)는 공식 표기를 그대로 둔다(바꾸면 그 선수의 CP가 빠진다).
- LCQ 시각: 공식 API가 네 지역에 똑같은 임시 시각을 넣어 두면 `config/overrides.json`의 `lcqSchedule`로 지역별 시각을 보정한다(빌드 단계). 공식 값이 지역마다 달라지면 자동으로 공식 값을 쓴다.

## 데이터 흐름

```
fetch-liquipedia.mjs  → raw/lp/        (1순위, API 키 필요)
fetch-algs.mjs        → raw/algs/      (공식 API: 메인 시즌 고르기, CP, 국적, 경기별 결과. 요청은 3개씩 동시에, 끝난 지 하루 넘은 시리즈·로고는 매시 한 번만 다시 받음)
fetch-lcq-lp.mjs      → raw/lp/lcq.json        (Liquipedia 위키 원문: LCQ 참가 명단, Challenger Circuit 순위)
fetch-lp-teams.mjs    → raw/lp/teams-src.json  (Liquipedia 팀 표: 팀·선수·로고 아이콘)
fetch-lp-squads.mjs   → raw/lp/squads.json     (Liquipedia 팀 페이지 현재 로스터·들어온 날·나간 날, 선수 페이지 넘겨주기. 7일에 1회)
logos.mjs             → site/logos/t/  (팀 로고 64·160px WebP)
build-data.mjs        → site/data/algs-data.js + ver.json (26자 공식 ID는 표 `_u`의 번호로 줄여 냄 → app.js `unpack`이 되돌림)
브라우저 실시간 조회    → 경기 중 진행 중인 시리즈만 공식 API에서 10초(+0~3초)마다 직접 확인
worker/live-worker.js → /live.json     (선택: 방문자가 많아지면 서버 한 곳에서 조회하도록 전환)
```

## 공식 규정 (규칙 파일)

`config/rules/<시즌>.json`은 공식 규정에서 사이트 로직에 필요한 규칙을 뽑아 적은 파일이고, 빌드의 기준이다(조항 번호는 `_ref`). 규칙과 로직의 대조표는 `docs/rules-year-6.md`.

- 빌드가 읽는 값: 점수표(게임·프로리그 포인트·CP), 챔피언십 직행 32·LCQ 8 자리, LCQ 지역별 일정(부록 D4), 직행 확정 대회.
- 직행 확정: 마지막 플레이오프가 끝나면 공식 CP 상위 32팀을 고정한다(`meta.cpLock`). 그 뒤의 로스터 변경은 시드에만 반영된다.
- LCQ 시각: 공식 API 값이 태평양 시간 임시값이거나 앞 단계보다 이르면 규정의 지역 현지 시각으로 표시한다. 손으로 정하려면 `config/overrides.json`의 `lcqSchedule`.
- 검사: `node scripts/check-rules.mjs` (매 빌드 실행). 실제 지급된 CP, 프로리그 팀 수, LCQ 단계 구성이 규칙 파일과 다르면 `[rules] 경고`를 남긴다.
- 새 시즌: 규칙 파일이 없으면 가장 최근 시즌 것을 쓰고 규칙 탭에 지난 시즌 규정 기준이라고 안내한다.

## 시즌 전환 (자동)

사이트는 한 번에 한 시즌(메인 시즌)을 보여 주고, 메인 시즌은 공식 API의 시즌 목록에서 스스로 고른다(`scripts/season.mjs`).

- 고르는 규칙: 프로리그 일정이 있는 시즌 가운데 첫 프로리그 시작 14일 전을 지난 가장 늦은 시즌. 그 시즌의 프로리그 팀·로스터가 아직 없으면(한 지역 20팀 미만) 지난 시즌을 그대로 둔다.
- 챔피언십이 끝나면: 순위 탭 기본 화면이 챔피언십 최종 결과가 되고, 홈 맨 위에 시즌 결과(우승·준우승·3위·관심 팀 순위)가 남는다. 새 시즌이 공식 목록에 보이면 '다음 시즌' 첫 일정을 함께 보여 준다.
- 메인 시즌이 바뀌는 순간: 지난 시즌의 원본·설정·기록을 `archive/<시즌>/`에 복사하고, 마지막 화면 데이터를 `site/data/seasons/<시즌>.js`로 얼린다. 주소에 `?y=year-6`을 붙이면 그 시즌 화면이 그대로 열린다(홈의 '지난 시즌' 링크). 시즌에 묶인 작업 파일(`raw/lp/*.json`, `raw/rosters/state.json`, 출전 경기 수, 로스터 변경 기록)은 비우고 새로 시작한다.
- 시즌에 묶인 설정은 그 시즌에만 쓴다: `config/season.json`은 `slug`가 메인 시즌과 같을 때만 이름·일정표 장소·규정 링크를 쓰고, 다르면 일정표를 공식 대회 목록에서 만든다(날짜·이름·공식 링크). `config/overrides.json`은 `season`이 같을 때만 로스터 이동·대체 출전·LCQ 시각 보정·2부 팀 이름 변경을 쓴다. 점수표·방송·직행 자리 수는 그대로 쓰므로 새 시즌 규정이 바뀌면 고친다.
- Split도 스스로 넘어간다: 시작 14일 전을 지난 가장 늦은 Split을 최신으로 쓰고(출전 팀 명단이 아직 없으면 앞 Split 유지), CP 순위·동률 기준·프로리그 일정·Liquipedia 페이지 이름(`Apex_Legends_Global_Series/<연도>/Split_<n>/…`)이 그 Split을 따른다.
- 강제로 고르기: 저장소 Settings → Variables에 `ALGS_SEASON = year-6`(시즌 slug). 전환 시점을 바꾸려면 `ALGS_SEASON_LEAD_DAYS`(기본 14).

## 갱신 주기

| 구분 | 주기 | 방식 |
| --- | --- | --- |
| 경기 중 점수 | 약 10초 | 브라우저가 진행 중인 시리즈만 공식 API에서 직접 확인. 탭을 보고 있을 때만 동작. "비공식 실시간"으로 표시 |
| 경기 종료 직후 | 10초 안 | 같은 조회에서 시리즈 종료를 감지해 "비공식 집계"로 표시 |
| 확정 데이터 | 약 5분 | GitHub Actions 빌드가 끝날 때마다 다음 실행을 직접 거는 이어 달리기(예약 실행은 예비). 데이터가 바뀐 경우에만 커밋·배포 |
| 화면 반영 | 30초 | 브라우저가 `ver.json`만 확인하다가 바뀌면 데이터 파일을 다시 받음. 탭을 숨기면 쉬고, 다시 보면 바로 확인 |

화면 오른쪽 위 표시(예: "실시간 · 3초 전", "5분 갱신 · 01:51")를 누르면 갱신 주기와 현재 상태가 나옵니다. 실시간 방식은 `site/assets/config.js`의 `liveMode`로 바꿉니다 (`direct` 기본, `worker`, `off`).

우선순위: 순위·결과·로스터는 Liquipedia가 우선이고, 값이 다르면 `conflicts`에 남깁니다. 챔피언십 포인트는 공식 값, 한국 판별은 공식 API의 선수 국적을 씁니다. 수동 보정은 `config/overrides.json`.

한국 판별 기준: 현재 로스터에서 코치를 뺀 한국 국적 선수가 2명 이상이면 "한국 팀", 1명이면 "한국 선수 소속 팀".

## 실행

```bash
npm run build      # raw/ 에 있는 데이터로 site/data 생성 (네트워크 불필요)
npm run serve      # http://localhost:5173
npm run all        # 공식 API·Liquipedia 수집 후 빌드 (LCQ·로고 수집은 build.yml 순서 참고)
```

`raw/algs/snapshot.json`에는 2026-11-01 01:00 KST에 공식 API에서 받은 실제 데이터가 들어 있어 바로 실행해 볼 수 있습니다.

## 배포

1. **사이트**: GitHub 저장소에 올리고 Settings → Pages에서 Source를 GitHub Actions로 설정합니다. `.github/workflows/build.yml`이 30분마다 수집·빌드·배포합니다. Cloudflare Pages를 써도 됩니다 (`site/` 폴더 배포).
2. **Liquipedia**: https://liquipedia.net/api 에서 API 키를 받아 저장소 Secrets에 `LIQUIPEDIA_API_KEY`로 넣습니다. 키가 없으면 공식 API 값으로만 빌드됩니다.
3. **실시간 Worker**: `worker/wrangler.toml`의 `ALLOWED_ORIGIN`을 사이트 주소로 바꾸고 `npm run worker:deploy`. 나온 주소 + `/live.json`을 `site/assets/config.js`의 `liveUrl`에 넣습니다. Cloudflare Workers·Durable Objects의 무료 한도와 요금은 배포 전에 확인하세요.

## 구현 전 확인할 것

- `fetch-liquipedia.mjs`는 LPDB API v3 기준으로 작성했지만 키가 없어 실제 호출은 확인하지 못했습니다. 엔드포인트, 필드 이름, 대회 페이지 이름을 Liquipedia API 문서로 확인하세요.
- 공식 API(`prod-api.algstools.com`)는 공개 문서가 없는 내부 API입니다. 형식이 바뀌면 수집이 실패하고, 빌드는 이전 스냅샷으로 계속됩니다. 요청 간격을 지키고 식별 가능한 User-Agent(`ALGS_KR_UA` 환경 변수)를 쓰세요.
- `config/season.json`의 플레이오프 15위 이하 CP 배점은 규정집 원문으로 채워야 합니다.
- 한국어 중계 채널은 `config/season.json`의 `broadcasts`에 `{"key":"ko","label":"한국어 중계","note":"…","links":[["CHZZK","https://…"]]}` 형태로 넣으면 방송 탭에 나옵니다.
- 선수 CHZZK·YouTube·SOOP 채널은 공식 API에 없습니다. Liquipedia API 키를 넣으면 선수 페이지 링크에서 자동으로 채워지고, 직접 넣으려면 `config/players.json`에 URL을 적습니다.
- 방송 탭의 멀티뷰 그림(`site/assets/multiview.svg`)은 화면 구성을 설명하는 자체 제작 그림입니다. 공식 스크린샷을 쓰려면 사용 허락을 받은 이미지로 바꾸세요.
- 팀 로고는 넣지 않았습니다. 쓰려면 팀별 사용 허락을 받은 이미지를 `site/assets/logos/`에 두세요.

## 출처 표기

Liquipedia 데이터는 CC-BY-SA 3.0입니다. 화면 하단에 출처가 표시됩니다. 이 사이트는 EA·Respawn과 관련이 없습니다.
