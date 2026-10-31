// 배포 환경 설정. 빌드 없이 이 파일만 고치면 된다.
window.ALGS_CONFIG = {
  // 데이터 버전 확인 주기 (정적 데이터 재로드). OWticker처럼 수십 바이트짜리 ver.json만 확인한다.
  verUrl: 'data/ver.json',
  verPollMs: 60_000,
  // 경기 중 실시간 점수 (worker/live-worker.js 배포 후 주소 입력). 비워 두면 실시간 오버레이를 쓰지 않는다.
  liveUrl: '',
  livePollMs: 10_000,
  // 사이트 표시 이름
  siteName: 'ALGS 코리아 트래커',
};
