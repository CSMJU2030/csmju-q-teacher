import { Global, Module } from '@nestjs/common';
import { AuthEventsLogger } from './auth-events.logger';
import { CoreHubTokenVerifier } from './core-hub-token.verifier';
import { JwksService } from './jwks.service';
import { MeController } from './me.controller';
import { SsoController } from './sso.controller';
import { CoreHubJwtGuard } from './guards/core-hub-jwt.guard';
import { PermissionsGuard } from './guards/permissions.guard';

/**
 * Core Hub integration module. It contains NO login form, registration,
 * password or session store - authentication happens at the Core Hub
 * (spec §7, §41). SsoController only redirects to Core Hub and turns the
 * verified Core Hub token into a cookie (auth-contract 5).
 */
@Global()
@Module({
  controllers: [MeController, SsoController],
  providers: [AuthEventsLogger, JwksService, CoreHubTokenVerifier, CoreHubJwtGuard, PermissionsGuard],
  exports: [AuthEventsLogger, JwksService, CoreHubTokenVerifier, CoreHubJwtGuard, PermissionsGuard],
})
export class AuthModule {}
