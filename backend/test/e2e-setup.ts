/**
 * Static environment for the e2e suite. It runs before the test file (and thus
 * before AppModule is imported and its env validation executes).
 *
 * The DATABASE_URL below is never dialled: PrismaService is replaced with an
 * in-memory double inside the suite.
 */
process.env.NODE_ENV = 'test';
// ไม่ใส่ user:password ในโค้ด (กฎ SEC-01) — ชุดนี้ไม่ได้ต่อฐานข้อมูลจริงอยู่แล้ว
// เพราะ PrismaService ถูกแทนด้วย in-memory double
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://localhost:5434/csmju_q_teacher_test';
process.env.CORE_HUB_ISSUER = 'core-hub';
process.env.CORE_HUB_AUDIENCE = 'csmju2030';
process.env.JWKS_CACHE_TTL_MS = '60000';
process.env.JWKS_MIN_REFRESH_INTERVAL_MS = '1';
process.env.SUBSYSTEM_ID = 'csmju-q-teacher';
// Core Hub's web app: only ever a redirect target, never dialled by the tests.
process.env.CORE_HUB_WEB_URL = 'https://core-hub-web.test';
