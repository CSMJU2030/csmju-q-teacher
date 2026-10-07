/**
 * Writes backend/openapi.json from the running code (tech-stack.md 3, rule API-01).
 *
 *   pnpm run generate:openapi
 *
 * The frontend generates its API types from this file and CI fails when it is
 * out of date, so change an endpoint and commit the new openapi.json in the
 * same pull request.
 *
 * It never opens a database or a network connection: NestFactory.create wires
 * the providers but PrismaService only connects in onModuleInit, which runs on
 * init() / listen() - neither is called here. The output has no timestamps, so
 * running it twice gives the same bytes.
 */
import 'reflect-metadata';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

// Placeholders only so the configuration validates; nothing is ever dialled.
process.env.DATABASE_URL ??= 'postgresql://openapi@localhost:5432/never_connected';
process.env.SUBSYSTEM_ID ??= 'csmju-q-teacher';
process.env.NODE_ENV ??= 'development';

const SESSION_COOKIE = 'csmju_q_teacher_access_token';

/**
 * Two endpoints come from the shared layers that are copied unchanged from the
 * reference implementation (/api/health and /api/v1/me), so their response
 * shapes are described here instead of by decorators in those files.
 */
function describeSharedEndpoints(document: OpenAPIObject): void {
  const envelope = (data: Record<string, unknown>) => ({
    type: 'object',
    required: ['success', 'data'],
    properties: { success: { type: 'boolean', enum: [true] }, data: data },
  });
  const ok = (data: Record<string, unknown>) => ({
    '200': { description: '', content: { 'application/json': { schema: envelope(data) } } },
  });

  document.components = document.components ?? {};
  document.components.schemas = {
    ...document.components.schemas,
    HealthModel: {
      type: 'object',
      required: ['status', 'service'],
      properties: { status: { type: 'string', example: 'ok' }, service: { type: 'string', example: 'csmju-q-teacher' } },
    },
    MeModel: {
      type: 'object',
      required: ['id', 'email', 'coreRole', 'subsystemRole', 'session'],
      properties: {
        id: { type: 'string', description: 'ค่า sub ของผู้ใช้ใน Core Hub (ไม่ใช่ UUID เสมอไป)' },
        email: { type: 'string', description: 'ใช้แสดงผลเท่านั้น ห้ามใช้เป็นกุญแจ' },
        coreRole: { type: 'string', example: 'lecturer' },
        subsystemRole: { type: 'string', enum: ['STUDENT', 'TEACHER', 'ADMIN'] },
        session: {
          type: 'object',
          required: ['expiresAt'],
          properties: { expiresAt: { type: 'string', format: 'date-time', nullable: true } },
        },
      },
    },
  };

  const health = document.paths['/api/health']?.get;
  if (health) {
    health.summary = 'ตรวจสถานะระบบ (สาธารณะ)';
    health.responses = ok({ $ref: '#/components/schemas/HealthModel' });
  }
  const me = document.paths['/api/v1/me']?.get;
  if (me) {
    me.summary = 'ตัวตนของผู้ใช้ที่ login อยู่ (จาก token ที่ตรวจแล้ว)';
    me.responses = ok({ $ref: '#/components/schemas/MeModel' });
  }
}

async function main(): Promise<void> {
  // Imported after the placeholders above are set: the configuration reads them.
  const { AppModule } = await import('../src/app.module');
  const { ROUTES_OUTSIDE_API_PREFIX } = await import('../src/app-setup');

  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api', { exclude: ROUTES_OUTSIDE_API_PREFIX });

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Q-Teacher API')
      .setDescription(
        'ระบบนัดหมายเข้าพบอาจารย์ (CSMJU2030) — ตอบเป็น { success, data[, meta] } หรือ { success: false, error } ' +
          'ตามมาตรฐาน api-conventions.md · ต้องมี token ของ Core Hub ทุก endpoint ยกเว้น /api/health',
      )
      .setVersion('1.0.0')
      .addBearerAuth()
      .addCookieAuth(SESSION_COOKIE)
      .build(),
  );

  // The central SSO endpoints (/auth/login, /auth/callback, /auth/logout) are a
  // browser redirect flow, not part of the JSON API a frontend generates types for.
  for (const path of Object.keys(document.paths)) {
    if (path.startsWith('/auth/')) {
      delete document.paths[path];
    }
  }
  describeSharedEndpoints(document);

  writeFileSync(resolve(__dirname, '..', 'openapi.json'), `${JSON.stringify(document, null, 2)}\n`);
  await app.close();
  console.log('[openapi] wrote backend/openapi.json');
}

main().catch((error) => {
  console.error('[openapi] failed:', error);
  process.exitCode = 1;
});
