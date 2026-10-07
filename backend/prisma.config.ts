import 'dotenv/config';
import { defineConfig } from 'prisma/config';

/**
 * Prisma 7 configuration for the Q-Teacher.
 *
 * It points at THIS repository's schema, migrations and seed, and it reads the
 * subsystem's own DATABASE_URL. It must never reference the Core Hub schema or
 * the Core Hub database.
 *
 * `datasource.url` is attached only when DATABASE_URL is actually set.
 *
 * Why: `prisma generate` runs from postinstall, which happens on a fresh clone
 * and on CI before anyone has written a `.env`. Declaring the datasource with
 * `env('DATABASE_URL')` made config loading throw
 * `PrismaConfigEnvError: Cannot resolve environment variable: DATABASE_URL`,
 * which failed `pnpm install` itself — so a clean clone could not even be
 * installed. Generating the client needs no database connection.
 *
 * Commands that really do need a database (`migrate`, `db seed`) still fail
 * loudly when it is missing, with Prisma's own message.
 */
const databaseUrl = process.env.DATABASE_URL;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'ts-node prisma/seed.ts',
  },
  ...(databaseUrl ? { datasource: { url: databaseUrl } } : {}),
});
