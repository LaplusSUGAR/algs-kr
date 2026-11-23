// 배포 환경 설정. 빌드 없이 이 파일만 고치면 된다.
window.ALGS_CONFIG = {
  // 확정 데이터 버전 확인 주기. 수십 바이트짜리 ver.json만 확인하고, 바뀌었을 때만 데이터 파일을 다시 받는다.
  verUrl: 'data/ver.json',
  verPollMs: 30_000,

  // 경기 중 실시간 점수
  //   'direct' : 브라우저가 진행 중인 시리즈만 공식 API에서 직접 확인 (서버 불필요, 기본값)
  //   'worker' : worker/live-worker.js 를 배포했을 때. liveUrl에 Worker 주소 + /live.json
  //   'off'    : 실시간 끄기
  liveMode: 'direct',
  officialApi: 'https://prod-api.algstools.com/v1',
  liveUrl: '',
  livePollMs: 10_000, // 여기에 무작위 0~3초를 더해 요청이 한꺼번에 몰리지 않게 한다

  // 방송 상태 (지금 방송 중, 최근 영상). worker/streams 를 배포한 주소 + /streams.json. 비워 두면 기능이 꺼진다
  streamsUrl: 'https://algs-kr-streams.laplussugar.workers.dev/streams.json',
  streamsPollMs: 60_000,

  siteName: 'EASY ALGS KR',

  // 방문자 통계 (Cloudflare Web Analytics, 쿠키 없음). Cloudflare 대시보드 > Analytics & Logs > Web Analytics 에서
  // 사이트를 추가하고 받은 스니펫의 token 값을 넣는다. 비워 두면 통계 스크립트를 넣지 않는다.
  // 이 값은 페이지에 그대로 실리는 공개 값이다(비밀키 아님).
  cfBeaconToken: '',

  // 문의·피드백을 받을 곳.
  //   'github' : GitHub 이슈 작성 화면으로 보냄 (제목·내용 미리 채움, GitHub 계정 필요)
  //   구글 폼 주소를 넣으면 그 폼으로 보냄 (로그인 필요 없음) — 지금 쓰는 방식
  //   폼의 '미리 채우기'에서 얻은 항목 번호를 feedbackFormFields에 적으면 종류·보던 화면·대상·언어를 미리 채움
  //   폼 문항이나 선택지 글자를 바꾸면 feedbackKinds·feedbackLangs 도 같은 글자로 고칠 것 (다르면 미리 선택이 안 됨)
  feedback: 'https://docs.google.com/forms/d/e/1FAIpQLSdEZYIJ71kZitsZ3Se8ouroju9LuNoqhbXT6Y-OqnwBa3DH3A/viewform',
  feedbackRepo: 'LaplusSUGAR/algs-kr',
  feedbackFormFields: { kind: 'entry.1584639342', body: 'entry.2108601449', page: 'entry.403730710', lang: 'entry.2033145694' }, // 연락처(선택): entry.939533145
  feedbackKinds: { '데이터 오류': '데이터 오류 · Data error', '채널 제보': '채널 제보 · Channel tip', '기능 제안': '기능 제안 · Feature request', '기타': '기타 · Other' },
  feedbackLangs: { ko: '한국어', ja: '日本語', en: 'English' },
};
