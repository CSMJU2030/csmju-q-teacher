import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from './decorators/current-user.decorator';
import { CoreHubIdentity } from './core-hub-identity';

/**
 * GET /api/v1/me (spec §22)
 *
 * Proves the subsystem trusts the *verified* Core Hub identity: every field
 * below comes from a signature-checked JWT claim plus the subsystem's own
 * role mapping.
 *
 * `session.expiresAt` is the token's `exp` (auth-contract 5): a frontend can
 * renew ahead of it - through /auth/login - before showing a long form.
 */
@Controller('v1/me')
export class MeController {
  @Get()
  me(@CurrentUser() user: CoreHubIdentity) {
    return {
      id: user.id,
      email: user.email,
      coreRole: user.coreRole,
      subsystemRole: user.subsystemRole,
      session: {
        expiresAt: user.exp !== undefined ? new Date(user.exp * 1000).toISOString() : null,
      },
    };
  }
}
