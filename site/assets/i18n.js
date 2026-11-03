// 언어 설정: 한국어(원문) · 日本語 · English
// 화면은 한국어로 그린 뒤, 언어가 한국어가 아니면 보이는 문구(글자·title·aria-label·placeholder)를 이 사전으로 바꾼다.
// 기능 코드는 그대로 두고 말만 바꾸므로, 새 문구를 넣으면 여기에 한 줄 추가하면 된다.
//
// 사전 한 줄: [한국어, 日本語, English]
//   {n} 숫자, {x} 아무 글자(다시 번역함), {t} 아무 글자(이름 등, 그대로 둠), {w} 띄어쓰기 없는 한 낱말(그대로 둠)
//   {x}{t}는 ' · ' ' / '를 넘지 않는다 (그런 문장은 조각으로 나눠 번역). 틀은 고정 글자가 긴 것부터 맞춰 본다
//   번역문에서는 {1} {2}… 로 순서대로 받고, {1o}는 영어 서수(1st, 2nd…)
// 찾는 순서: 문구 그대로 → 틀 → ' · ' ', ' 등으로 나눠 조각마다 → 낱말
(function () {
  const LANGS = {
    ko: { brand: 'EASY ALGS KR', name: '한국어', html: 'ko', tz: 'KST', title: '비공식 팬 사이트', desc: 'ALGS 한국 팀 순위, 경기 일정·결과, 프로리그 포인트, 챔피언십 포인트를 한눈에.' },
    ja: { brand: 'EASY ALGS JP', name: '日本語', html: 'ja', tz: 'JST', title: '非公式ファンサイト', desc: 'ALGSの順位・試合日程と結果・プロリーグポイント・チャンピオンシップポイントをひと目で。' },
    en: { brand: 'EASY ALGS EN', name: 'English', html: 'en', tz: 'KST', title: 'Unofficial fan site', desc: 'ALGS standings, schedule and results, Pro League points and Championship Points at a glance.' },
  };
  const KEY = 'algskr.lang';
  function detect() {
    try {
      const q = new URLSearchParams(location.search).get('lang');
      if (LANGS[q]) { localStorage.setItem(KEY, JSON.stringify(q)); return q; }
      const s = JSON.parse(localStorage.getItem(KEY));
      if (LANGS[s]) return s;
    } catch {}
    const n = String((navigator.languages && navigator.languages[0]) || navigator.language || 'ko').toLowerCase();
    return n.startsWith('ko') ? 'ko' : n.startsWith('ja') ? 'ja' : 'en';
  }
  const lang = detect();
  const L = LANGS[lang];
  const HANGUL = /[가-힣]/;
  const ord = (s) => { const n = parseInt(String(s).replace(/,/g, ''), 10); if (!Number.isFinite(n)) return s; const v = n % 100; return n + (v >= 11 && v <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'); };

  // ---------------- 사전 ----------------
  const D = [
    // 메뉴·공통
    ['홈', 'ホーム', 'Home'], ['경기', '試合', 'Matches'], ['순위', '順位', 'Standings'], ['포인트', 'ポイント', 'Points'], ['팀', 'チーム', 'Team'], ['방송', '配信', 'Streams'], ['규칙', 'ルール', 'Rules'],
    ['본문 바로가기', '本文へ移動', 'Skip to content'], ['주 메뉴', 'メインメニュー', 'Main menu'], ['세부 메뉴', 'サブメニュー', 'Sub menu'],
    ['갱신 주기 보기', '更新間隔を見る', 'Update interval'], ['문의·피드백', 'お問い合わせ・フィードバック', 'Feedback'], ['설정 열기', '設定を開く', 'Open settings'],
    ['정기 갱신', '定期更新', 'Scheduled'], ['설정', '設定', 'Settings'], ['닫기', '閉じる', 'Close'], ['다크 모드', 'ダークモード', 'Dark mode'],
    ['결과 가리기 (스포일러 방지)', '結果を隠す（ネタバレ防止）', 'Hide results (no spoilers)'],
    ['점수·순위·진출 결과를 가리고, 대회별로 눌러서 공개합니다', 'スコア・順位・進出結果を隠し、大会ごとにタップで表示します', 'Hides scores, standings and advancement; reveal per event with a tap'],
    ['표에서 관심 팀만 보기', '表で注目チームだけ表示', 'Show only focus teams in tables'],
    ['보기 모드(한국 팀 · APAC North · 내 응원 팀)의 팀만', '表示モード（韓国チーム・APAC North・応援チーム）のチームのみ', 'Only teams of the view mode (Korean teams · APAC North · My teams)'],
    ['갱신 주기', '更新間隔', 'Update interval'], ['데이터 출처', 'データ出典', 'Data sources'], ['언어 · Language', '言語 · Language', 'Language'],
    ['비공식 팬 사이트입니다. EA·Respawn과 관련이 없습니다.', '非公式ファンサイトです。EA・Respawnとは関係ありません。', 'Unofficial fan site. Not affiliated with EA or Respawn.'],
    ['데이터:', 'データ:', 'Data:'], ['ALGS 공식', 'ALGS公式', 'ALGS official'], ['문의·피드백 보내기', 'お問い合わせ・フィードバックを送る', 'Send feedback'],
    ['무엇에 대한 내용인가요? 고르면 작성 화면이 새 창으로 열리고, 지금 보던 화면 주소가 미리 채워집니다. 개인 정보는 넣지 마세요.', '内容を選んでください。新しいウィンドウで作成画面が開き、今見ている画面のアドレスが入力されます。個人情報は書かないでください。', 'What is it about? Picking one opens a form in a new window with this page’s address filled in. Please don’t include personal information.'],
    ['데이터 오류', 'データの誤り', 'Data error'], ['순위·점수·로스터가 틀렸어요', '順位・スコア・ロスターが違います', 'Standings, scores or rosters are wrong'],
    ['채널 제보', 'チャンネル情報', 'Channel info'], ['선수 CHZZK·YouTube 주소를 알려 줄게요', '選手のCHZZK・YouTubeを教えます', 'Share a player’s CHZZK/YouTube channel'],
    ['기능 제안', '機能の提案', 'Feature idea'], ['이런 기능이 있으면 좋겠어요', 'こんな機能がほしい', 'I’d like this feature'], ['기타 문의', 'その他', 'Other'], ['그 밖의 이야기', 'その他のお問い合わせ', 'Anything else'],
    ['자세히 보기', '詳しく見る', 'More'], ['자세히', '詳しく', 'Details'], ['전체', 'すべて', 'All'], ['전체 보기', 'すべて見る', 'See all'], ['다음', '次', 'Next'], ['종료', '終了', 'Done'], ['결과', '結果', 'Result'], ['점수', 'スコア', 'Score'], ['킬', 'キル', 'Kills'], ['게임', '試合', 'Games'], ['선수', '選手', 'Player'], ['대회', '大会', 'Event'], ['상태', '状態', 'Status'], ['최대', '最大', 'Max'], ['미정', '未定', 'TBD'], ['확정', '確定', 'Final'], ['우승', '優勝', 'Win'], ['탈락', '敗退', 'Out'], ['코치', 'コーチ', 'Coach'], ['조', '組', 'Grp'], ['지역', '地域', 'Region'], ['화면', '表示', 'View'], ['단위', '単位', 'Unit'], ['스플릿', 'スプリット', 'Split'], ['근거', '根拠', 'Basis'], ['응원', '応援', 'Fav'], ['한국', '韓国', 'KR'], ['계', '系', 'KR'], ['지금', '現在', 'Now'], ['최소', '最低', 'min'], ['직행', '直行', 'Direct'], ['직행권', '直行', 'Direct'], ['동률', '同点', 'Tied'], ['영상', '動画', 'Videos'], ['온라인', 'オンライン', 'Online'], ['국제전', '国際大会', 'International'], ['브래킷', 'ブラケット', 'Bracket'], ['결승', '決勝', 'Finals'], ['조별 리그', 'グループステージ', 'Group stage'], ['승자조', 'ウィナーズ', 'Winners'], ['패자조', 'エリミネーション', 'Elimination'], ['승자 라운드', 'ウィナーズラウンド', 'Winners Round'], ['리전 결승', 'リージョナルファイナル', 'Regional Finals'], ['서바이벌 스테이지', 'サバイバルステージ', 'Survival Stage'], ['매치 포인트', 'マッチポイント', 'Match point'], ['매치 포인트 결승', 'マッチポイント決勝', 'Match Point Finals'], ['정규 시즌', 'レギュラーシーズン', 'Regular season'], ['프로리그', 'プロリーグ', 'Pro League'], ['플레이오프', 'プレイオフ', 'Playoffs'], ['챔피언십', 'チャンピオンシップ', 'Championship'], ['챔피언십 포인트', 'チャンピオンシップポイント', 'Championship Points'], ['다음 단계', '次のステージ', 'Next stage'], ['결승 진출', '決勝進出', 'To Finals'], ['결승 직행', '決勝直行', 'Straight to Finals'], ['정산', '試算', 'Projected'], ['대회 전', '大会前', 'Before'], ['미출전', '不出場', 'DNP'], ['반영 대기', '反映待ち', 'Pending'], ['제외', '除外', 'excluded'], ['정규', 'レギュラー', 'Reg.'], ['최종', '最終', 'Final'], ['정규 점수', 'レギュラー得点', 'Reg. pts'], ['CP/인', 'CP/人', 'CP/player'], ['점수 계산', 'スコア計算', 'Scoring'], ['합산 제외', '合算対象外', 'Not counted'], ['현재 기준', '現時点', 'Current'], ['진행 중', '進行中', 'Live'], ['시작 대기', '開始待ち', 'Starting soon'], ['일정 미정', '日程未定', 'TBD'], ['확인 중', '確認中', 'checking'], ['실시간', 'ライブ', 'Live'], ['경기 대기', '試合待ち', 'Waiting'], ['실시간 준비', 'ライブ準備中', 'live ready'], ['한 단계 뒤로', '1つ戻る', 'Step back'], ['한 단계 앞으로', '1つ進む', 'Step forward'], ['끝으로', '最後へ', 'To end'], ['재생', '再生', 'Play'], ['생존', '生存', 'alive'], ['챔피언', 'チャンピオン', 'Champion'], ['게임 종료', '試合終了', 'Game over'],
    ['2부', '2部', 'T2'], ['2부 리그(챌린저 서킷) 팀', '2部（チャレンジャーサーキット）チーム', 'Tier 2 (Challenger Circuit) team'],
    // 보기 모드
    ['보기 모드', '表示モード', 'View mode'], ['한국 팀', '韓国チーム', 'Korean teams'], ['내 응원 팀', '応援チーム', 'My teams'], ['한국 관련', '韓国関連', 'Korea-related'], ['한국 관련 팀', '韓国関連チーム', 'Korea-related teams'], ['내 응원 팀 팀', '応援チーム', 'my teams'], ['APAC North 팀 팀', 'APAC Northチーム', 'APAC North teams'], ['한국 선수·코치 팀', '韓国人選手・コーチのチーム', 'Teams with KR players/coaches'], ['APAC North 팀', 'APAC Northチーム', 'APAC North teams'], ['한국 팀 경기만', '韓国チームの試合のみ', 'Korean teams only'], ['APAC North 경기만', 'APAC Northの試合のみ', 'APAC North only'], ['응원 팀 경기만', '応援チームの試合のみ', 'My teams only'], ['한국 관련 팀 없음', '韓国関連チームなし', 'No Korea-related teams'], ['APAC North 팀 없음', 'APAC Northチームなし', 'No APAC North teams'], ['응원 팀 없음', '応援チームなし', 'No teams picked'],
    ['한국 선수 소속', '韓国人選手所属', 'Has a KR player'], ['한국 코치 팀', '韓国人コーチのチーム', 'KR coach team'],
    ['한국 팀 (한국 선수 {n}명 이상)', '韓国チーム（韓国人選手{1}人以上）', 'Korean team ({1}+ KR players)'], ['한국 선수 소속 ({n}명)', '韓国人選手所属（{1}人）', 'Has a KR player ({1})'], ['한국 코치 팀 (선수 없이 코치만)', '韓国人コーチのチーム（選手なし・コーチのみ）', 'KR coach team (coach only)'],
    ['응원 팀 고르기', '応援チームを選ぶ', 'Pick teams'], ['응원 팀 바꾸기', '応援チームを変更', 'Change teams'], ['☆ 응원하기', '☆ 応援する', '☆ Follow'], ['★ 응원 중', '★ 応援中', '★ Following'], ['대표 팀으로', 'メインチームにする', 'Make main'], ['대표 팀', 'メイン', 'Main'], ['★ 대표 응원 팀', '★ メイン応援チーム', '★ Main team'], ['대표 응원 팀', 'メイン応援チーム', 'Main team'], ['모두 지우기', 'すべて解除', 'Clear all'], ['홈 맨 위 큰 카드와 표 강조가 이 팀 기준이 됩니다', 'ホームの大きなカードと表の強調がこのチーム基準になります', 'Home’s big card and table highlights follow this team'], ['홈에서 보기', 'ホームで見る', 'View on Home'], ['팀 찾기', 'チームを探す', 'Find a team'], ['팀 선택.', 'チームを選択中。', 'teams picked.'],
    ["응원하고 싶은 팀을 누르세요. 고른 팀은 이 브라우저에 저장되고, '내 응원 팀' 모드에서 홈·표·경기가 이 팀들 위주로 바뀝니다. 지금", 'チームをタップして応援チームに追加します。選んだチームはこのブラウザに保存され、「応援チーム」モードでホーム・表・試合がこれらのチーム中心になります。現在', 'Tap teams to follow. Picks are saved in this browser, and “My teams” mode centres Home, tables and matches on them. Now'],
    ['내 응원 팀 {n}', '応援チーム {1}', 'My teams {1}'], ['한국 {n}', '韓国 {1}', 'KR {1}'], ['응원 {n}', '応援 {1}', 'Fav {1}'],
    ['상위 {n}팀과 한국 관련 팀 표', '上位{1}チームと韓国関連チームを表示', 'Top {1} plus Korea-related teams'], ['상위 {n}팀과 APAC North 팀 표', '上位{1}チームとAPAC Northチームを表示', 'Top {1} plus APAC North teams'], ['상위 {n}팀과 내 응원 팀 팀 표', '上位{1}チームと応援チームを表示', 'Top {1} plus my teams'],
    // 홈
    ['다가오는 경기', '今後の試合', 'Upcoming'], ['경기 전체', 'すべての試合', 'All matches'], ['지금 순위', '現在の順位', 'Current standings'], ['진출 구조', '進出の流れ', 'Bracket flow'], ['전체 순위', '全体順位', 'Full standings'], ['ALGS Year {n} 일정', 'ALGS Year {1} 日程', 'ALGS Year {1} schedule'], ['전체 일정', '全日程', 'Full schedule'], ['다음 경기', '次の試合', 'Next match'], ['예정된 경기가 없습니다.', '予定されている試合はありません。', 'No upcoming matches.'],
    ['지금 위치', '現在地', 'Now'], ['국제전 미출전', '国際大会不出場', 'No international event'], ['조별 리그 {n}팀', 'グループステージ{1}チーム', 'Group stage, {1} teams'], ['현재 시즌에 한국 팀 데이터가 없습니다.', '今シーズンの韓国チームのデータがありません。', 'No Korean team data this season.'],
    ['{t} 시작 · 지역마다 {n}팀 중 상위 {n}팀이 챔피언십에 갑니다.', '{1} 開始 · 各地域{2}チーム中、上位{3}チームがチャンピオンシップへ。', 'Starts {1} · top {3} of {2} teams per region reach the Championship.'],
    ['외 {n}팀은 순위 탭에서 볼 수 있습니다.', 'ほか{1}チームは順位タブで見られます。', '{1} more on the Standings tab.'],
    ['LCQ에 나가는 {x} 팀이 없습니다.', 'LCQに出場する{1}はありません。', 'None of {1} play the LCQ.'],
    ['Split {n} 플레이오프 결과', 'Split {1} プレイオフ結果', 'Split {1} Playoffs results'],
    // 경기
    ['예정 경기', '今後の試合', 'Upcoming'], ['지난 결과', '過去の結果', 'Results'], ['게임 다시보기', '試合リプレイ', 'Game replay'],
    ['모든 시간은 한국 시간(KST)입니다. 한 시리즈는 보통 {n}게임입니다.', '時刻はすべて日本時間（JST）です。1シリーズは通常{1}試合です。', 'All times are KST (UTC+9). A series is usually {1} games.'],
    ['조건에 맞는 경기가 없습니다. 필터를 끄면 전체 경기를 볼 수 있습니다.', '条件に合う試合はありません。フィルターを外すとすべての試合が見られます。', 'No matches match the filter. Turn it off to see all matches.'],
    ['전체 {n}팀 결과', '全{1}チームの結果', 'All {1} teams'], ['출전 팀 미정', '出場チーム未定', 'Teams TBD'], ['출전 {n}팀 확정', '出場{1}チーム確定', '{1} teams confirmed'],
    ['끝난 경기가 아직 없습니다.', '終了した試合はまだありません。', 'No finished matches yet.'], ['시리즈 고르기', 'シリーズを選ぶ', 'Pick a series'],
    ['게임마다 탈락 순서를 재생합니다. 재생바를 움직이면 그 시점까지 탈락한 팀과 남은 팀이 바뀝니다. 공식 데이터에는 게임 중 위치가 없어 지도 동선은 아직 없습니다.', '試合ごとに脱落順を再生します。再生バーを動かすと、その時点までに脱落したチームと残りのチームが切り替わります。公式データには試合中の位置がないため、マップ上の動きはまだありません。', 'Replays the elimination order of each game. Move the slider to see who was out and who was left at that point. Official data has no in-game positions, so there are no map paths yet.'],
    ['이 시리즈의 게임 기록이 아직 없습니다.', 'このシリーズの試合記録はまだありません。', 'No game records for this series yet.'], ['이 게임의 결과가 아직 없습니다.', 'この試合の結果はまだありません。', 'No result for this game yet.'], ['공식 경기 기록을 불러오는 중…', '公式記録を読み込み中…', 'Loading official records…'],
    ['탈락 순서 재생바', '脱落順の再生バー', 'Elimination order slider'], ['팀별 결과', 'チーム別結果', 'Results by team'], ['팀별 레전드·킬 보기', 'チーム別レジェンド・キル', 'Legends and kills by team'], ['선수 (레전드, 킬)', '選手（レジェンド、キル）', 'Players (legend, kills)'],
    ['게임 {n}', '第{1}試合', 'Game {1}'], ['{n}게임째', '第{1}試合', 'Game {1}'], ['LIVE {n}/{n}게임', 'LIVE {1}/{2}試合', 'LIVE {1}/{2}'], ['{n}팀 생존', '{1}チーム生存', '{1} teams left'], ['{n}위 탈락', '{1}位で敗退', 'out {1o}'], ['밴: {t}', 'BAN: {1}', 'Bans: {1}'], ['메인 중계 (이 게임부터)', 'メイン配信（この試合から）', 'Main stream (from this game)'],
    // 순위·브래킷
    ['이전 결과', '過去の結果', 'Past results'], ['예상 출전 팀', '出場予想チーム', 'Projected entrants'], ['공식 출전 명단', '公式出場リスト', 'Official entrants'], ['진행 방식', '進行方式', 'Format'], ['공식 페이지', '公式ページ', 'Official page'],
    ['위는 승자조, 아래는 패자조입니다.', '上がウィナーズ、下がエリミネーションです。', 'Winners bracket on top, elimination bracket below.'], ['조별 리그 누적 점수입니다.', 'グループステージの累計スコアです。', 'Cumulative group stage scores.'], ['매치 포인트 결승 {n}팀의 점수입니다.', 'マッチポイント決勝{1}チームのスコアです。', 'Scores of the {1} teams in the Match Point Finals.'],
    ['결승까지 온 길: 브래킷 보기', '決勝までの道のり: ブラケットを見る', 'Road to the Finals: view bracket'], ['다음: 매치 포인트 결승 보기', '次: マッチポイント決勝を見る', 'Next: Match Point Finals'], ['지난 결과: 조별 리그 순위와 시리즈 결과 보기', '過去の結果: グループステージ順位とシリーズ結果', 'Earlier: group stage standings and series'],
    ['조별 리그 시리즈', 'グループステージのシリーズ', 'Group stage series'], ['조별 리그 누적', 'グループステージ累計', 'Group stage total'], ['결승 일정이 아직 없습니다.', '決勝の日程はまだありません。', 'No Finals schedule yet.'], ['결승 결과가 없습니다.', '決勝の結果はありません。', 'No Finals result.'],
    ['앞 단계가 끝나면 출전 팀이 정해집니다.', '前のステージが終わると出場チームが決まります。', 'Teams are set when the previous stage ends.'], ['앞 단계 결과로 계산한 예상 명단', '前ステージの結果から計算した予想', 'Projected from the previous stage'], ['진출 예정', '進出予定', 'advancing'],
    ['{x} {n}팀. 경기가 시작되면 점수표로 바뀝니다.', '{1} {2}チーム。試合が始まるとスコア表に変わります。', '{1}: {2} teams. Turns into a scoreboard when play starts.'],
    ['매치 포인트 {n}점 도달 후 게임 {n}위를 하면 우승', 'マッチポイント{1}点到達後に試合で{2}位になれば優勝', 'Reach {1} pts for match point, then win a game to take the title'],
    ['상위 {n}팀 {x}', '上位{1}チーム {2}', 'Top {1}: {2}'], ['하위 {n}팀 {x}', '下位{1}チーム {2}', 'Bottom {1}: {2}'], ['상위 {n}팀 챔피언십 진출', '上位{1}チームがチャンピオンシップ進出', 'top {1} reach the Championship'],
    ['패자부활 {n}R로', 'エリミネーション{1}Rへ', 'to Elim. R{1}'], ['패자부활 {n}R 진출', 'エリミネーション{1}R進出', 'to Elim. R{1}'], ['승자 {n}R로', 'ウィナーズ{1}Rへ', 'to Winners R{1}'], ['패자부활 {n}라운드', 'エリミネーションラウンド{1}', 'Elimination Round {1}'], ['패자부활 라운드', 'エリミネーションラウンド', 'Elimination rounds'], ['승자 {n}라운드', 'ウィナーズラウンド{1}', 'Winners Round {1}'], ['승자 {n}라운드 {t}로비', 'ウィナーズラウンド{1} ロビー{2}', 'Winners Round {1} Lobby {2}'], ['승자 {n}라운드 (A·B로비)', 'ウィナーズラウンド{1}（ロビーA・B）', 'Winners Round {1} (Lobbies A/B)'],
    ['여기까지 {x}', 'ここまで{1}', 'Above: {1}'], ['여기까지 {x}, 아래는 {x}', 'ここまで{1}、以下は{2}', 'Above: {1} · below: {2}'], ['여기까지 매치 포인트 결승 직행, 아래는 서바이벌 스테이지', 'ここまで決勝直行、以下はサバイバルステージ', 'Above: straight to Finals · below: Survival Stage'], ['여기까지 챔피언십 직행권 · 아래는 LCQ', 'ここまでチャンピオンシップ直行 · 以下はLCQ', 'Above: Championship direct · below: LCQ'], ['여기까지 최소 보장 기준 챔피언십 직행권 · 아래는 LCQ', 'ここまで最低保証基準でチャンピオンシップ直行 · 以下はLCQ', 'Above: direct (min. guaranteed) · below: LCQ'], ['여기까지 정규 시즌 순위로 플레이오프 진출 (리전 결승 우승팀 {n}자리 추가)', 'ここまでレギュラーシーズン順位でプレイオフ進出（リージョナルファイナル優勝で{1}枠追加）', 'Above: Playoffs via regular season (+{1} for the Regional Finals winner)'], ['여기까지 리전 결승 진출', 'ここまでリージョナルファイナル進出', 'Above: to Regional Finals'], ['여기부터 {n}부 리그(챌린저 서킷) 팀', 'ここから{1}部（チャレンジャーサーキット）チーム', 'Tier {1} (Challenger Circuit) teams from here'],
    ['조별 리그 상위 {n}팀은 결승 직행, 그 아래 {n}팀은 서바이벌 스테이지에서 상위 {n}팀만 결승에 합류했습니다.', 'グループステージ上位{1}チームは決勝直行、その下の{2}チームはサバイバルステージで上位{3}チームだけが決勝に合流しました。', 'Group stage top {1} went straight to the Finals; the next {2} played the Survival Stage, where the top {3} joined the Finals.'],
    ['조별 리그 상위 {n}팀은 서바이벌 스테이지 없이 결승으로 바로 갔습니다.', 'グループステージ上位{1}チームはサバイバルステージなしで決勝へ直行しました。', 'Group stage top {1} skipped the Survival Stage and went straight to the Finals.'],
    ['조별 {n}위', 'グループ{1}位', 'Group {1o}'], ['조별 순위', 'グループ順位', 'Group rank'], ['{w}조', 'グループ{1}', 'Group {1}'], ['{w}조 vs {w}조', 'グループ{1} vs {2}', 'Group {1} vs {2}'], ['{w}조 vs {w}조 ★', 'グループ{1} vs {2} ★', 'Group {1} vs {2} ★'],
    // LCQ
    ['{t} LCQ · {t} 시작. 지역마다 {n}팀이 겨뤄 상위 {n}팀이 챔피언십에 갑니다.', '{1} LCQ · {2} 開始。各地域{3}チームが戦い、上位{4}チームがチャンピオンシップへ。', '{1} LCQ · starts {2}. {3} teams per region; the top {4} reach the Championship.'],
    ['{x} {n}팀 출전', '{1} {2}チーム出場', '{1}: {2} in the LCQ'], ['한국 관련 {n}팀 출전', '韓国関連{1}チーム出場', '{1} Korea-related teams in the LCQ'],
    ['프로리그 {n}팀: 챔피언십 포인트 직행권({n}위) 밖의 {t} 팀, CP 순서.', 'プロリーグ{1}チーム: チャンピオンシップポイント直行圏（{2}位）外の{3}チーム、CP順。', 'Pro League, {1} teams: {3} teams outside the Championship Points direct spots (top {2}), by CP.'],
    ['{n}부 {n}팀: Split {n} 챌린저 서킷 우승팀과 종합 포인트 상위 팀 (Liquipedia 순위표 기준). 공식 명단이 나오면 그 명단으로 바뀝니다.', '{1}部{2}チーム: Split {3} チャレンジャーサーキット優勝チームと総合ポイント上位チーム（Liquipediaの順位表）。公式リストが出るとそれに切り替わります。', 'Tier {1}, {2} teams: Split {3} Challenger Circuit winners and top overall points (Liquipedia standings). Replaced by the official list once published.'],
    ['{n}부 {n}팀: Split {n} 챌린저 서킷 우승팀과 종합 포인트 상위 팀 (Liquipedia 순위표 기준). 마지막 자리는 포인트 동점 팀이 있어 바뀔 수 있습니다. 공식 명단이 나오면 그 명단으로 바뀝니다.', '{1}部{2}チーム: Split {3} チャレンジャーサーキット優勝チームと総合ポイント上位チーム（Liquipediaの順位表）。最後の枠は同点チームがあるため変わる可能性があります。公式リストが出るとそれに切り替わります。', 'Tier {1}, {2} teams: Split {3} Challenger Circuit winners and top overall points (Liquipedia standings). The last spot may change due to a points tie. Replaced by the official list once published.'],
    ['공식 API가 공개한 출전 팀입니다. 시드 순서대로 A·B로비에 지그재그로 나뉩니다.', '公式APIが公開した出場チームです。シード順にロビーA・Bへジグザグで分かれます。', 'Entrants published by the official API, split zigzag into Lobbies A/B by seed.'],
    ['{n}부 팀 포인트는 챌린저 서킷 포인트입니다. 출처:', '{1}部チームのポイントはチャレンジャーサーキットポイントです。出典:', 'Tier {1} points are Challenger Circuit points. Source:'],
    ['{n}팀을 시드 순서대로 지그재그로 나눠', '{1}チームをシード順にジグザグで分けて', '{1} teams are split zigzag by seed into'], ['승자 {n}라운드 A·B로비', 'ウィナーズラウンド{1} ロビーA・B', 'Winners Round {1} Lobbies A/B'], ['(각 {n}팀)에서 {n}게임씩 치릅니다.', '（各{1}チーム）で{2}試合ずつ行います。', '({1} teams each), playing {2} games.'],
    ['로비별 상위 {n}팀은', 'ロビーごとに上位{1}チームは', 'In each lobby the top {1} go to'], [', 하위 {n}팀은', '、下位{1}チームは', ', the bottom {1} to'], ['로 갑니다.', 'へ進みます。', '.'],
    ['승자 {n}라운드 상위 {n}팀은 결승, 하위 {n}팀은 패자부활 {n}라운드로 갑니다. 패자부활 {n}라운드는 상위 {n}팀만 패자부활 {n}라운드로 가고 하위 {n}팀은 탈락합니다.', 'ウィナーズラウンド{1}の上位{2}チームは決勝、下位{3}チームはエリミネーションラウンド{4}へ。エリミネーションラウンド{5}は上位{6}チームだけがエリミネーションラウンド{7}へ進み、下位{8}チームは敗退します。', 'Winners Round {1}: top {2} to the Finals, bottom {3} to Elimination Round {4}. Elimination Round {5}: only the top {6} advance to Elimination Round {7}; the bottom {8} are out.'],
    ['패자부활 {n}라운드 상위 {n}팀이 결승에 합류해', 'エリミネーションラウンド{1}の上位{2}チームが決勝に合流し、', 'The top {2} of Elimination Round {1} join the Finals, and'], ['{n}팀이 매치 포인트 결승', '{1}チームでマッチポイント決勝', '{1} teams play the Match Point Finals'], ['을 치르고,', 'を行い、', ';'], ['상위 {n}팀이 챔피언십', '上位{1}チームがチャンピオンシップ', 'the top {1} go to the Championship'], ['에 갑니다.', 'へ進みます。', '.'],
    ['LCQ 진출 팀', 'LCQ通過チーム', 'LCQ qualifiers'], ['지역별 {n}팀', '地域ごとに{1}チーム', '{1} per region'], ['LCQ 전', 'LCQ前', 'Before LCQ'], ['LCQ 진행 중', 'LCQ進行中', 'LCQ in progress'], ['LCQ 결과', 'LCQ結果', 'LCQ results'], ['LCQ 출전', 'LCQ出場', 'LCQ'],
    ['LCQ {n}팀 더해 챔피언십 {n}팀', 'LCQ +{1} → 計{2}チーム', 'LCQ +{1} → {2} total'],
    // 점수 표기 (순위 점수 / 킬 점수 / 종합 점수)
    ['순위 점수', '順位ポイント', 'Placement pts'], ['킬 점수', 'キルポイント', 'Kill pts'], ['종합 점수', '総合ポイント', 'Total pts'],
    ['순위 {n}', '順位 {1}', 'Place {1}'], ['킬 {n}', 'キル {1}', 'Kills {1}'], ['종합 {n}점', '総合 {1}点', 'Total {1}'],
    ['점수 = 순위 점수 / 킬 점수 / 종합 점수', 'ポイント = 順位 / キル / 総合', 'Points = placement / kills / total'],
    ['현재 {n}위', '現在{1}位', 'now {1o}'],
    ['프로리그 포인트 {n}점', 'プロリーグポイント {1}点', '{1} Pro League pts'], ['프로리그 포인트 –점', 'プロリーグポイント –', 'Pro League pts –'],
    ['프로리그 포인트는 시리즈 순위마다 받는 리그 포인트라 순위·킬 점수로 나뉘지 않습니다.', 'プロリーグポイントはシリーズ順位ごとにもらうリーグポイントなので、順位・キルポイントには分かれません。', 'Pro League points are awarded per series placement, so they do not split into placement and kill points.'],
    ['이 사이트의 점수표는 모두', 'このサイトのスコア表はすべて', 'Every scoreboard on this site shows'], ['순위 점수 / 킬 점수 / 종합 점수', '順位ポイント / キルポイント / 総合ポイント', 'placement / kill / total points'], ['순서로 적습니다.', 'の順で表示します。', ', in that order.'],
    ['승자 {n}라운드 그룹 A·B', 'ウィナーズラウンド{1} グループA・B', 'Winners Round {1} Groups A/B'], ['그룹별 상위 {n}팀 → 승자 {n}라운드, 하위 {n}팀 → 패자부활 {n}라운드', 'グループごと上位{1}チーム → ウィナーズラウンド{2}、下位{3}チーム → エリミネーションラウンド{4}', 'Top {1} per group → Winners Round {2}, bottom {3} → Elimination Round {4}'],
    ['시드 순서대로 지그재그로 나눠 승자 {n}라운드 그룹 A·B(각 {n}팀)', 'シード順にジグザグで分けてウィナーズラウンド{1} グループA・B（各{2}チーム）', 'Split zigzag by seed into Winners Round {1} Groups A/B ({2} teams each)'],
    // LCQ 탭·점수표
    ['조 편성', 'グループ分け', 'Groups'], ['LCQ 경기', 'LCQの試合', 'LCQ matches'], ['시드', 'シード', 'Seed'], ['합계', '合計', 'Total'], ['챔피언십 진출', 'チャンピオンシップ進出', 'To Championship'], ['공식 결과', '公式結果', 'Official results'], ['출전:', '出場:', 'Teams:'],
    ['승자 {n}R {w}', 'ウィナーズ{1}R {2}', 'Winners R{1} {2}'], ['승자 {n}R', 'ウィナーズ{1}R', 'Winners R{1}'], ['패자 {n}R', 'エリミネーション{1}R', 'Elim. R{1}'], ['그룹 {w}', 'グループ{1}', 'Group {1}'], ['승자 {n}라운드 그룹 {w}', 'ウィナーズラウンド{1} グループ{2}', 'Winners Round {1} Group {2}'],
    ['승자 {n}R {w} {n}위', 'ウィナーズ{1}R {2} {3}位', 'Winners R{1} {2} {3o}'], ['승자 {n}R {n}위', 'ウィナーズ{1}R {2}位', 'Winners R{1} {2o}'], ['패자 {n}R {n}위', 'エリミネーション{1}R {2}位', 'Elim. R{1} {2o}'],
    ['승자 {n}R {n}~{n}위', 'ウィナーズ{1}R {2}～{3}位', 'Winners R{1} {2o}–{3o}'], ['패자 {n}R {n}~{n}위', 'エリミネーション{1}R {2}～{3}位', 'Elim. R{1} {2o}–{3o}'], ['{x} {n}~{n}위', '{1} {2}～{3}位', '{1} {2o}–{3o}'], ['{n}~{n}위', '{1}～{2}位', '{1o}–{2o}'], ['→ {x}', '→ {1}', '→ {1}'], ['{n}위 · {n}킬', '{1}位 · {2}キル', '{1o} · {2} kills'],
    ['그룹 {w} {n}팀(시드 지그재그)', 'グループ{1} {2}チーム（シード順ジグザグ）', 'Group {1}, {2} teams (seed zigzag)'],
    ['공식 API가 공개한 출전 명단입니다(공식 시드 순).', '公式APIが公開した出場リストです（公式シード順）。', 'Official entrant list from the API (official seed order).'],
    ['시드는 프로리그 {n}팀(챔피언십 포인트 직행권 {n}위 밖, CP 순) 다음에 {n}부 {n}팀(Split {n} 챌린저 서킷 우승팀과 종합 포인트 상위 팀, 서킷 포인트 CCP 순)입니다.', 'シードはプロリーグ{1}チーム（チャンピオンシップポイント直行圏{2}位の外、CP順）、その後に{3}部{4}チーム（Split {5} チャレンジャーサーキット優勝チームと総合ポイント上位チーム、サーキットポイントCCP順）です。', 'Seeds: {1} Pro League teams (outside the top {2} Championship Points direct spots, by CP), then {4} tier-{3} teams (Split {5} Challenger Circuit winners and top overall points, by CCP).'],
    ['{n}부 마지막 자리는 포인트 동점 팀이 있어 바뀔 수 있습니다.', '{1}部の最後の枠は同点チームがあるため変わる可能性があります。', 'The last tier-{1} spot may change due to a points tie.'],
    ['그룹은 공식 배정입니다.', 'グループは公式の割り当てです。', 'Groups are the official draw.'],
    ['그룹은 시드 지그재그 배정(A: 1·4·5·8·9…, B: 2·3·6·7·10…)이며, 공식 배정이 나오면 바뀝니다.', 'グループはシード順のジグザグ割り当て（A: 1·4·5·8·9…、B: 2·3·6·7·10…）で、公式の割り当てが出ると切り替わります。', 'Groups use a seed zigzag (A: 1·4·5·8·9…, B: 2·3·6·7·10…) until the official draw is out.'],
    ['{n}부 팀 포인트는 챌린저 서킷 포인트(CCP)입니다. 출처:', '{1}部チームのポイントはチャレンジャーサーキットポイント（CCP）です。出典:', 'Tier-{1} points are Challenger Circuit points (CCP). Source:'],
    ['시드 순서대로 지그재그로 나눈 그룹 A·B(각 {n}팀)가 승자 {n}라운드에서 {n}게임씩 치릅니다.', 'シード順にジグザグで分けたグループA・B（各{1}チーム）がウィナーズラウンド{2}で{3}試合ずつ行います。', 'Groups A and B ({1} teams each, split zigzag by seed) play {3} games each in Winners Round {2}.'],
    ['그룹별 상위 {n}팀은 승자 {n}라운드, 하위 {n}팀은 패자부활 {n}라운드로 갑니다.', '各グループ上位{1}チームはウィナーズラウンド{2}、下位{3}チームはエリミネーションラウンド{4}へ進みます。', 'In each group the top {1} go to Winners Round {2}, the bottom {3} to Elimination Round {4}.'],
    ['패자부활 {n}라운드 상위 {n}팀이 결승에 합류해 {n}팀이 매치 포인트 결승을 치르고, 상위 {n}팀이 챔피언십에 갑니다.', 'エリミネーションラウンド{1}の上位{2}チームが決勝に合流し、{3}チームでマッチポイント決勝を行い、上位{4}チームがチャンピオンシップへ進みます。', 'The top {2} of Elimination Round {1} join the Finals; {3} teams play the Match Point Finals and the top {4} go to the Championship.'],
    ['게임별 점수 불러오는 중', '試合ごとのスコアを読み込み中', 'Loading per-game scores'], ['칸에 마우스를 올리면 게임 순위·킬이 보입니다.', 'マスにカーソルを合わせると試合の順位・キルが見られます。', 'Hover a cell to see placement and kills.'],
    ['공식 출전 명단입니다. 경기가 시작되면 칸이 채워집니다.', '公式の出場リストです。試合が始まるとマスが埋まります。', 'Official lineup. Cells fill in once play starts.'],
    ['공식 그룹 배정입니다. 경기가 시작되면 칸이 채워집니다.', '公式のグループ割り当てです。試合が始まるとマスが埋まります。', 'Official group draw. Cells fill in once play starts.'],
    ['앞 경기 결과로 정해진 출전 팀입니다. 경기가 시작되면 칸이 채워집니다.', '前の試合の結果で決まった出場チームです。試合が始まるとマスが埋まります。', 'Teams set by the previous round. Cells fill in once play starts.'],
    ['시드 지그재그로 예상한 그룹입니다. 공식 배정이 나오면 바뀌고, 경기가 시작되면 칸이 채워집니다.', 'シード順ジグザグで予想したグループです。公式の割り当てが出ると切り替わり、試合が始まるとマスが埋まります。', 'Projected group by seed zigzag. Replaced by the official draw; cells fill in once play starts.'],
    ['앞 경기가 끝나면 칸마다 표시된 자리의 팀이 들어옵니다.', '前の試合が終わると、各マスに表示された順位のチームが入ります。', 'When the previous round ends, each row is filled by the team from the slot shown.'],
    ['{n}번 시드', 'シード{1}', 'Seed {1}'], ['CC #{n} 우승', 'CC #{1} 優勝', 'CC #{1} winner'], ['CC 우승', 'CC優勝', 'CC winner'], ['CC 종합 {n}위', 'CC総合{1}位', 'CC overall {1o}'],
    ['LCQ {x} {n}위 ↑', 'LCQ {1} {2}位 ↑', 'LCQ {1} {2o} ↑'], ['LCQ {x} {n}위 ↓', 'LCQ {1} {2}位 ↓', 'LCQ {1} {2o} ↓'], ['LCQ {x} {n}위 탈락', 'LCQ {1} {2}位 敗退', 'LCQ {1} {2o}, out'], ['LCQ {x} {n}위 진출', 'LCQ {1} {2}位 通過', 'LCQ {1} {2o}, qualified'], ['LCQ {x} LIVE', 'LCQ {1} LIVE', 'LCQ {1} LIVE'], ['LCQ {x} LIVE {n}위', 'LCQ {1} LIVE {2}位', 'LCQ {1} LIVE {2o}'], ['LCQ {x} 대기', 'LCQ {1} 待機', 'LCQ {1} up next'],
    ['{x} LIVE {n}위', '{1} LIVE {2}位', '{1} LIVE {2o}'], ['{x} LIVE', '{1} LIVE', '{1} LIVE'], ['{x} 대기', '{1} 待機', '{1} up next'], ['{x} {n}위 ↑', '{1} {2}位 ↑', '{1} {2o} ↑'], ['{x} {n}위 ↓', '{1} {2}位 ↓', '{1} {2o} ↓'], ['{x} {n}위 탈락', '{1} {2}位 敗退', '{1} {2o}, out'], ['{x} {n}위 우승', '{1} {2}位 優勝', '{1} {2o}, champion'],
    ['승자1R', 'W1R', 'W1'], ['승자2R', 'W2R', 'W2'], ['승자R', 'WR', 'WR'], ['패자1R', 'E1R', 'E1'], ['패자2R', 'E2R', 'E2'], ['조별', 'GS', 'GS'],
    // 챔피언십 조 편성
    ['{t} – {t} · 삿포로 LAN · {n}팀', '{1} – {2} · 札幌LAN · {3}チーム', '{1} – {2} · Sapporo LAN · {3} teams'],
    ['챔피언십 포인트 직행 {n}팀을 순위대로 A→B→C→D→D→C→B→A 순서로 지그재그 배정한 조 편성입니다 ({x} 기준, 사이트 계산이라 공식 발표와 다를 수 있습니다).', 'チャンピオンシップポイント直行{1}チームを順位通りA→B→C→D→D→C→B→Aの順でジグザグに割り当てたグループ分けです（{2}基準。サイトの計算なので公式発表と異なる場合があります）。', 'Groups built by placing the {1} Championship Points qualifiers in rank order A→B→C→D→D→C→B→A ({2}; site calculation, may differ from the official draw).'],
    ['최종 순위 정산', '最終順位で試算', 'final standings'], ['진행 중 대회 정산 순위', '進行中の大会の試算順位', 'live projection'], ['현재 챔피언십 포인트 순위', '現在のチャンピオンシップポイント順位', 'current Championship Points'],
    ['{n}팀 확정', '{1}チーム確定', '{1} set'], ['LCQ {n}자리', 'LCQ枠{1}', '{1} LCQ slots'],
    ['네 지역 LCQ가 모두 끝나면 진출 {n}팀을 CP 순서대로 {n}~{n}번 자리에 넣습니다.', '4地域のLCQがすべて終わると、通過{1}チームをCP順に{2}〜{3}番に入れます。', 'When all four LCQs end, the {1} qualifiers fill seeds {2}–{3} by CP.'],
    ['LCQ 진출 {n}팀을 CP 순서대로 {n}~{n}번 자리에 넣었습니다. CP가 같으면 LCQ 결승 순위가 높은 팀이 앞입니다.', 'LCQ通過{1}チームをCP順に{2}〜{3}番に入れました。CPが同じ場合はLCQ決勝の順位が上のチームが先です。', 'The {1} LCQ qualifiers fill seeds {2}–{3} by CP; ties go to the better LCQ Finals placing.'],
    ['챔피언십 조 편성', 'チャンピオンシップのグループ分け', 'Championship groups'],
    // 이전 결과
    ['아직 끝난 대회가 없습니다.', '終了した大会はまだありません。', 'No finished events yet.'], ['진행 중인 대회가 없습니다.', '進行中の大会はありません。', 'No event in progress.'], ['에서 지난 대회를 볼 수 있습니다.', 'で過去の大会が見られます。', 'has past events.'], ['대회 결과', '大会結果', 'Event results'],
    ['{t} – {t} · {x} · {n}팀 ·', '{1} – {2} · {3} · {4}チーム ·', '{1} – {2} · {3} · {4} teams ·'],
    ['EWC LAN · {n}팀', 'EWC LAN · {1}チーム', 'EWC LAN · {1} teams'], ['라스베이거스 LAN · {n}팀', 'ラスベガスLAN · {1}チーム', 'Las Vegas LAN · {1} teams'], ['삿포로 LAN · {n}팀', '札幌LAN · {1}チーム', 'Sapporo LAN · {1} teams'], ['온라인 · 지역별 {n}팀', 'オンライン · 地域ごとに{1}チーム', 'Online · {1} teams per region'], ['온라인 · 지역별 {n}자리', 'オンライン · 地域ごとに{1}枠', 'Online · {1} spots per region'], ['지역별 {n}자리', '地域ごとに{1}枠', '{1} spots per region'],
    ['라스베이거스 LAN', 'ラスベガスLAN', 'Las Vegas LAN'], ['삿포로 LAN', '札幌LAN', 'Sapporo LAN'],
    // 포인트
    ['대회별 CP 내역', '大会別CP内訳', 'CP by event'], ['프로리그 포인트', 'プロリーグポイント', 'Pro League points'], ['챔피언십 직행권 {n}팀', 'チャンピオンシップ直行 {1}チーム', '{1} direct Championship spots'],
    ['{x} 기준 · 나머지 팀은 지역별 LCQ에서 {n}자리씩', '{1}基準 · 残りは地域ごとのLCQで{2}枠ずつ', 'by {1} · the rest go to regional LCQs ({2} spots each)'],
    ['최종 순위 정산 기준', '最終順位で試算', 'final standings'], ['결승 실시간 정산 기준', '決勝ライブ順位で試算', 'live Finals standings'], ['최소 보장 정산 기준', '最低保証で試算', 'minimum guarantee'], ['현재 순위 기준', '現在の順位', 'current standings'],
    ['지역별 챔피언십 직행권 팀 수', '地域別チャンピオンシップ直行チーム数', 'Direct Championship spots by region'],
    ['결승 실시간 정산', '決勝ライブ試算', 'Live Finals projection'], ['실시간 정산', 'ライブ試算', 'Live projection'],
    ['{x} 최종 순위까지 반영한 값입니다.', '{1}の最終順位まで反映した値です。', 'Includes the final standings of {1}.'],
    ['{t} 매치 포인트 결승 진행 중 · 결승 팀은 지금 결승 순위의 CP를, 이미 탈락한 팀은 확정 순위의 CP를 더한 값입니다. 결승 순위가 바뀌면 바로 다시 계산합니다.', '{1} マッチポイント決勝進行中 · 決勝のチームは現在の決勝順位のCPを、既に敗退したチームは確定順位のCPを加えた値です。決勝の順位が変わるとすぐに再計算します。', '{1} Match Point Finals live · finalists get the CP for their current Finals rank, eliminated teams their final rank. Recalculated whenever the Finals standings change.'],
    ['{t} 진행 중 · 순위가 정해진 팀은 그 CP를, 아직 경기 중인 팀은 최소 보장 CP(1인 {n})를 더한 값입니다. 결승이 시작되면 결승 실시간 순위로 바뀌고, 대회가 끝나면 최종 순위로 확정됩니다.', '{1} 進行中 · 順位が決まったチームはそのCPを、まだ試合中のチームは最低保証CP（1人{2}）を加えた値です。決勝が始まると決勝のライブ順位に変わり、大会が終わると最終順位で確定します。', '{1} live · placed teams get their CP, teams still playing get the minimum guaranteed CP ({2} per player). Switches to live Finals ranks when the Finals start and is fixed with the final standings.'],
    ['대체 출전 반영', '代替出場を反映', 'Substitutes applied'], ['빠진 선수는 이번 대회 CP를 받지 않고, 대체 선수의 CP는 원래 소속팀 합계에 들어갑니다.', '欠場した選手は今回の大会のCPを受け取らず、代替選手のCPは元の所属チームの合計に入ります。', 'Absent players get no CP for this event; substitutes’ CP counts for their own teams.'],
    ['챔피언십 포인트 {n}팀 중 위치 ({x} 기준). 굵은 선 안쪽({n}위까지)이 챔피언십 직행입니다.', 'チャンピオンシップポイント{1}チーム中の位置（{2}基準）。太線の内側（{3}位まで）がチャンピオンシップ直行です。', 'Position among {1} teams ({2}). Inside the bold line (top {3}) qualifies directly for the Championship.'],
    ['{n}위까지 챔피언십 직행, 나머지 {n}자리는 LCQ에서 정합니다. 팀 CP는 현재 로스터에서 CP가 높은 선수 {n}명의 합입니다. CP가 같으면 Split {n} 플레이오프 최종 순위, 그다음 프로리그 Split {n} 최종 순위가 좋은 팀이 위입니다(공식 규정 C{n}).', '{1}位までチャンピオンシップ直行、残り{2}枠はLCQで決まります。チームCPは現ロスターでCPが高い選手{3}人の合計です。CPが同じ場合はSplit {4} プレイオフの最終順位、次にプロリーグSplit {5}の最終順位が良いチームが上です（公式規定C{6}）。', 'Top {1} qualify directly; the other {2} spots come from the LCQ. Team CP is the sum of the {3} highest-CP players on the current roster. Ties go to the better Split {4} Playoffs placing, then Pro League Split {5} placing (official rule C{6}).'],
    ['직행권까지 {n} CP 부족', '直行まであと{1} CP', '{1} CP short of direct'],
    ['합산 선수 (상위 {n}인)', '合算選手（上位{1}人）', 'Counted players (top {1})'], ['그 밖: {t}', 'その他: {1}', 'Others: {1}'],
    ["팀 CP는 상위 {n}인 합이라, 결승 진출 팀은 '{n}인 최저 CP × {n}'을 더했습니다. '최대'는 우승했을 때입니다.", 'チームCPは上位{1}人の合計なので、決勝進出チームには「1人あたり最低CP × {3}」を加えています。「最大」は優勝した場合です。', 'Team CP is the top {1} players, so finalists get “minimum CP per player × {3}”. “Max” is if they win.'],
    ['선수 {n}명이 받는 CP', '選手{1}人が受け取るCP', 'CP per player'], ['(최종 순위별)', '（最終順位別）', '(by final placing)'],
    ['팀이나 선수 줄을 누르면 대회별로 받은 CP가 펼쳐집니다. 진행 중인 플레이오프는 순위가 정해진 팀부터 공식 합계에 바로 들어갑니다.', 'チームや選手の行をタップすると大会別のCPが開きます。進行中のプレイオフは順位が決まったチームから公式合計に入ります。', 'Tap a team or player row to see CP by event. During the Playoffs, placed teams enter the official totals right away.'],
    ['공식 순위표가 팀별로 공개하는 합산 대상 선수(상위 {n}인)만 표시합니다.', '公式順位表がチームごとに公開している合算対象選手（上位{1}人）のみ表示します。', 'Only the counted players (top {1}) the official table lists per team.'],
    ['어느 대회에서 어느 팀(선수)이 몇 CP를 받았는지 봅니다. 같은 팀 선수는 {n}인당 같은 CP를 받습니다.', 'どの大会でどのチーム（選手）が何CPを得たかを見られます。同じチームの選手は{1}人ずつ同じCPを受け取ります。', 'Who earned how many CP in each event. Players on the same team each get the same CP.'],
    ['{n}인당 CP', '1人あたりCP', 'CP per player'], ['받은 선수', '受け取った選手', 'Players'], ['선수', '選手', 'Players'],
    ['Split {n} · {t}. 시리즈(하루 {n}게임) 순위마다 프로리그 포인트를 받고, {n}개 시리즈 합으로 정규 시즌 순위를 정합니다. 진출 컷은 정규 시즌 순위 기준이고, 오른쪽 최종 순위는 리전 결승까지 반영한 값(챔피언십 포인트 기준)입니다.', 'Split {1} · {2}。シリーズ（1日{3}試合）の順位ごとにプロリーグポイントを得て、{4}シリーズの合計でレギュラーシーズン順位を決めます。進出ラインはレギュラーシーズン順位基準で、右の最終順位はリージョナルファイナルまで反映した値（チャンピオンシップポイント基準）です。', 'Split {1} · {2}. Each series ({3} games a day) awards Pro League points; {4} series make the regular season. Cut lines use the regular season; the final rank on the right includes the Regional Finals (Championship Points basis).'],
    ['순위 점수 + 킬당 {n}점 ({x})', '順位点 + 1キル{1}点（{2}）', 'Placement + {1} per kill ({2})'], ['시리즈 순위별 {x}', 'シリーズ順位別 {1}', 'By series rank {1}'], ['{n}위 {n}', '{1}位 {2}', '{1o}: {2}'], ['{n}위 {n} …', '{1}位 {2} …', '{1o}: {2} …'], ['{x} ★', '{1} ★', '{1} ★'],
    ['{t}. 빠진 선수는 이번 대회 CP를 받지 않고, 대체 선수의 CP는 원래 소속팀 합계에 들어갑니다.', '{1}。欠場した選手は今回の大会のCPを受け取らず、代替選手のCPは元の所属チームの合計に入ります。', '{1}. Absent players get no CP for this event; substitutes’ CP counts for their own teams.'], ['{t} … {n}위 {n}', '{1} … {2}位 {3}', '{1} … {2o}: {3}'],
    ['동률 기준: S{n} 플레이오프 순위 → 프로리그 S{n} 순위 → 프로리그 S{n} 포인트', '同点時: S{1}プレイオフ順位 → プロリーグS{2}順位 → プロリーグS{3}ポイント', 'Tiebreak: S{1} Playoffs rank → Pro League S{2} rank → Pro League S{3} points'],
    ['챔피언십 포인트 순위에서 한국 팀 위치', 'チャンピオンシップポイント順位での韓国チームの位置', 'Korean teams in the Championship Points standings'],
    ['챔피언십 포인트 {n}팀 중 {x} 위치, {n}위까지 직행', 'チャンピオンシップポイント{1}チーム中の{2}の位置、{3}位まで直行', '{2} among {1} teams; top {3} qualify directly'],
    ['내역 없음', '内訳なし', 'No records'], ['대회별 CP 데이터가 아직 없습니다.', '大会別CPデータはまだありません。', 'No CP data by event yet.'], ['이 지역·스플릿 데이터가 아직 없습니다.', 'この地域・スプリットのデータはまだありません。', 'No data for this region/split yet.'],
    ['공식 합계에 아직 반영 안 됨', '公式合計にまだ未反映', 'not in the official total yet'], ['CP 없음 ({n}경기 미만 출전)', 'CPなし（{1}試合未満の出場）', 'no CP (under {1} games)'], ['다른 팀 소속 때 받은 CP (선수에게 귀속)', '別チーム所属時のCP（選手に帰属）', 'CP earned with another team (stays with the player)'],
    ['{n}경기 출전', '{1}試合出場', '{1} games played'], ['{n}경기', '{1}試合', '{1} games'], ['({n}경기 미달)', '（{1}試合未満）', '(<{1} games)'], ['{n}경기 미달', '{1}試合未満', '<{1} games'],
    ['공식 결과 반영', '公式結果を反映', 'official result'], ['결장 선수', '欠場選手', 'absent player'],
    ['{t} 비자 결장 → {t} 대체', '{1} ビザで欠場 → {2} が代替', '{1} out (visa) → {2} subbed in'], ['{t} 대체 출전 {n}위 +{n}', '{1} 代替出場 {2}位 +{3}', '{1} sub, {2o} +{3}'], ['{t} 대체 출전 최소 +{n}', '{1} 代替出場 最低 +{2}', '{1} sub, min +{2}'], ['대체 출전 +{n}', '代替出場 +{1}', 'Sub +{1}'],
    ['일부 대회 CP가 팀 합계에서 빠졌지만 어느 대회인지 하나로 정할 수 없음', '一部大会のCPがチーム合計から外れていますが、どの大会か特定できません', 'Some event CP is missing from the team total, but which one can’t be determined'],
    ['현재 팀 CP 합산(상위 {n}인)에는 들어가지 않는 선수입니다.', '現在のチームCP合算（上位{1}人）に入らない選手です。', 'Not among the team’s counted players (top {1}).'],
    ['팀 CP {n} = 상위 {n}인 합', 'チームCP {1} = 上位{2}人の合計', 'Team CP {1} = top {2} players'], ['의 팀 CP 합산에 들어가는 상위 {n}인입니다.', 'のチームCPに入る上位{1}人です。', '’s top {1} counted players.'],
    // 팀·선수
    ['한국 선수 또는 한국 코치가 있는 팀입니다. 카드를 누르면 팀 상세로 갑니다.', '韓国人選手または韓国人コーチがいるチームです。カードをタップするとチーム詳細へ。', 'Teams with Korean players or coaches. Tap a card for details.'],
    ['APAC North 지역 팀입니다. 카드를 누르면 팀 상세로 갑니다.', 'APAC North地域のチームです。カードをタップするとチーム詳細へ。', 'APAC North teams. Tap a card for details.'], ['내가 고른 응원 팀입니다. 카드를 누르면 팀 상세로 갑니다.', '選んだ応援チームです。カードをタップするとチーム詳細へ。', 'Your teams. Tap a card for details.'],
    ['현재 시즌 팀과 로스터입니다.', '今シーズンのチームとロスターです。', 'Current season teams and rosters.'], ['굵은 이름', '太字の名前', 'Bold names'], ['은 한국 선수,', 'は韓国人選手、', ' are Korean players;'], ['는 한국계(혼혈·이중국적 등) 선수입니다.', 'は韓国系（ハーフ・二重国籍など）の選手です。', ' marks players of Korean heritage.'],
    ['팀 또는 선수 검색', 'チーム・選手を検索', 'Search teams or players'], ['팀이나 선수 이름으로 찾기', 'チーム名・選手名で探す', 'Find by team or player'], ['팀 이름으로 찾기', 'チーム名で探す', 'Find by team name'],
    ['한국계 (국적과 대표 국가가 다르거나 운영자 확인)', '韓国系（国籍と代表国が異なる、または運営者確認）', 'Korean heritage (nationality and represented country differ, or confirmed)'],
    ['팀 목록', 'チーム一覧', 'All teams'], ['로스터', 'ロスター', 'Roster'], ['챔피언십 포인트 내역', 'チャンピオンシップポイント内訳', 'Championship Points'], ['시즌 성적', 'シーズン成績', 'Season results'], ['경기 결과', '試合結果', 'Match results'], ['선수 방송', '選手配信', 'Player streams'], ['Liquipedia에서 보기', 'Liquipediaで見る', 'View on Liquipedia'], ['이 팀 정보 고치기', 'このチーム情報を修正', 'Fix this team’s info'], ['이 선수 정보 고치기', 'この選手情報を修正', 'Fix this player’s info'],
    ['CHZZK 검색', 'CHZZK検索', 'CHZZK search'], ['YouTube 검색', 'YouTube検索', 'YouTube search'], ['선수', '選手', 'Player'], ['주장', 'キャプテン', 'Captain'],
    ['{t}, 코치', '{1}、コーチ', '{1}, coach'], ['{t}, 선수', '{1}、選手', '{1}, player'], ['{t}, 주장', '{1}、キャプテン', '{1}, captain'], ['코치 {t}', 'コーチ {1}', 'coach {1}'], ['{t}, CP {n}위', '{1}、CP {2}位', '{1}, CP {2o}'], ['{t} CP {n}위', '{1} CP {2}位', '{1} CP {2o}'],
    ['팀을 찾지 못했습니다.', 'チームが見つかりません。', 'Team not found.'], ['선수를 찾지 못했습니다.', '選手が見つかりません。', 'Player not found.'], ['에서 다시 고르세요.', 'から選び直してください。', ' to pick again.'], ['에서 찾아 보세요.', 'で探してみてください。', ' to search.'],
    ['로스터 정보 없음', 'ロスター情報なし', 'No roster info'], ['로스터 일부', 'ロスター一部', 'Partial roster'], ['현재 소속 정보 없음', '現所属情報なし', 'No current team info'], ['등록된 채널 없음', '登録チャンネルなし', 'No registered channel'],
    ['Year {n} 대회 기록', 'Year {1} 大会記録', 'Year {1} results'], ['Year {n} 공식 대회 기록이 없습니다.', 'Year {1} の公式大会記録はありません。', 'No official Year {1} records.'], ['Year {n} 소속 팀:', 'Year {1} 所属チーム:', 'Year {1} teams:'], ['Year {n} 이전 기록은 Liquipedia 연동 후 이곳에 표시됩니다. 지금은', 'Year {1} 以前の記録はLiquipedia連携後にここに表示されます。現在は', 'Records before Year {1} will appear here once Liquipedia is connected. For now, see'],
    ['으로 볼 수 있습니다.', 'で見られます。', '.'], ['. 챔피언십 포인트는 팀을 옮겨도 선수에게 남습니다.', '。チャンピオンシップポイントはチームを移っても選手に残ります。', '. Championship Points stay with the player across teams.'],
    ['대회 기록', '大会記録', 'Results'], ['대회 성적', '大会成績', 'Event results'], ['한국 팀 성적', '韓国チーム成績', 'Korean team results'], ['이전 시즌', '前シーズン', 'Previous seasons'], ['이 사이트가 모으지 않은 대회', 'このサイトが集めていない大会', 'Events this site doesn’t track'],
    ['Split {n} 플레이오프 조별 리그', 'Split {1} プレイオフ グループステージ', 'Split {1} Playoffs group stage'],
    // 방송
    ['멀티뷰', 'マルチビュー', 'Multiview'], ['공식 중계', '公式配信', 'Official broadcasts'], ['ALGS 멀티뷰', 'ALGSマルチビュー', 'ALGS Multiview'],
    ['화면 구성을 설명하는 예시 그림입니다. 실제 화면과 다를 수 있습니다.', '画面構成を説明するイメージ図です。実際の画面とは異なる場合があります。', 'Illustration of the layout; the real screen may differ.'],
    ['ALGS 공식 사이트의 관전 도구입니다. 메인 중계와 함께 원하는 팀의 화면을 골라 동시에 볼 수 있습니다.', 'ALGS公式サイトの観戦ツールです。メイン配信と一緒に好きなチームの視点を選んで同時に見られます。', 'The official ALGS viewing tool: watch the main broadcast alongside any teams’ POVs.'],
    ['한 번에 최대 {n}개 시점을 띄우고, 로비 {n}팀 누구든 고를 수 있습니다.', '一度に最大{1}視点を表示でき、ロビーの{2}チームから自由に選べます。', 'Up to {1} views at once, from any of the {2} teams in the lobby.'],
    ['팀 무전을 그대로 들을 수 있습니다.', 'チームのボイスもそのまま聞けます。', 'Hear team comms.'], ['맵 시점, 게임 중 실시간 순위와 스탯이 함께 나옵니다.', 'マップ視点、試合中のリアルタイム順位とスタッツも表示されます。', 'Map view plus live standings and stats.'], ['경기가 끝난 뒤에도 다시보기로 모든 시점을 볼 수 있습니다.', '試合後もリプレイですべての視点が見られます。', 'All views are available as replays afterwards.'], ['Twitch 계정으로 로그인하면 시청 보상(드롭)도 받을 수 있습니다.', 'Twitchアカウントでログインすると視聴報酬（ドロップ）も受け取れます。', 'Log in with Twitch to earn drops.'],
    ['멀티뷰 열기 (algs.ea.com)', 'マルチビューを開く（algs.ea.com）', 'Open Multiview (algs.ea.com)'], ['멀티뷰 화면 예시: 메인 중계, 팀 시점 {n}개, 맵 시점, 실시간 순위가 한 화면에 배치된 모습', 'マルチビュー画面の例: メイン配信、チーム視点{1}つ、マップ視点、リアルタイム順位を1画面に配置', 'Multiview example: main broadcast, {1} team POVs, map view and live standings on one screen'],
    ['영어 공식 중계', '英語公式配信', 'English broadcast'], ['국제전과 Americas·EMEA·APAC South 프로리그', '国際大会とAmericas・EMEA・APAC Southのプロリーグ', 'International events and the Americas, EMEA and APAC South Pro Leagues'], ['일본어 공식 중계 (RAGE)', '日本語公式配信（RAGE）', 'Japanese broadcast (RAGE)'], ['APAC North 프로리그와 국제전 일본어 방송', 'APAC Northプロリーグと国際大会の日本語配信', 'Japanese coverage of the APAC North Pro League and international events'],
    ['공식 파트너 워치 파티', '公式パートナーのウォッチパーティ', 'Official partner watch parties'], ['공식 일정에 파트너로 등록된 채널입니다.', '公式スケジュールにパートナーとして登録されたチャンネルです。', 'Channels registered as partners on the official schedule.'],
    ['한국 선수 개인 방송', '韓国人選手の個人配信', 'Korean player streams'], ['선수 CHZZK·YouTube 채널 제보하기', '選手のCHZZK・YouTubeチャンネルを知らせる', 'Share a player’s CHZZK/YouTube channel'], ['방송 채널 제보하기', '配信チャンネルを知らせる', 'Share a channel'],
    ['채움 칩은 확인된 채널(공식 API, Liquipedia 선수 페이지, 운영자 입력), 점선 칩은 확인된 채널이 없어 해당 플랫폼에서 이름으로 검색하는 링크입니다. 선수 개인 방송은 대회 규정상 지연이 걸려 있어, 이 사이트의 점수가 방송보다 먼저 바뀔 수 있습니다.', '塗りのチップは確認済みのチャンネル（公式API、Liquipedia選手ページ、運営者入力）、点線のチップは確認済みチャンネルがないため各プラットフォームで名前を検索するリンクです。選手の個人配信は大会規定で遅延があるため、このサイトのスコアが配信より先に変わることがあります。', 'Solid chips are verified channels (official API, Liquipedia, maintainer); dashed chips search the platform by name. Player streams are delayed by tournament rules, so scores here may update before the stream.'],
    ['확인된 채널이 없어 CHZZK에서 이름으로 검색합니다', '確認済みチャンネルがないためCHZZKで名前を検索します', 'No verified channel; searches CHZZK by name'], ['확인된 채널이 없어 YouTube에서 이름으로 검색합니다', '確認済みチャンネルがないためYouTubeで名前を検索します', 'No verified channel; searches YouTube by name'],
    // 규칙
    ['대회 방식', '大会方式', 'Format'], ['점수·포인트', 'スコア・ポイント', 'Scoring'],
    ['ALGS를 처음 보는 사람도 경기를 따라갈 수 있도록 핵심 규칙만 모았습니다. 자세한 기준은 맨 아래 공식 규정이 우선합니다.', 'ALGSを初めて見る人でも試合を追えるよう、要点だけをまとめました。詳細は一番下の公式規定が優先します。', 'The key rules so newcomers can follow ALGS. The official rules at the bottom take precedence.'],
    ['영상으로 보기', '動画で見る', 'Watch'], ['YouTube에서 보기', 'YouTubeで見る', 'Watch on YouTube'], ['{x} 재생', '{1} を再生', 'Play: {1}'],
    ['ALGS YEAR{n} 스플릿{n} 플레이오프에 대해 알아보자', 'ALGS YEAR{1} スプリット{2} プレイオフを知ろう', 'ALGS Year {1} Split {2} Playoffs explained'],
    ['{n}분 만에 ALGS 룰 알아보기: 레전드 밴 시스템', '{1}分でわかるALGSルール: レジェンドBAN', 'ALGS rules in {1} min: Legend bans'], ['{n}분 만에 ALGS 룰 알아보기: POI 드래프트', '{1}分でわかるALGSルール: POIドラフト', 'ALGS rules in {1} min: POI draft'],
    ['한 시즌의 흐름', '1シーズンの流れ', 'How a season works'],
    ['지역별 프로리그에서 성적을 내 플레이오프(국제전)에 나가고, 시즌 내내 모은 챔피언십 포인트로 챔피언십 직행 여부가 정해집니다.', '地域ごとのプロリーグで結果を出してプレイオフ（国際大会）に出場し、シーズンを通して集めたチャンピオンシップポイントでチャンピオンシップ直行が決まります。', 'Teams earn Playoffs (international) spots in regional Pro Leagues, and Championship Points collected all season decide direct Championship spots.'],
    ['게임 점수', '試合のスコア', 'Game scoring'], ['한 게임 점수 =', '1試合のスコア =', 'Game score ='], ['순위 점수 + 킬 {n}점', '順位点 + 1キル{1}点', 'placement + {1} per kill'], ['. 보통 한 시리즈는 {n}게임이고, 점수를 모두 더해 시리즈 순위를 정합니다.', '。通常1シリーズは{1}試合で、合計スコアでシリーズ順位を決めます。', '. A series is usually {1} games; the total decides the series ranking.'],
    ['지역마다 {n}팀이 A·B·C 세 조로 나뉘어 서로 돌아가며 붙습니다(시리즈 {n}번). 시리즈 순위마다 프로리그 포인트를 받고, 합계로 정규 시즌 순위를 냅니다.', '地域ごとに{1}チームがA・B・Cの3グループに分かれ、総当たりで対戦します（{2}シリーズ）。シリーズ順位ごとにプロリーグポイントを得て、合計でレギュラーシーズン順位を決めます。', '{1} teams per region in groups A, B and C play round-robin ({2} series). Each series awards Pro League points; the total sets the regular season standings.'],
    ['시리즈 순위별 포인트: {x}', 'シリーズ順位別ポイント: {1}', 'Points by series rank: {1}'], ['상위 {n}팀이 리전 결승(매치 포인트 방식)에 나갑니다.', '上位{1}チームがリージョナルファイナル（マッチポイント方式）に出場します。', 'The top {1} play the Regional Finals (match point format).'], ['정규 시즌 상위 팀과 리전 결승 우승팀이 플레이오프에 갑니다.', 'レギュラーシーズン上位チームとリージョナルファイナル優勝チームがプレイオフへ。', 'Top regular season teams and the Regional Finals winner go to the Playoffs.'],
    ['플레이오프·챔피언십 진행', 'プレイオフ・チャンピオンシップの進行', 'Playoffs and Championship format'], ['{n}팀이 조별 리그를 치른 뒤 브래킷으로 갈립니다.', '{1}チームがグループステージを戦った後、ブラケットに分かれます。', '{1} teams play a group stage, then split into a bracket.'],
    ['조별 리그 상위 {n}팀 → 승자 라운드, 하위 {n}팀 → 패자부활 {n}라운드', 'グループステージ上位{1}チーム → ウィナーズラウンド、下位{2}チーム → エリミネーションラウンド{3}', 'Group stage top {1} → Winners Round, bottom {2} → Elimination Round {3}'],
    ['승자 라운드 상위 {n}팀 → 결승, 하위 {n}팀 → 패자부활 {n}라운드', 'ウィナーズラウンド上位{1}チーム → 決勝、下位{2}チーム → エリミネーションラウンド{3}', 'Winners Round top {1} → Finals, bottom {2} → Elimination Round {3}'],
    ['패자부활 {n}라운드 상위 {n}팀 → 패자부활 {n}라운드, 하위 {n}팀 탈락', 'エリミネーションラウンド{1} 上位{2}チーム → エリミネーションラウンド{3}、下位{4}チーム敗退', 'Elimination Round {1} top {2} → Elimination Round {3}, bottom {4} out'],
    ['패자부활 {n}라운드 상위 {n}팀 → 결승, 하위 {n}팀 탈락', 'エリミネーションラウンド{1} 上位{2}チーム → 決勝、下位{3}チーム敗退', 'Elimination Round {1} top {2} → Finals, bottom {3} out'],
    ['결승 {n}팀은 매치 포인트 방식으로 우승을 가립니다.', '決勝の{1}チームはマッチポイント方式で優勝を決めます。', 'The {1} finalists play match point format for the title.'],
    ['순위 탭', '順位タブ', 'Standings tab'], ['에서 지금 진행 상황을 승자조·패자조로 볼 수 있습니다.', 'でウィナーズ・エリミネーションの進行状況が見られます。', ' shows live progress in the winners and elimination brackets.'],
    ['LCQ (Last Chance Qualifier)', 'LCQ（Last Chance Qualifier）', 'LCQ (Last Chance Qualifier)'],
    ['챔피언십 포인트로 직행하지 못한 프로리그 팀과 Split {n} 챌린저 서킷 상위 팀이 지역마다 {n}팀씩 나와 마지막 {n}자리(지역별 {n}팀)를 겨룹니다.', 'チャンピオンシップポイントで直行できなかったプロリーグのチームとSplit {1} チャレンジャーサーキット上位チームが地域ごとに{2}チーム出場し、最後の{3}枠（地域ごとに{4}チーム）を争います。', 'Pro League teams without a direct spot plus top Split {1} Challenger Circuit teams, {2} per region, fight for the last {3} spots ({4} per region).'],
    ['시드 순서대로 지그재그로 나눠 승자 {n}라운드 A·B로비(각 {n}팀)', 'シード順にジグザグで分けてウィナーズラウンド{1} ロビーA・B（各{2}チーム）', 'Split zigzag by seed into Winners Round {1} Lobbies A/B ({2} each)'],
    ['로비별 상위 {n}팀 → 승자 {n}라운드, 하위 {n}팀 → 패자부활 {n}라운드', 'ロビーごと上位{1}チーム → ウィナーズラウンド{2}、下位{3}チーム → エリミネーションラウンド{4}', 'Each lobby: top {1} → Winners Round {2}, bottom {3} → Elimination Round {4}'],
    ['승자 {n}라운드 상위 {n}팀 → 결승, 하위 {n}팀 → 패자부활 {n}라운드 / 패자부활 {n}라운드 상위 {n}팀 → 패자부활 {n}라운드', 'ウィナーズラウンド{1} 上位{2}チーム → 決勝、下位{3}チーム → エリミネーションラウンド{4} / エリミネーションラウンド{5} 上位{6}チーム → エリミネーションラウンド{7}', 'Winners Round {1}: top {2} → Finals, bottom {3} → Elimination Round {4} / Elimination Round {5}: top {6} → Elimination Round {7}'],
    ['패자부활 {n}라운드 상위 {n}팀 → 결승. 결승 {n}팀 매치 포인트, 상위 {n}팀이 챔피언십 진출', 'エリミネーションラウンド{1} 上位{2}チーム → 決勝。決勝{3}チームはマッチポイント、上位{4}チームがチャンピオンシップ進出', 'Elimination Round {1}: top {2} → Finals. {3} finalists play match point; the top {4} reach the Championship'],
    ['정해진 점수(보통 {n}점)를 넘긴 팀은', '決められた点数（通常{1}点）を超えたチームは', 'A team past the threshold (usually {1} pts) enters'], ['상태가 됩니다. 그 뒤 게임에서', '状態になります。その後の試合で', 'status. After that, a game'], ['{n}위(챔피언)', '{1}位（チャンピオン）', 'win (champion)'],
    ['를 하면 그 즉시 우승입니다. 매치 포인트 팀이 없거나 {n}위를 못 하면 게임을 계속합니다.', 'を取ればその時点で優勝です。マッチポイントのチームがいない、または{1}位を取れなければ試合を続けます。', ' takes the title on the spot. If no match point team wins a game, play continues.'],
    ['경기 화면의', '試合画面の', 'On match screens,'], ['는 매치 포인트 도달,', 'はマッチポイント到達、', ' means match point reached,'], ['은 우승을 뜻합니다.', 'は優勝を意味します。', ' means champion.'],
    ['챔피언십 포인트(CP)', 'チャンピオンシップポイント（CP）', 'Championship Points (CP)'], ['CP는', 'CPは', 'CP goes to'], ['선수 개인', '選手個人', 'individual players'], ['이 받습니다. 팀 CP는 현재 로스터에서 CP가 높은 선수 {n}명의 합입니다. 선수가 팀을 옮기면 CP도 따라갑니다.', 'が受け取ります。チームCPは現ロスターでCPが高い選手{1}人の合計です。選手がチームを移るとCPもついていきます。', '. Team CP is the sum of the {1} highest-CP players on the current roster; CP moves with the player.'],
    ['프로리그 최종 순위별({n}인): {x}', 'プロリーグ最終順位別（1人）: {2}', 'Pro League by final rank (per player): {2}'], ['플레이오프 최종 순위별({n}인): {x}', 'プレイオフ最終順位別（1人）: {2}', 'Playoffs by final rank (per player): {2}'],
    ['CP 상위 {n}팀은 챔피언십 직행, 나머지 {n}자리는 LCQ(지역별 {n}팀)에서 정합니다.', 'CP上位{1}チームはチャンピオンシップ直行、残り{2}枠はLCQ（地域ごとに{3}チーム）で決まります。', 'The top {1} by CP qualify directly; the other {2} spots come from the LCQs ({3} per region).'],
    ['CP가 같으면 ① Split {n} 플레이오프 최종 순위 ② 프로리그 Split {n} 최종 순위 ③ 프로리그 Split {n} 세부 기준 순으로 가립니다 (공식 규정 C{n}).', 'CPが同じ場合は ① Split {1} プレイオフ最終順位 ② プロリーグ Split {2} 最終順位 ③ プロリーグ Split {3} の詳細基準の順で決めます（公式規定C{4}）。', 'CP ties: ① Split {1} Playoffs final rank ② Pro League Split {2} final rank ③ Pro League Split {3} tiebreakers (official rule C{4}).'],
    ['포인트 탭', 'ポイントタブ', 'Points tab'], ['에서 현재 순위를 볼 수 있습니다.', 'で現在の順位が見られます。', ' shows the current standings.'],
    ['레전드 밴 · POI 드래프트', 'レジェンドBAN · POIドラフト', 'Legend bans · POI draft'], ['경기 전 일부 레전드를 쓸 수 없게 막는', '試合前に一部のレジェンドを使えなくする', 'Before play,'], ['레전드 밴', 'レジェンドBAN', 'legend bans'], ['과, 팀마다 맵의 낙하 지점(POI)을 순서대로 골라 가져가는', 'と、チームごとにマップの降下地点（POI）を順番に選ぶ', ' block some legends, and in the'], ['POI 드래프트', 'POIドラフト', 'POI draft'], ['가 있습니다. 진행 방식은 위 영상에서 {n}분 만에 볼 수 있습니다.', 'があります。進め方は上の動画で{1}分でわかります。', ' teams take turns picking drop spots (POIs). The videos above explain it in {1} minute.'],
    ['공식 규정과 참고 자료', '公式規定と参考資料', 'Official rules and references'], ['ALGS Year {n} 공식 규정 (Battlefy)', 'ALGS Year {1} 公式規定（Battlefy）', 'ALGS Year {1} official rules (Battlefy)'], ['ALGS 대회 구성 안내 (algs.ea.com)', 'ALGS大会構成の案内（algs.ea.com）', 'ALGS event structure (algs.ea.com)'],
    // 스포일러
    ['스포일러 방지 중 · 눌러서 이 대회 결과 보기', 'ネタバレ防止中 · タップしてこの大会の結果を見る', 'Spoilers hidden · tap to reveal this event'], ['{x} 가림', '{1}を非表示', '{1} hidden'],
    ['성적', '成績', 'Results'], ['관심 팀 성적', '注目チームの成績', 'Focus team results'], ['CP 위치', 'CPの位置', 'CP position'], ['챔피언십 포인트 순위', 'チャンピオンシップポイント順位', 'Championship Points standings'], ['결승 결과', '決勝結果', 'Finals result'], ['브래킷 결과', 'ブラケット結果', 'Bracket results'], ['조별 리그 순위', 'グループステージ順位', 'Group stage standings'], ['진출 결과', '進出結果', 'Advancement'], ['지역별 직행권 팀 수', '地域別直行チーム数', 'Direct spots by region'],
    // 갱신·출처
    ['{n}분 갱신', '{1}分ごと更新', 'every {1} min'], ['{n}초 전', '{1}秒前', '{1}s ago'], ['{n}분 전', '{1}分前', '{1}m ago'], ['{n}일 후', '{1}日後', 'in {1}d'], ['{n}시간 {n}분 후', '{1}時間{2}分後', 'in {1}h {2}m'], ['{n}분 후', '{1}分後', 'in {1}m'],
    ['점수 {n}초', 'スコア{1}秒', 'Scores {1}s'], ['순위·CP {n}초', '順位・CP {1}秒', 'Standings/CP {1}s'],
    ['진행 중인 시리즈 점수는 공식 API에서 약 {n}초마다, 순위·챔피언십 포인트·다음 단계 출전 명단은 {n}초마다(시리즈가 끝나는 순간에는 즉시) 공식 API에서 직접 받아 바꿉니다. Liquipedia 대조는 {n}분 주기 빌드에서 합니다. 마지막 빌드 {t}.', '進行中のシリーズのスコアは約{1}秒ごと、順位・チャンピオンシップポイント・次ステージの出場リストは{2}秒ごと（シリーズ終了時は即時）に公式APIから直接取得します。Liquipediaとの照合は{3}分ごとのビルドで行います。最終ビルド {4}。', 'Live series scores refresh from the official API about every {1}s; standings, Championship Points and next-stage entrants every {2}s (immediately when a series ends). Liquipedia checks run in the {3}-minute build. Last build {4}.'],
    ['경기 중: 진행 중인 시리즈만 공식 API에서 {n}초마다 확인 ({x}). 탭을 보고 있을 때만 확인합니다.', '試合中: 進行中のシリーズだけを公式APIから{1}秒ごとに確認（{2}）。タブを表示しているときだけ確認します。', 'During matches: live series only, every {1}s from the official API ({2}). Only while this tab is visible.'],
    ['브라우저에서 직접', 'ブラウザから直接', 'directly from your browser'], ['실시간 서버 경유', 'リアルタイムサーバー経由', 'via the live server'],
    ['확정값: 챔피언십 포인트·조별 리그 순위·출전 명단을 공식 API에서 {n}초마다, 시리즈 종료 즉시 다시 받음', '確定値: チャンピオンシップポイント・グループ順位・出場リストを公式APIから{1}秒ごと、シリーズ終了時は即時に再取得', 'Settled values: Championship Points, group standings and entrants every {1}s from the official API, and right after each series'],
    ['확정값: 챔피언십 포인트·조별 리그 순위·출전 명단을 공식 API에서 {n}초마다, 시리즈 종료 즉시 다시 받음 (마지막 {x})', '確定値: チャンピオンシップポイント・グループ順位・出場リストを公式APIから{1}秒ごと、シリーズ終了時は即時に再取得（最終 {2}）', 'Settled values: Championship Points, group standings and entrants every {1}s from the official API, and right after each series (last {2})'],
    ['확정값: 챔피언십 포인트·조별 리그 순위·출전 명단을 공식 API에서 {n}초마다, 시리즈 종료 즉시 다시 받음.', '確定値: チャンピオンシップポイント・グループ順位・出場リストを公式APIから{1}秒ごと、シリーズ終了時は即時に再取得。', 'Settled values: Championship Points, group standings and entrants every {1}s from the official API, and right after each series.'],
    ['확정값: 챔피언십 포인트·조별 리그 순위·출전 명단을 공식 API에서 {n}초마다, 시리즈 종료 즉시 다시 받음 (마지막 {x}).', '確定値: チャンピオンシップポイント・グループ順位・出場リストを公式APIから{1}秒ごと、シリーズ終了時は即時に再取得（最終 {2}）。', 'Settled values: Championship Points, group standings and entrants every {1}s from the official API, and right after each series (last {2}).'],
    ['{t}: 수집 안 됨', '{1}: 未取得', '{1}: not collected'],
    ['평상시: {n}분마다 자동 빌드 (GitHub 예약 실행이라 몇 분 늦어질 수 있음). 새 빌드는 {n}초 안에 화면에 반영됩니다.', '通常時: {1}分ごとに自動ビルド（GitHubの予約実行のため数分遅れることがあります）。新しいビルドは{2}秒以内に画面に反映されます。', 'Otherwise: automatic build every {1} min (GitHub scheduling can lag a few minutes). New builds show up within {2}s.'],
    ['지금 상태: 진행 중인 경기 없음', '現在: 進行中の試合なし', 'Now: no live matches'], ['지금 상태: 실시간 확인 중 ({n}개 시리즈, 마지막 {x})', '現在: ライブ確認中（{1}シリーズ、最終 {2}）', 'Now: live ({1} series, last {2})'], ['대기', '待機', 'waiting'],
    ['데이터 갱신: {t}', 'データ更新: {1}', 'Data updated: {1}'], ['ALGS 공식: {t}', 'ALGS公式: {1}', 'ALGS official: {1}'], ['수집 안 됨', '未取得', 'not collected'], ['출처 간 차이 {n}건 (Liquipedia 값 표시)', '出典間の差異{1}件（Liquipediaの値を表示）', '{1} differences between sources (Liquipedia shown)'],
    [', Battlefy. 갱신 {t}', '、Battlefy。更新 {1}', ', Battlefy. Updated {1}'], ['공식 API 확인', '公式API確認', 'official API'], ['{t} 공식 API 확인', '{1} 公式API確認', 'official API checked {1}'],
    // 일정 표기
    ['Split {n} 프로리그', 'Split {1} プロリーグ', 'Split {1} Pro League'], ['Split {n} 플레이오프', 'Split {1} プレイオフ', 'Split {1} Playoffs'], ['LCQ', 'LCQ', 'LCQ'],
    // 숫자 붙은 짧은 표기 (다른 틀보다 뒤)
    ['{n}위', '{1}位', '{1o}'], ['CP {n}위', 'CP {1}位', 'CP {1o}'], ['{n}위 {n}점 ({n}킬)', '{1}位 {2}pt（{3}キル）', '{1o} · {2} pts ({3} kills)'], ['이번 {x} +{n}', '今回 {1} +{2}', 'this event {1} +{2}'], ['S{n} PO {n}위', 'S{1} PO {2}位', 'S{1} PO {2o}'], ['S{n} PO {n}위 +{n}', 'S{1} PO {2}位 +{3}', 'S{1} PO {2o} +{3}'], ['{t} 진행 중', '{1} 進行中', '{1} live'],
    ['{n}점', '{1}pt', '{1} pts'], ['{n}위까지 −{n}', '{1}位まで −{2}', '−{2} to {1o}'], ['{n}위와 +{n}', '{1}位と +{2}', '+{2} over {1o}'], ['정규 {n}위', 'レギュラー{1}位', 'Reg. {1o}'], ['최종 {n}위', '最終{1}位', 'Final {1o}'], ['정규 {n}점', 'レギュラー{1}pt', 'Reg. {1} pts'],
    ['결승 {n}위', '決勝{1}位', 'Finals {1o}'], ['결승 {n}위 (실시간) +{n}', '決勝{1}位（ライブ）+{2}', 'Finals {1o} (live) +{2}'], ['결승 {n}위, 우승', '決勝{1}位、優勝', 'Finals {1o}, champion'], ['최소 +{n}', '最低 +{1}', 'min +{1}'],
    ['{n}시리즈', '{1}シリーズ', '{1} series'], ['{n}팀', '{1}チーム', '{1} teams'], ['{n}자리', '{1}枠', '{1} spots'], ['{n}게임', '{1}試合', '{1} games'], ['{n}명', '{1}人', '{1}'],
    ['{t} … ({n}위 {n})', '{1} …（{2}位 {3}）', '{1} … ({2o}: {3})'], [', 챔피언십 포인트 {n}위 ({t} CP)', '、チャンピオンシップポイント{1}位（{2} CP）', ', Championship Points {1o} ({2} CP)'],
    ['{x} {n}위, {x}', '{1} {2}位、{3}', '{1} {2o}, {3}'], ['{x} {n}위', '{1} {2}位', '{1} {2o}'], ['{x} 진출 예정, {x}', '{1} 進出予定、{2}', '{1} (advancing), {2}'], ['{x} 출전, {x}', '{1} 出場、{2}', '{1}, {2}'],
    ['{x} {n}위, {x}', '{1} {2}位、{3}', '{1} {2o}, {3}'], ['{x} 진행 중 (현재 {n}위 {n}점)', '{1} 進行中（現在{2}位 {3}pt）', '{1} live (now {2o}, {3} pts)'], ['{x} 진행 중 (현재 {n}위, 순위 {n} / 킬 {n} / 종합 {n}점)', '{1} 進行中（現在{2}位、順位 {3} / キル {4} / 総合 {5}点）', '{1} live (now {2o}, place {3} / kills {4} / total {5})'], ['{x} 진행 중', '{1} 進行中', '{1} live'],
  ];

  // 낱말 (마지막 수단: 위 사전에 없는 문장 조각)
  const W = [
    ['챔피언십 포인트', 'チャンピオンシップポイント', 'Championship Points'], ['매치 포인트 결승', 'マッチポイント決勝', 'Match Point Finals'], ['조별 리그', 'グループステージ', 'group stage'], ['패자부활', 'エリミネーション', 'Elimination'], ['승자 라운드', 'ウィナーズラウンド', 'Winners Round'],
    ['플레이오프', 'プレイオフ', 'Playoffs'], ['프로리그', 'プロリーグ', 'Pro League'], ['챔피언십', 'チャンピオンシップ', 'Championship'], ['라운드', 'ラウンド', 'Round'], ['결승', '決勝', 'Finals'], ['직행', '直行', 'direct'], ['진출', '進出', 'advance'], ['탈락', '敗退', 'out'], ['우승', '優勝', 'win'],
    ['한국', '韓国', 'Korea'], ['선수', '選手', 'player'], ['코치', 'コーチ', 'coach'], ['팀', 'チーム', 'team'], ['경기', '試合', 'match'], ['게임', '試合', 'game'], ['순위', '順位', 'rank'], ['점수', 'スコア', 'score'], ['시리즈', 'シリーズ', 'series'], ['지역', '地域', 'region'], ['대회', '大会', 'event'],
  ];

  // ---------------- 번역기 ----------------
  const NUM = '([+−-]?\\d[\\d,.:]*)';
  const ANY = '((?:(?!\\s·\\s|\\s\\/\\s).)+?)';
  const esc = (s) => s.replace(/[.*+?^$()|[\]\\]/g, '\\$&');
  const col = lang === 'ja' ? 1 : 2;
  const exact = new Map();
  const tpl = [];
  for (const row of D) {
    const [ko] = row, tgt = row[col];
    if (tgt == null) continue;
    if (!/\{[nxtw]\}/.test(ko)) { if (!exact.has(ko)) exact.set(ko, tgt); continue; }
    const kinds = [];
    const src = esc(ko).replace(/\{([nxtw])\}/g, (_, k) => { kinds.push(k); return k === 'n' ? NUM : k === 'w' ? '(\\S+?)' : ANY; }).replace(/ /g, '\\s+');
    tpl.push({ re: new RegExp(`^${src}$`), kinds, tgt, lit: ko.replace(/\{[nxtw]\}/g, '').length, key: ko.replace(/\{[nxtw]\}/g, '').replace(/[^가-힣]+/g, ' ').trim().split(' ')[0] || '' });
  }
  tpl.sort((a, b) => b.lit - a.lit);
  const words = W.map((w) => [w[0], w[col]]).sort((a, b) => b[0].length - a[0].length);
  const cache = new Map();
  const fill = (t, kinds, m) => t.replace(/\{(\d+)(o?)\}/g, (_, i, o) => { const v = m[+i]; if (v == null) return ''; const k = kinds[+i - 1]; const s = k === 'x' ? core(v) : v; return o && lang === 'en' ? ord(s) : s; });
  function core(c) {
    if (!HANGUL.test(c)) return c;
    if (exact.has(c)) return exact.get(c);
    for (const T of tpl) { if (T.key && !c.includes(T.key)) continue; const m = c.match(T.re); if (m) return fill(T.tgt, T.kinds, m); }
    // ' · ', ', ', ' / ', ' → ' 로 나눠 조각마다
    const parts = c.split(/(\s+·\s+|·\s+|\s+·|,\s+|\s+\/\s+|\s+→\s+)/);
    if (parts.length > 1) return parts.map((p, i) => (i % 2 ? (lang === 'ja' && /^,\s+$/.test(p) ? '、' : p) : core(p))).join('');
    // 낱말
    let out = c;
    for (const [k, v] of words) if (out.includes(k)) out = out.split(k).join(lang === 'en' ? ` ${v} ` : v);
    return out.replace(/\s{2,}/g, ' ').trim();
  }
  function t(s) {
    if (lang === 'ko' || s == null) return s;
    s = String(s);
    if (!HANGUL.test(s)) return s;
    if (cache.has(s)) return cache.get(s);
    const m = s.match(/^(\s*)([\s\S]*?)(\s*)$/);
    const r = m[1] + core(m[2].replace(/\s+/g, ' ')) + m[3];
    if (cache.size > 5000) cache.clear();
    cache.set(s, r);
    return r;
  }
  const ATTRS = ['title', 'aria-label', 'placeholder', 'alt'];
  function tree(root) {
    if (lang === 'ko' || !root) return;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let n;
    while ((n = w.nextNode())) if (HANGUL.test(n.nodeValue)) nodes.push(n);
    for (const x of nodes) { if (x.parentElement && x.parentElement.closest('script,style,[data-no-tr]')) continue; x.nodeValue = t(x.nodeValue); }
    const els = root.querySelectorAll ? [root, ...root.querySelectorAll('[title],[aria-label],[placeholder],[alt]')] : [];
    for (const el of els) for (const a of ATTRS) { const v = el.getAttribute && el.getAttribute(a); if (v && HANGUL.test(v)) el.setAttribute(a, t(v)); }
  }
  function setLang(l) {
    if (!LANGS[l]) return;
    try { localStorage.setItem(KEY, JSON.stringify(l)); } catch {}
    const u = new URL(location.href); u.searchParams.delete('lang');
    location.replace(u.toString());
    location.reload();
  }
  // 고정 영역(머리말·메뉴·바닥글·대화상자)과 문서 제목
  function chrome() {
    document.documentElement.lang = L.html;
    document.title = `${L.brand} · ${L.title}`;
    const md = document.querySelector('meta[name="description"]'); if (md) md.setAttribute('content', L.desc);
    const b = document.querySelector('.brand span'); if (b) b.textContent = L.brand;
    const ba = document.querySelector('.brand'); if (ba) ba.setAttribute('aria-label', `${L.brand} ${lang === 'ja' ? 'ホーム' : lang === 'en' ? 'home' : '홈'}`);
    for (const sel of ['.skip', '.top', '.tabbar', '.foot', '#feedback', '#settings']) tree(document.querySelector(sel));
    // 메뉴의 '팀'은 복수형 (표 머리글의 '팀'과 구분)
    const tm = document.querySelector('.tabbar a[data-tab="teams"]'); if (tm && lang === 'en') for (const n of tm.childNodes) if (n.nodeType === 3 && n.nodeValue.trim()) n.nodeValue = 'Teams';
    document.querySelectorAll('[data-lang]').forEach((x) => x.setAttribute('aria-current', String(x.dataset.lang === lang)));
  }
  window.I18N = { lang, LANGS, info: L, t, tree, setLang, chrome, ord };
})();
