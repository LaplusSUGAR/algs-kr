// 경기 중 실시간 점수 Worker (Cloudflare Workers + Durable Objects)
//
// 동작 (보고서 "연결 방식 결정")
//   1. Cron(1분)이 공식 일정을 보고, 진행 중이거나 10분 안에 시작하는 시리즈가 있으면 Durable Object를 깨운다.
//   2. Durable Object는 알람으로 LIVE_INTERVAL_MS(기본 12초 + 무작위 0~3초)마다 진행 중 시리즈만 공식 API에서 조회한다.
//   3. 결과를 줄여 저장하고 GET /live.json 으로 내보낸다 (ETag, 304 지원). 브라우저는 10초마다 이 주소만 본다.
//   4. 진행 중 시리즈가 없으면 알람을 멈춘다. 확정값은 정기 빌드(Liquipedia 우선)가 덮어쓴다.
//
// 공식 API는 공개 문서가 없는 내부 API다. 응답이 이상하면 마지막 정상값을 유지하고 status를 'stale'로 표시한다.

const API = 'https://prod-api.algstools.com/v1';
const UA = 'algs-kr-fan-site-live/1.0 (+https://github.com/LaplusSUGAR/algs-kr)';

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const cors = { 'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*', 'Access-Control-Expose-Headers': 'ETag' };
    if (url.pathname === '/live.json') {
      const stub = env.LIVE.get(env.LIVE.idFromName('global'));
      const res = await stub.fetch('https://do/live.json', { headers: { 'If-None-Match': req.headers.get('If-None-Match') || '' } });
      const h = new Headers(res.headers);
      for (const [k, v] of Object.entries(cors)) h.set(k, v);
      h.set('Cache-Control', 'public, max-age=5');
      return new Response(res.body, { status: res.status, headers: h });
    }
    return new Response('not found', { status: 404 });
  },

  // wrangler.toml: crons = ["* * * * *"]
  async scheduled(_evt, env) {
    const stub = env.LIVE.get(env.LIVE.idFromName('global'));
    await stub.fetch('https://do/tick');
  },
};

export class LiveScores {
  constructor(state, env) { this.state = state; this.env = env; }

  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/tick') { await this.refreshSchedule(); return new Response('ok'); }
    if (url.pathname === '/live.json') {
      const data = (await this.state.storage.get('live')) || { v: '0', series: {}, updated: null };
      const etag = `"${data.v}"`;
      if (req.headers.get('If-None-Match') === etag) return new Response(null, { status: 304, headers: { ETag: etag } });
      return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json; charset=utf-8', ETag: etag } });
    }
    return new Response('not found', { status: 404 });
  }

  async api(path) {
    const r = await fetch(API + path, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    if (!r.ok) throw new Error(`${r.status} ${path}`);
    return r.json();
  }

  // 1분마다: 진행 중/임박 시리즈 목록 갱신, 필요하면 알람 시작
  async refreshSchedule() {
    const seasonId = this.env.SEASON_ID;
    let list = [];
    try { list = (await this.api(`/series/seasons/${seasonId}`)).series || []; } catch { return; }
    const t = Date.now();
    const active = list.filter((s) => s.status === 'live' || (s.status === 'pending' && new Date(s.startsAt) - t < 10 * 60e3 && new Date(s.startsAt) - t > -6 * 3600e3))
      .map((s) => s.id);
    await this.state.storage.put('active', active);
    if (active.length && !(await this.state.storage.getAlarm())) await this.state.storage.setAlarm(Date.now() + 1000);
  }

  // 진행 중 시리즈만 짧은 주기로 조회
  async alarm() {
    const active = (await this.state.storage.get('active')) || [];
    if (!active.length) return; // 알람 중단
    const prev = (await this.state.storage.get('live')) || { series: {} };
    const series = { ...prev.series };
    let stillLive = false;
    for (const id of active) {
      try {
        const st = await this.api(`/stats/series/${id}`);
        const status = st.seriesStatus || 'pending';
        if (status === 'live') stillLive = true;
        series[id] = {
          status,
          results: (st.teams || []).map((x) => ({ pos: x.position, short: x.shortName, pts: x.points, kills: x.kills, mp: !!x.matchPointEligible })),
          checkedAt: new Date().toISOString(),
        };
      } catch {
        if (series[id]) series[id].status = series[id].status === 'live' ? 'stale' : series[id].status;
      }
    }
    const body = JSON.stringify(series);
    const v = await sha1(body);
    if (v !== prev.v) await this.state.storage.put('live', { v, series, updated: new Date().toISOString() });
    const pendingSoon = active.some((id) => series[id]?.status === 'pending');
    if (stillLive || pendingSoon) {
      const base = Number(this.env.LIVE_INTERVAL_MS || 12000);
      await this.state.storage.setAlarm(Date.now() + base + Math.random() * 3000); // 공식 사이트처럼 무작위 지연
    }
  }
}

async function sha1(s) {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].slice(0, 6).map((b) => b.toString(16).padStart(2, '0')).join('');
}
