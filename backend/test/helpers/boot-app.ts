import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ROUTES_OUTSIDE_API_PREFIX, configureApp } from '../../src/app-setup';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { InMemoryPrisma } from './in-memory-prisma';

/**
 * Boots the real application - global guards, pipes, interceptor, filter, the
 * /api prefix and configureApp(), exactly as main.ts does - against an
 * in-memory database.
 *
 * `env` is applied only while the module compiles, which is when the
 * configuration is read, so a suite can boot e.g. a production instance
 * without leaking it into the next one.
 */
export async function bootApp(
  db: InMemoryPrisma,
  env: Record<string, string> = {},
): Promise<INestApplication> {
  const previous = new Map(Object.keys(env).map((key) => [key, process.env[key]]));
  Object.assign(process.env, env);

  try {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(db)
      .compile();

    const app = moduleRef.createNestApplication();
    // The same two calls main.ts makes.
    app.setGlobalPrefix('api', { exclude: ROUTES_OUTSIDE_API_PREFIX });
    configureApp(app);
    await app.init();
    return app;
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}
