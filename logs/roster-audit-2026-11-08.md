# 로스터 전체 점검 (2026-11-08)

공식 API 로스터(사이트 현재 값)를 Liquipedia 팀 페이지 현재 로스터(`raw/lp/squads.json`, 들어온 날·나간 날 포함)와 LCQ 참가 명단(`raw/lp/lcq.json`)에 맞춰 본 결과입니다. 1부 120팀 중 공식 값과 완전히 같은 팀은 12팀이었고, 나머지는 아래처럼 처리했습니다.

## 반영 기준

- **뺌**: 팀 페이지에 나간 날짜가 적혀 있는 선수, 또는 LCQ 명단과 팀 페이지 어디에도 없는 선수, 또는 다른 팀 LCQ 명단에 올라 있는 선수.
- **넣음**: LCQ 명단 주전이거나 팀 페이지에 들어온 날짜가 있는 선수.
- **남김**: LCQ 명단에 아직 주전으로 있으면 팀 페이지와 달라도 남깁니다(아래 '확인 필요').
- **이름만 다른 같은 선수**: 공식 표기를 그대로 둡니다. 바꾸면 그 선수의 CP가 팀 합계에서 빠지기 때문입니다.

## 반영한 변경 (`config/overrides.json` rosterMoves)

| 지역 | 팀 | 뺌 | 넣음 | 근거 |
| --- | --- | --- | --- | --- |
| APAC North | NE | c4lmerq | | 팀 페이지 09-02 이탈 |
| APAC North | FCN | Duckz | | 팀 페이지 09-29 이탈 |
| APAC North | RID0 | Assii | | LCQ·팀 페이지 모두 없음, 출전 기록 없음 |
| APAC North | RRX | Mitarashi | | LCQ·팀 페이지 모두 없음, 출전 기록 없음 |
| APAC North | FNC | kisekiduck | | LCQ·팀 페이지 모두 없음, 출전 기록 없음 |
| APAC North | ALT | Mosh | | LCQ·팀 페이지 모두 없음, 출전 기록 없음 |
| APAC North | UFZ | | NIRU | LCQ 주전 |
| APAC North | 4QUA | RingoOisi7 | Ria, Nekuru | LCQ 주전 (RingoOisi7은 출전 기록 없음) |
| APAC North | XECT | | Mqty (코치) | 팀 페이지 11-03 코치 합류 |
| APAC North | O2 | ibayann (코치) | | 팀 페이지 10-29 이탈 |
| APAC South | DOG → TEC | Killoposz | Killoposz | 팀 페이지 10-26 이적 |
| APAC South | DOG | yanlys (코치) | | 팀 페이지 10-26 이탈 |
| APAC South | TEC | Arm | | LCQ·팀 페이지 모두 없음, 출전 기록 없음 |
| APAC South | GT | CAIGOU | | 팀 페이지 05-30 이탈 (LCQ는 출전 안 함 표시) |
| APAC South | VOID | Swarkst3r | | 팀 페이지 09-17 이탈 (LCQ는 출전 안 함 표시) |
| APAC South | SWQ | Moku | | 팀 페이지 01-18 이탈(코치였음) |
| APAC South | VKG | Lqdud | | 팀 페이지 07-11 은퇴 |
| EMEA | TLNP | Hiarka, Esteves33 | | 팀 페이지 10-19 이탈 |
| EMEA | MIH | Yanzz, Pandaz809 (코치) | | 팀 페이지 10-23, 11-06 이탈 |
| EMEA | RON | arctic, ChaoticMuch | | arctic 팀 페이지 10-03 이탈, ChaoticMuch LCQ·팀 페이지 모두 없음 |
| Americas → EMEA | HEAD → BEN | Zuni | Zuni | Headglytch 09-09 이탈, Ben LCQ 주전 (GB 같은 선수) |
| EMEA | TF | henryojlk | | LCQ·팀 페이지 모두 없음 |
| EMEA | GCR | QPMS | | Nemesis LCQ 명단으로 이동 |
| Americas | VR | Hoplodamus | | VexX 09-21 이탈, EBOYS LCQ 명단에 없음 |
| Americas | NICE | RamBeau | | 팀 페이지 08-06 은퇴 |
| Americas | VEXX | KIMCHI, Unruly (코치) | jugga, sh00k (코치) | KIMCHI LCQ·팀 페이지 없음, 코치 11-04 교체 |
| Americas | WRLD | Winnie | | LCQ·팀 페이지 모두 없음 |
| Americas | URNM | MaliceMamba | | LCQ·팀 페이지 모두 없음 |
| Americas | FWG | Leafays | | riqon gaming LCQ 명단으로 이동 |
| Americas | PRES | Charmander | | riqon gaming LCQ 명단으로 이동 |
| Americas | SHIN | MikeJitsu, ImEurusk, khenzo | | 각각 Undecided·Aura·Above All LCQ 명단으로 이동 (해체) |

