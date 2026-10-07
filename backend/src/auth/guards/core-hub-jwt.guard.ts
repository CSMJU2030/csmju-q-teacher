import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { AppException } from '../../common/errors';
import { AuthEventsLogger } from '../auth-events.logger';
import { TokenRejectionReason, TokenVerificationError } from '../auth.errors';
import { CoreHubIdentity } from '../core-hub-identity';
import { CoreHubTokenVerifier } from '../core-hub-token.verifier';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { mapCoreRoleToSubsystemRole } from '../role-mapping';
import { readCookie, ssoCookieNames } from '../sso-session';

/**
 * Authentication guard (spec §12).
 *
 * Reads the Bearer token, verifies it against the Core Hub JWKS and attaches
 * the verified identity to the request. Nothing from the request body or from
 * custom headers is ever trusted as identity (spec §8, §41.7-41.8).
 *
 * A browser that arrived through central SSO carries the same Core Hub token in
 * the HttpOnly `<name>_access_token` cookie instead of an Authorization
 * header; the cookie is accepted as a fallback and goes through exactly the
 * same verification (auth-contract 6). No other cookie is ever read - on
 * localhost the browser also sends Core Hub's own `csmju_*` cookies here.
 */
@Injectable()
export class CoreHubJwtGuard implements CanActivate {
  private readonly sessionCookie: string;

  constructor(
    private readonly reflector: Reflector,
    private readonly verifier: CoreHubTokenVerifier,
    private readonly authEvents: AuthEventsLogger,
    config: ConfigService,
  ) {
    this.sessionCookie = ssoCookieNames(
      config.get<string>('subsystemId', 'csmju-q-teacher'),
    ).session;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { user?: CoreHubIdentity }>();
    const token =
      this.extractBearerToken(request.header('authorization')) ??
      readCookie(request.header('cookie'), this.sessionCookie);

    if (!token) {
      this.authEvents.jwtRejected({
        reason: TokenRejectionReason.MISSING_TOKEN,
        path: request.path,
      });
      throw AppException.unauthorized('A Core Hub Bearer access token is required');
    }

    let payload;
    try {
      payload = await this.verifier.verify(token);
    } catch (error) {
      const reason =
        error instanceof TokenVerificationError
          ? error.reason
          : TokenRejectionReason.MALFORMED_TOKEN;
      const kid = error instanceof TokenVerificationError ? error.kid : undefined;

      this.authEvents.jwtRejected({ reason, kid, path: request.path });
      throw AppException.unauthorized('Invalid or expired Core Hub access token');
    }

    // Core role -> subsystem role. Authentication succeeded, so a role the
    // subsystem does not recognise is an AUTHORIZATION failure (403).
    const subsystemRole = mapCoreRoleToSubsystemRole(payload.role);
    if (!subsystemRole) {
      this.authEvents.roleMappingFailed({ sub: payload.sub, coreRole: payload.role });
      throw AppException.forbidden('Your Core Hub role has no access to this subsystem');
    }

    const identity: CoreHubIdentity = {
      id: payload.sub,
      email: payload.email ?? '',
      coreRole: payload.role as string,
      sessionId: payload.sid,
      subsystemRole,
      exp: payload.exp,
    };

    request.user = identity;
    // token ที่ตรวจผ่านแล้ว สำหรับส่งต่อไป Core Hub (reference data) — ห้าม log
    request.coreHubAccessToken = token;

    this.authEvents.jwtVerified({
      sub: identity.id,
      coreRole: identity.coreRole,
      subsystemRole: identity.subsystemRole,
    });

    return true;
  }

  /** `Authorization: Bearer <token>` - scheme match is case-insensitive. */
  private extractBearerToken(header: string | undefined): string | null {
    if (!header) {
      return null;
    }
    const [scheme, value, ...rest] = header.trim().split(/\s+/);
    if (rest.length > 0 || scheme?.toLowerCase() !== 'bearer' || !value) {
      return null;
    }
    return value;
  }
}
