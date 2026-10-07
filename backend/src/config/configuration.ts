/**
 * All environment-specific values live here. Nothing in the application code
 * may hard-code a URL, issuer, audience or secret (spec §30, §41.15).
 */
export interface AppConfig {
  nodeEnv: string;
  port: number;
  subsystemId: string;
  subsystemName: string;
  coreHub: {
    url: string;
    /** Core Hub's web app, where /auth/login and /auth/logout send the browser. */
    webUrl: string;
    jwksUrl: string;
    issuer: string;
    audience: string;
    jwksCacheTtlMs: number;
    jwksMinRefreshIntervalMs: number;
    jwksRequestTimeoutMs: number;
    clockToleranceSec: number;
    /** Reference data cache (SHARED_DATA_HANDOFF ข้อ 6.4) */
    dataCacheTtlMs: number;
    dataMinRefreshIntervalMs: number;
    dataRequestTimeoutMs: number;
  };
}

function num(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export default (): AppConfig => {
  const coreHubUrl = process.env.CORE_HUB_URL ?? 'http://localhost:3000';

  return {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port: num(process.env.PORT, 4224),
    subsystemId: process.env.SUBSYSTEM_ID ?? 'csmju-q-teacher',
    subsystemName: process.env.SUBSYSTEM_NAME ?? 'CSMJU Q-Teacher',
    coreHub: {
      url: coreHubUrl,
      // On the real server the web app and the API share one origin.
      webUrl: (process.env.CORE_HUB_WEB_URL ?? coreHubUrl).replace(/\/+$/, ''),
      jwksUrl:
        process.env.CORE_HUB_JWKS_URL ??
        `${coreHubUrl.replace(/\/+$/, '')}/api/v1/.well-known/jwks.json`,
      issuer: process.env.CORE_HUB_ISSUER ?? 'core-hub',
      audience: process.env.CORE_HUB_AUDIENCE ?? 'csmju2030',
      jwksCacheTtlMs: num(process.env.JWKS_CACHE_TTL_MS, 10 * 60 * 1000),
      jwksMinRefreshIntervalMs: num(process.env.JWKS_MIN_REFRESH_INTERVAL_MS, 30 * 1000),
      jwksRequestTimeoutMs: num(process.env.JWKS_REQUEST_TIMEOUT_MS, 5000),
      clockToleranceSec: num(process.env.JWT_CLOCK_TOLERANCE_SEC, 5),
      dataCacheTtlMs: num(process.env.CORE_HUB_DATA_CACHE_TTL_MS, 10 * 60 * 1000),
      dataMinRefreshIntervalMs: num(process.env.CORE_HUB_DATA_MIN_REFRESH_INTERVAL_MS, 30 * 1000),
      dataRequestTimeoutMs: num(process.env.CORE_HUB_DATA_REQUEST_TIMEOUT_MS, 5000),
    },
  };
};
