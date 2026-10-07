import { INestApplication, RequestMethod, ValidationPipe } from '@nestjs/common';
import type { RouteInfo } from '@nestjs/common/interfaces';

/**
 * Routes that stay at the root instead of under the `/api` prefix: the central
 * SSO endpoints of auth-contract 5. /auth/callback is the URL registered for
 * this subsystem in the Core Hub Subsystem Registry, and /auth/login and
 * /auth/logout sit next to it.
 *
 * main.ts declares `setGlobalPrefix('api', ...)` itself - API-02 of
 * csmju2030-standards looks for it there - and the e2e suites pass this same
 * list, so neither can drift from the other.
 */
export const ROUTES_OUTSIDE_API_PREFIX: RouteInfo[] = [
  { path: 'auth/login', method: RequestMethod.GET },
  { path: 'auth/callback', method: RequestMethod.GET },
  { path: 'auth/logout', method: RequestMethod.POST },
];

/**
 * The rest of what main.ts applies before it listens, shared with the e2e
 * suites so they boot what production runs instead of a hand-copied
 * approximation.
 */
export function configureApp(app: INestApplication): void {
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
}
