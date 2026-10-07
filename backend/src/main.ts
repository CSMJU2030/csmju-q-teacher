import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { ROUTES_OUTSIDE_API_PREFIX, configureApp } from './app-setup';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const config = app.get(ConfigService);

  // /api/health and /api/v1/... (spec §20-§21). The SSO endpoints
  // (/auth/login, /auth/callback, /auth/logout) stay at the root path:
  // the callback is the URL registered for this subsystem in Core Hub.
  app.setGlobalPrefix('api', { exclude: ROUTES_OUTSIDE_API_PREFIX });

  // Validation - shared with the e2e suites.
  configureApp(app);

  app.enableShutdownHooks();

  const port = config.get<number>('port', 4224);
  await app.listen(port);

  const logger = new Logger('Bootstrap');
  logger.log(
    JSON.stringify({
      event: 'subsystem.started',
      subsystem: config.get<string>('subsystemId'),
      port,
      coreHubUrl: config.get<string>('coreHub.url'),
      coreHubWebUrl: config.get<string>('coreHub.webUrl'),
      jwksUrl: config.get<string>('coreHub.jwksUrl'),
      issuer: config.get<string>('coreHub.issuer'),
      audience: config.get<string>('coreHub.audience'),
    }),
  );
}

void bootstrap();
