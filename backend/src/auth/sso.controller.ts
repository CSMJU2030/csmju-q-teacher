import { Controller, Get, Header, HttpStatus, Post, Query, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';

import { AppException, ErrorCode } from '../common/errors';
import { AuthEventsLogger } from './auth-events.logger';
import { TokenRejectionReason, TokenVerificationError } from './auth.errors';
import { CoreHubTokenPayload } from './core-hub-identity';
import { CoreHubTokenVerifier } from './core-hub-token.verifier';
import { Public } from './decorators/public.decorator';
import { SsoCallbackQueryDto } from './dto/sso-callback.dto';
import { SUBSYSTEM_BLOCKED_NEXT, safeNextPath } from './next-path';
import { mapCoreRoleToSubsystemRole } from './role-mapping';
import {
  SSO_STATE_COOKIE_PATH,
  SSO_STATE_TTL_SEC,
  buildCookieRemoval,
  buildSsoCookie,
  buildSsoStateCookie,
  createSsoState,
  readSsoState,
  ssoCookieNames,
  timingSafeEqualString,
} from './sso-session';

/** Logged instead of the request URL, whose query carries the access token. */
const CALLBACK_PATH = '/auth/callback';

/** Where a sign-in lands without a usable `next`: the frontend's home page. */
const DEFAULT_LANDING = '/';

/**
 * What a browser sees when its state does not check out (auth-contract 5.1):
 * a way back in, not raw JSON. The link starts a fresh sign-in.
 */
const SIGN_IN_AGAIN_PAGE = `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>เข้าสู่ระบบไม่สำเร็จ</title>
</head>
<body style="font-family: system-ui, sans-serif; max-width: 32rem; margin: 4rem auto; padding: 0 1rem; line-height: 1.6">
<h1>เข้าสู่ระบบไม่สำเร็จ</h1>
<p>การเข้าสู่ระบบครั้งนี้ไม่ได้เริ่มจากเบราว์เซอร์นี้ หรือใช้เวลาที่ Core Hub นานเกิน 10 นาที</p>
<p><a href="/auth/login">เข้าสู่ระบบอีกครั้ง</a></p>
</body>
</html>
`;

/**
 * Central SSO endpoints (auth-contract 5, SSO 1.1), all outside the `/api`
 * prefix and all public:
 *
 *   GET  /auth/login     starts every sign-in and mints the anti-forgery state
 *   GET  /auth/callback  the URL registered for this subsystem in Core Hub
 *   POST /auth/logout    drops this subsystem's cookies and signs out of Core Hub
 *
 * Every sign-in starts here, at /auth/login, because only the subsystem knows
 * which sign-ins it began - that is what protects the callback against login
 * CSRF. None of these endpoints shows a form: the password is only ever typed
 * at Core Hub (SEC-05).
 *
 * The subsystem keeps no session of its own. The verified Core Hub token is
 * the session, stored in an HttpOnly cookie that expires with it; when it
 * does, the frontend sends the browser through /auth/login again and Core Hub
 * renews it without asking for the password (silent re-SSO).
 *
 * Every handler ends its own response (`@Res()` without passthrough), so Nest
 * never writes a second one after a redirect. `@Header` is applied before the
 * validation pipe runs, so even a malformed request gets `no-store`.
 */
@Controller('auth')
export class SsoController {
  private readonly names: { session: string; state: string };

  constructor(
    private readonly verifier: CoreHubTokenVerifier,
    private readonly authEvents: AuthEventsLogger,
    private readonly config: ConfigService,
  ) {
    this.names = ssoCookieNames(this.subsystemId);
  }

  private get subsystemId(): string {
    return this.config.get<string>('subsystemId', 'csmju-q-teacher');
  }

  private get coreHubWebUrl(): string {
    return this.config.get<string>('coreHub.webUrl', 'http://localhost:3100');
  }

  private get secure(): boolean {
    return this.config.get<string>('nodeEnv') === 'production';
  }

  /**
   * Starts a sign-in: mints a single-use state, keeps it (with the page to
   * return to) in a cookie only the callback receives, and sends the browser
   * to Core Hub's web app, which signs the user in or renews their session.
   *
   * No callback_url is sent: Core Hub only ever redirects to the one in its
   * registry, and refuses a different one with 400.
   */
  @Public()
  @Get('login')
  @Header('Cache-Control', 'no-store')
  login(@Query('next') next: unknown, @Res() response: Response): void {
    const state = createSsoState();
    const landing = safeNextPath(next, SUBSYSTEM_BLOCKED_NEXT) ?? DEFAULT_LANDING;

    const target = new URL(`${this.coreHubWebUrl}/sso/authorize`);
    target.searchParams.set('subsystem', this.subsystemId);
    target.searchParams.set('state', state);

    response.setHeader(
      'Set-Cookie',
      buildSsoStateCookie(this.names.state, state, landing, SSO_STATE_TTL_SEC, this.secure),
    );
    response.redirect(HttpStatus.FOUND, target.toString());
  }

  /**
   * Where Core Hub sends the browser with a token. The answers follow the
   * table of auth-contract 5.1, in its order:
   *
   *  - no `access_token`: 400.
   *  - no `state`: Core Hub started this sign-in itself, e.g. a sidebar click.
   *    The token is dropped unused and the browser restarts at /auth/login,
   *    which comes back here with a state this subsystem can check. A link
   *    carrying an attacker's token therefore signs the victim in as the
   *    victim, never as the attacker.
   *  - a `state` without a matching state cookie: 401, and no redirect - if
   *    the browser refuses cookies, redirecting again would loop forever. A
   *    browser gets a page with a "sign in again" link instead of raw JSON.
   *  - a token that fails the ten checks: 401 · a role this subsystem does
   *    not accept: 403.
   *  - otherwise the token becomes the session cookie and the browser goes
   *    to the page it started from.
   *
   * No failure sets the session cookie. The URL carries the access token, so
   * it is never logged - only the path.
   */
  @Public()
  @Get('callback')
  @Header('Cache-Control', 'no-store')
  // The next page must not receive this token-bearing URL as its Referer.
  @Header('Referrer-Policy', 'no-referrer')
  async callback(
    @Req() request: Request,
    @Query() query: SsoCallbackQueryDto,
    @Res() response: Response,
  ): Promise<void> {
    // The state is single use whatever happens next, so its removal is set
    // before any check: every answer to a callback with a state burns it.
    // Without a state the cookie is left alone - another tab may be
    // mid-sign-in and waiting for its own callback.
    const stateRemoval =
      query.state !== undefined
        ? buildCookieRemoval(this.names.state, SSO_STATE_COOKIE_PATH, this.secure)
        : undefined;
    if (stateRemoval) {
      response.setHeader('Set-Cookie', [stateRemoval]);
    }

    if (!query.access_token) {
      this.authEvents.jwtRejected({ reason: TokenRejectionReason.MISSING_TOKEN, path: CALLBACK_PATH });
      throw new AppException(
        ErrorCode.VALIDATION_ERROR,
        'The callback carries no access_token',
        HttpStatus.BAD_REQUEST,
        ['access_token should not be empty'],
      );
    }

    if (query.state === undefined) {
      this.authEvents.jwtRejected({
        reason: TokenRejectionReason.SSO_RESTART_WITHOUT_STATE,
        path: CALLBACK_PATH,
      });
      response.redirect(HttpStatus.FOUND, '/auth/login');
      return;
    }

    const saved = readSsoState(request.header('cookie'), this.names.state);

    if (!saved || !timingSafeEqualString(saved.state, query.state)) {
      this.authEvents.jwtRejected({
        reason: saved
          ? TokenRejectionReason.SSO_STATE_MISMATCH
          : TokenRejectionReason.SSO_STATE_MISSING,
        path: CALLBACK_PATH,
      });

      // Typical causes: more than 10 minutes at Core Hub (a first MJU SSO
      // sign-in sets a password), or the site opened as 127.0.0.1 while the
      // callback is registered on localhost.
      if (request.accepts(['json', 'html']) === 'html') {
        response.status(HttpStatus.UNAUTHORIZED).type('html').send(SIGN_IN_AGAIN_PAGE);
        return;
      }
      throw AppException.unauthorized(
        'This sign-in did not start here or took too long. Start again at /auth/login.',
      );
    }

    const payload = await this.verifyOrThrow(query.access_token);
    const subsystemRole = mapCoreRoleToSubsystemRole(payload.role);

    if (!subsystemRole) {
      this.authEvents.roleMappingFailed({ sub: payload.sub, coreRole: payload.role });
      throw AppException.forbidden('Your Core Hub role has no access to this subsystem');
    }

    response.setHeader('Set-Cookie', [
      stateRemoval as string,
      buildSsoCookie(
        this.names.session,
        query.access_token,
        this.remainingLifetimeSec(payload.exp),
        this.secure,
      ),
    ]);

    this.authEvents.jwtVerified({ sub: payload.sub, coreRole: payload.role, subsystemRole });

    // The landing came back from a cookie, so it is checked again here.
    response.redirect(
      HttpStatus.FOUND,
      safeNextPath(saved.landing, SUBSYSTEM_BLOCKED_NEXT) ?? DEFAULT_LANDING,
    );
  }

  /**
   * Signs out everywhere. Dropping only this subsystem's cookies would be
   * undone by the next click, which Core Hub - still signed in - would answer
   * with a fresh token. So the browser goes on to Core Hub's /logout, where
   * the user confirms ending the Core Hub session.
   *
   * Public on purpose: it must work with an expired or missing session, and
   * all it does is clear this subsystem's own cookies.
   */
  @Public()
  @Post('logout')
  @Header('Cache-Control', 'no-store')
  logout(@Res() response: Response): void {
    response.setHeader('Set-Cookie', [
      buildCookieRemoval(this.names.session, '/', this.secure),
      buildCookieRemoval(this.names.state, SSO_STATE_COOKIE_PATH, this.secure),
    ]);
    response.redirect(HttpStatus.SEE_OTHER, `${this.coreHubWebUrl}/logout`);
  }

  private async verifyOrThrow(token: string): Promise<CoreHubTokenPayload> {
    try {
      return await this.verifier.verify(token);
    } catch (error) {
      const reason =
        error instanceof TokenVerificationError
          ? error.reason
          : TokenRejectionReason.MALFORMED_TOKEN;
      const kid = error instanceof TokenVerificationError ? error.kid : undefined;

      this.authEvents.jwtRejected({ reason, kid, path: CALLBACK_PATH });

      throw AppException.unauthorized('The Core Hub SSO token could not be verified');
    }
  }

  private remainingLifetimeSec(exp: number | undefined): number {
    if (typeof exp !== 'number') {
      return 0;
    }

    return Math.max(0, exp - Math.floor(Date.now() / 1000));
  }
}