자동 반영 되돌림 (`rosterAutoIgnore`): ECL Mysi, FURY Lochchan. 두 팀의 LCQ 명단이 2명뿐이라 빠진 것처럼 보였지만 팀 페이지에는 현재 선수로 있습니다.

## 코치·운영진 표시 (`config/players.json` role)

공식 API에 선수로 올라 있지만 팀 페이지에서 코치·운영진인 사람(출전 기록 없음): ladypexi(GG), Bowzey(FFUN), dsblf(TOP), Ixren(MAJN), wabu(RC), Kontyan(LTX), Raygh(NFX), 1ron(KNC), Chanriyo(RIG), Vulcan300(RR), SYACHI(FL), MUSCLE(RID1), Fzr(RLZ), Anemone(MTR), Panayie(RRQ), Rogers(S8UL), Kapreme(TL), Raven(NIP), Don(SR), Talmadge(JDG), Android Dream(NRG), hannzi(7VEN). 직함 표시: Shohei(SRL)·xinhai(KRS) 애널리스트, PENGERION(UNL) 대표.

## 확인 필요 (바꾸지 않음)

- **팀 페이지는 이탈, LCQ 명단은 아직 주전**: ALX Razi·R33P3S (09-30, spades는 CPR로 자동 반영됨).
- **11-09 추가**: MTR Maron 이탈, Lible Ace 합류 (Meteor 공식 X 발표, 11-09 18:00 KST). Lible Ace의 CP 38은 Meteor 팀 CP로 옮겨 계산.
- **팀 이름**: URNM(Unreal Nightmare) 로스터가 10-17 Flat으로 옮겼고 LCQ 명단도 Flat. 공식 이름은 아직 Unreal Nightmare.
- **LCQ에만 근거가 있는 차이** (팀 페이지 없음): D4C Faenex, RDG Salvatorez, UBI Aviisan, 3MEN tyhr, DKF DROPPED·Jxmo, TECA KBBLANK(서브 Wang) — 공식 값 유지.
- **LCQ에만 있는 추가 선수**: SO Brick(4번째 주전). 서브 RLZ inkya, NE kota, TEC Honeypie는 넣지 않음(자동 반영 규칙과 같음).
- **출전 기록 없는 등록 선수** (직행 팀, 팀 페이지에 없음): ZETA Yamato, AURA NINEimpulse, FLCN iiTzTimmy, GK lou, AG StryderEz, DINO Orsini, GEN TEMPPLEX — 공식 값 유지.

## 이름만 다른 같은 선수 (공식 표기 유지)

VSN Zachmazer=Zach, TL PanicApex=Panic, RRQ EzFlashKIDZ=EzFlash, AG jaguares1=Jaguares, WGR Lykq8don=Lykq, VKG JonnyR=JR, FFUN Tylerfps=Tyler, NRG Sweet=sweetdreams, DCG ShaoChieh=ShaoJie, DINO Djkilla=Dj, TOP ozzzus7=7ozzzus, WAR ihtw-www-=Rename, 7VEN W-L-A2=Walking L, KN Kan0n=Kanon, DOG GOPGAPz=G0PGAP, NICE Codddy=Cody, O2 wasaKINGTTV=wasaKING, FL sumiyoshi=Sumiyoshii, PXL 3TrixX=TrixX, SO9 rondonstreams=rondon, MAMA Sacto33=Sacto, FURY Noble=Noobles, JDG Naughty=StayNaughty, BH xxfps=XX, TECB WWUUZZII=Wuzi, SH CalamityVX=Calamitous, RIG ReyzyGG=Reyzy, RRX ImNaoki=Naoki, KRS Cumulonimbus=Return, TBSU Rchwerht=Rchwert, GT OWOWOWOWOWOOWO=OWO.
추정(교체일 수도 있음): WOL 000=GuGu, SWQ Lzoho=GuoZi, FCN chikochandao=Tico, ORG Max Verstappen=跳跳loveJK.

다시 점검하려면 Actions에서 build를 `refresh=squads`로 실행한 뒤 같은 기준으로 비교합니다.
