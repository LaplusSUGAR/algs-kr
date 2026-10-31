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

  siteName: 'ALGS 코리아 트래커',
};
