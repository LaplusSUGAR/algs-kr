# EASY ALGS KR

배포 주소(Pages 활성화 후): https://laplussugar.github.io/algs-kr/

ALGS(Apex Legends Global Series) 결과를 한국 팀 중심으로 보여주는 비공식 팬 사이트입니다. OWticker와 같은 규격(모바일 우선 480px, 하단 탭, 정적 호스팅 + 데이터 파일 1개 + 버전 폴링)으로 만들었습니다.

## 화면

| 경로 | 내용 |
| --- | --- |
| `#/` | 한국 팀 카드, CP 순위 위의 한국 팀 위치, 한국 선수 소속 팀, 진행 중 국제전 요약, 다가오는 경기, 시즌 일정 |
| `#/schedule` | 예정/결과, 한국 팀 경기만 보기, 시리즈별 1위와 한국 팀 결과, 국제전 전체 결과 |
| `#/standings` | 진행 중 국제전 단계 순위와 진출선 |
| `#/points/cp` | 챔피언십 포인트 (팀/선수, 지역 필터, 32위 직행선, 합산 선수 펼치기) |
| `#/points/pl` | 지역별 프로리그 포인트 (Split 1/2, 최종/정규 시즌 정렬, 진출선) |
| `#/teams`, `#/teams/E36` | 팀 목록·검색, 팀 상세 (로스터 국적, 시즌 성적, 경기 결과, 선수 방송) |
| `#/streams` | ALGS 멀티뷰 소개·링크, 영어(PlayApex)·일본어(RAGE) 공식 중계, 공식 파트너 워치 파티, 한국 선수 개인 방송(Twitch·CHZZK·YouTube·SOOP) |

설정: 다크 모드, 결과 가리기(스포일러 방지), 표에서 한국 팀만 보기.

표기 규칙
- 점수표는 모두 **순위 점수 / 킬 점수 / 종합 점수** 순서로 적는다 (킬 1개 = 1점이라 순위 점수 = 종합 − 킬). 새 표도 `app.js`의 `PTS_TH`·`ptsTd`·`ptsLine`·`ptsTrio`를 쓴다. 프로리그 포인트(시리즈 순위마다 받는 리그 포인트)는 나뉘지 않으므로 예외.
- 시각은 모두 24시간제 `HH:mm` (`hhmm`).

## 데이터 흐름

```
fetch-liquipedia.mjs  → raw/lp/        (1순위, API 키 필요)
fetch-algs.mjs        → raw/algs/      (공식 API: CP, 국적, 경기별 결과)
fetch-battlefy.mjs    → raw/battlefy/  (Challenger Circuit)
build-data.mjs        → site/data/algs-data.js + ver.json
브라우저 실시간 조회    → 경기 중 진행 중인 시리즈만 공식 API에서 10초(+0~3초)마다 직접 확인
worker/live-worker.js → /live.json     (선택: 방문자가 많아지면 서버 한 곳에서 조회하도록 전환)
```

## 갱신 주기

| 구분 | 주기 | 방식 |
| --- | --- | --- |
| 경기 중 점수 | 약 10초 | 브라우저가 진행 중인 시리즈만 공식 API에서 직접 확인. 탭을 보고 있을 때만 동작. "비공식 실시간"으로 표시 |
| 경기 종료 직후 | 10초 안 | 같은 조회에서 시리즈 종료를 감지해 "비공식 집계"로 표시 |
| 확정 데이터 | 5분 | GitHub Actions 예약 빌드 (예약 실행은 몇 분 늦어질 수 있음). 데이터가 바뀐 경우에만 커밋·배포 |
| 화면 반영 | 30초 | 브라우저가 `ver.json`만 확인하다가 바뀌면 데이터 파일을 다시 받음 |

화면 오른쪽 위 표시(예: "실시간 · 3초 전", "5분 갱신 · 01:51")를 누르면 갱신 주기와 현재 상태가 나옵니다. 실시간 방식은 `site/assets/config.js`의 `liveMode`로 바꿉니다 (`direct` 기본, `worker`, `off`).

우선순위: 순위·결과·로스터는 Liquipedia가 우선이고, 값이 다르면 `conflicts`에 남깁니다. 챔피언십 포인트는 공식 값, 한국 판별은 공식 API의 선수 국적을 씁니다. 수동 보정은 `config/overrides.json`.

한국 판별 기준: 현재 로스터에서 코치를 뺀 한국 국적 선수가 2명 이상이면 "한국 팀", 1명이면 "한국 선수 소속 팀".

## 실행

```bash
npm run build      # raw/ 에 있는 데이터로 site/data 생성 (네트워크 불필요)
npm run serve      # http://localhost:5173
npm run all        # 세 출처 수집 후 빌드
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
