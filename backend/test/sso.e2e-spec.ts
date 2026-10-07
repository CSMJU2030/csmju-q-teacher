/**
 * Central SSO 1.1 - the subsystem side (e2e), auth-contract 1.2 section 5:
 *
 *   GET  /auth/login     mints a state and its cookie -> 302 Core Hub web /sso/authorize
 *   GET  /auth/callback  every row of the table in 5.1
 *   POST /auth/logout    clears both cookies -> 303 Core Hub web /logout
 *
 * The suite plays the browser and Core Hub's web app: it reads the state from
 * the /auth/login redirect and the state cookie from its Set-Cookie, then
 * calls the callback the way the browser does after Core Hub's redirect.
 *
 * Runs against a fake Core Hub (JWKS + people) and an in-memory database
 * double - no PostgreSQL and no real Core Hub required.
 */
import { INestApplication, Logger } from '@nestjs/common';
import { decodeJwt } from 'jose';
import request from 'supertest';
import { bootApp } from './helpers/boot-app';
import { FakeCoreHub } from './helpers/fake-core-hub';
import { InMemoryPrisma } from './helpers/in-memory-prisma';
import {
  TestSigningKey,
  createAlgNoneToken,
  createSigningKey,
  signCoreHubToken,
  signHs256Token,
  tamperPayload,
} from './helpers/token-factory';

const SUBSYSTEM_ID = 'csmju-q-teacher';
const CORE_HUB_WEB_URL = 'https://core-hub-web.test'; // test/e2e-setup.ts
const SESSION_COOKIE = 'csmju_q_teacher_access_token';
const STATE_COOKIE = 'csmju_q_teacher_sso_state';

const STUDENT_CORE_ID = 'user-002';
const STAFF_CORE_ID = 'user-003';

/** What a browser sends to a page. */
const BROWSER_ACCEPT = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';

// ------------------------------------------------------------ cookie helpers --

const setCookies = (response: request.Response): string[] => {
  const raw = response.headers['set-cookie'];
  return Array.isArray(raw) ? raw : raw ? [raw as unknown as string] : [];
};

const cookieNamed = (response: request.Response, name: string): string | undefined =>
  setCookies(response).find((entry) => entry.startsWith(`${name}=`));

const isRemoval = (cookie: string | undefined): boolean => /Max-Age=0(;|$)/.test(cookie ?? '');

/** The response sets the cookie to a value (as opposed to expiring it). */
const setsCookie = (response: request.Response, name: string): boolean => {
  const cookie = cookieNamed(response, name);
  return cookie !== undefined && !isRemoval(cookie);
};

/** The response expires the cookie. */
const burnsCookie = (response: request.Response, name: string): boolean =>
  isRemoval(cookieNamed(response, name));

/** `name=value` of a Set-Cookie line, as the browser sends it back. */
const pair = (setCookie: string | undefined): string => (setCookie ?? '').split(';')[0];

const maxAgeOf = (setCookie: string | undefined): number =>
  Number(/Max-Age=(\d+)/.exec(setCookie ?? '')?.[1]);

/** The `next` stored in a state cookie: `<state>.<next as base64url>`. */
const landingOf = (stateCookie: string): string => {
  const value = decodeURIComponent(pair(stateCookie).slice(STATE_COOKIE.length + 1));
  return Buffer.from(value.split('.')[1] ?? '', 'base64url').toString('utf8');
};

describe('Central SSO 1.1 (e2e)', () => {
  let app: INestApplication;
  let coreHub: FakeCoreHub;
  let db: InMemoryPrisma;
  let key: TestSigningKey;

  let studentToken: string;
  let staffToken: string;

  const server = () => app.getHttpServer();

  /** Step 1, as a browser: GET /auth/login, keeping what Core Hub web would receive. */
  async function beginLogin(next?: string) {
    const response = await request(server())
      .get('/auth/login')
      .query(next === undefined ? {} : { next });
    const location = new URL(response.headers.location ?? 'about:blank');
    const stateCookie = cookieNamed(response, STATE_COOKIE) ?? '';

    return {
      response,
      location,
      state: location.searchParams.get('state') ?? '',
      stateCookie,
      cookie: pair(stateCookie),
    };
  }

  /** Step 3, as a browser coming back from Core Hub. */
  const callback = (
    query: Record<string, string>,
    options: { cookie?: string; accept?: string } = {},
  ) => {
    const call = request(server()).get('/auth/callback').query(query);
    if (options.cookie) call.set('Cookie', options.cookie);
    if (options.accept) call.set('Accept', options.accept);
    return call;
  };

  /** A full, successful sign-in; returns the callback response. */
  async function signIn(token: string, next?: string) {
    const login = await beginLogin(next);
    return callback(
      { access_token: token, token_type: 'Bearer', expires_in: '900', state: login.state },
      { cookie: login.cookie },
    );
  }

  beforeAll(async () => {
    key = await createSigningKey('core-hub-2026');

    coreHub = new FakeCoreHub();
    await coreHub.start([key]);
    coreHub.setPeople({
      [STUDENT_CORE_ID]: { personCode: '6704101312', personType: 'STUDENT', status: 'ACTIVE', coreUserId: STUDENT_CORE_ID },
    });

    process.env.CORE_HUB_URL = coreHub.url;
    process.env.CORE_HUB_JWKS_URL = coreHub.jwksUrl;

    db = new InMemoryPrisma();
    app = await bootApp(db);

    studentToken = await signCoreHubToken(key, {
      sub: STUDENT_CORE_ID,
      email: 'student@core.local',
      role: 'student',
    });
    staffToken = await signCoreHubToken(key, {
      sub: STAFF_CORE_ID,
      email: 'lecturer@core.local',
      role: 'lecturer',
    });
  });

  beforeEach(() => {
    db.reset();
  });

  afterAll(async () => {
    await app?.close();
    await coreHub?.stop();
  });

  // ---------------------------------------------------------- /auth/login --
  describe('GET /auth/login (auth-contract 5.2)', () => {
    it('sends the browser to Core Hub web /sso/authorize with the subsystem and a state', async () => {
      const { response, location, state } = await beginLogin('/bookings');

      expect(response.status).toBe(302);
      expect(`${location.origin}${location.pathname}`).toBe(`${CORE_HUB_WEB_URL}/sso/authorize`);
      expect(location.searchParams.get('subsystem')).toBe(SUBSYSTEM_ID);
      // 32 random bytes as base64url = 43 characters.
      expect(state).toMatch(/^[A-Za-z0-9_-]{43,}$/);
      // Core Hub only ever uses the registered callback.
      expect(location.searchParams.has('callback_url')).toBe(false);
      expect([...location.searchParams.keys()].sort()).toEqual(['state', 'subsystem']);
      expect(response.headers['cache-control']).toBe('no-store');
    });

    it('keeps the state and next in an HttpOnly cookie only the callback receives', async () => {
      const { stateCookie, state } = await beginLogin('/schedule?tab=week');

      expect(pair(stateCookie)).toBe(
        `${STATE_COOKIE}=${state}.${Buffer.from('/schedule?tab=week').toString('base64url')}`,
      );
      expect(stateCookie).toContain('HttpOnly');
      expect(stateCookie).toContain('SameSite=Lax');
      expect(stateCookie).toContain('Path=/auth/callback');
      expect(maxAgeOf(stateCookie)).toBeGreaterThan(0);
      expect(maxAgeOf(stateCookie)).toBeLessThanOrEqual(600);
      // Development serves plain http://localhost.
      expect(stateCookie).not.toContain('Secure');
    });

    it('mints a fresh state for every sign-in', async () => {
      const first = await beginLogin();
      const second = await beginLogin();

      expect(first.state).not.toBe(second.state);
    });

    it('lands on the home page when no next is given', async () => {
      const { stateCookie } = await beginLogin();

      expect(landingOf(stateCookie)).toBe('/');
    });

    it.each([
      ['protocol-relative', '//evil.example.com'],
      ['backslash host', '/\\evil.example.com'],
      ['absolute URL', 'https://evil.example.com/steal'],
      ['javascript URL', 'javascript:alert(1)'],
      ['relative path', 'bookings'],
      ['the login route', '/auth/login'],
      ['the callback', '/auth/callback?access_token=x'],
      ['the auth prefix', '/auth'],
      ['a control character', '/bookings\u0000'],
      ['more than 512 characters', `/${'a'.repeat(512)}`],
    ])('refuses a next that is %s and keeps the home page instead', async (_label, next) => {
      const { response, stateCookie } = await beginLogin(next);

      expect(response.status).toBe(302);
      expect(landingOf(stateCookie)).toBe('/');
    });
  });

  // ------------------------------------------------------- /auth/callback --
  describe('GET /auth/callback (auth-contract 5.1)', () => {
    describe('row 1 - no access_token', () => {
      it('answers 400 and sets no cookie', async () => {
        const response = await callback({}).expect(400);

        expect(response.body.error.code).toBe('VALIDATION_ERROR');
        expect(setCookies(response)).toEqual([]);
        expect(response.headers['cache-control']).toBe('no-store');
        expect(response.headers['referrer-policy']).toBe('no-referrer');
      });

      it('still burns the state cookie when a state came along', async () => {
        const login = await beginLogin();

        const response = await callback({ state: login.state }, { cookie: login.cookie }).expect(
          400,
        );

        expect(burnsCookie(response, STATE_COOKIE)).toBe(true);
        expect(setsCookie(response, SESSION_COOKIE)).toBe(false);
      });
    });

    describe('row 2 - no state (the sign-in started at Core Hub, e.g. its sidebar)', () => {
      it('drops the token, sets no cookie at all and restarts at /auth/login', async () => {
        const login = await beginLogin();

        const response = await callback(
          { access_token: staffToken, token_type: 'Bearer', expires_in: '900' },
          // Another tab may be waiting for its own callback with this cookie.
          { cookie: login.cookie, accept: BROWSER_ACCEPT },
        ).expect(302);

        expect(response.headers.location).toBe('/auth/login');
        expect(setCookies(response)).toEqual([]);
        expect(response.headers['cache-control']).toBe('no-store');
        expect(response.headers['referrer-policy']).toBe('no-referrer');
      });

      it("never turns an attacker's token into the victim's session", async () => {
        const attackerToken = await signCoreHubToken(key, { sub: 'user-666', role: 'admin' });

        const response = await callback({ access_token: attackerToken }).expect(302);

        expect(setsCookie(response, SESSION_COOKIE)).toBe(false);
      });
    });

    describe('row 3 - a state without its cookie, or a different one', () => {
      it('answers 401 when the state cookie is missing, without a redirect', async () => {
        const login = await beginLogin();

        const response = await callback({ access_token: staffToken, state: login.state }).expect(401);

        expect(response.body.error.code).toBe('UNAUTHORIZED');
        expect(response.headers.location).toBeUndefined();
        expect(burnsCookie(response, STATE_COOKIE)).toBe(true);
        expect(setsCookie(response, SESSION_COOKIE)).toBe(false);
      });

      it('answers 401 when the state belongs to another sign-in', async () => {
        const first = await beginLogin();
        const second = await beginLogin();

        const response = await callback(
          { access_token: staffToken, state: first.state },
          { cookie: second.cookie },
        ).expect(401);

        expect(response.body.error.code).toBe('UNAUTHORIZED');
        expect(response.headers.location).toBeUndefined();
        expect(burnsCookie(response, STATE_COOKIE)).toBe(true);
        expect(setsCookie(response, SESSION_COOKIE)).toBe(false);
      });

      it('shows a browser a page with a "sign in again" link instead of JSON', async () => {
        const login = await beginLogin();

        const response = await callback(
          { access_token: staffToken, state: login.state },
          { accept: BROWSER_ACCEPT },
        ).expect(401);

        expect(response.headers['content-type']).toMatch(/^text\/html/);
        expect(response.text).toContain('เข้าสู่ระบบอีกครั้ง');
        expect(response.text).toContain('href="/auth/login"');
        expect(response.headers.location).toBeUndefined();
        expect(burnsCookie(response, STATE_COOKIE)).toBe(true);
        expect(setsCookie(response, SESSION_COOKIE)).toBe(false);
        expect(response.headers['cache-control']).toBe('no-store');
        expect(response.headers['referrer-policy']).toBe('no-referrer');
      });
    });

    describe('row 4 - a token that fails the ten checks (state valid)', () => {
      it.each<[string, () => Promise<string> | string]>([
        ['a tampered token', () => tamperPayload(studentToken, { role: 'admin' })],
        ['an expired token', () => signCoreHubToken(key, { expiresInSec: -60, issuedAtOffsetSec: -600 })],
        ['an HS256 token', () => signHs256Token()],
        ['an alg=none token', () => createAlgNoneToken()],
        ['a token from an unknown key', async () => signCoreHubToken(await createSigningKey('core-hub-1999'))],
        ['a token from another issuer', () => signCoreHubToken(key, { issuer: 'evil-hub' })],
        ['a refresh-token-like 7-day token (step 9)', () => signCoreHubToken(key, { expiresInSec: 7 * 86_400 })],
        ['a token without iat (step 9)', () => signCoreHubToken(key, { omitIat: true })],
        ['a token issued for another subsystem (step 10)', () => signCoreHubToken(key, { azp: 'csmju-equipment' })],
        ['a token that is not a JWT', () => 'not-a-jwt'],
      ])('answers 401 for %s, with no session cookie', async (_label, makeToken) => {
        const login = await beginLogin();

        const response = await callback(
          { access_token: await makeToken(), state: login.state },
          { cookie: login.cookie },
        ).expect(401);

        expect(response.body.error.code).toBe('UNAUTHORIZED');
        expect(burnsCookie(response, STATE_COOKIE)).toBe(true);
        expect(setsCookie(response, SESSION_COOKIE)).toBe(false);
      });
    });

    describe('row 5 - a role this subsystem does not accept', () => {
      it('answers 403 with no session cookie', async () => {
        const login = await beginLogin();
        const token = await signCoreHubToken(key, { role: 'finance-officer' });

        const response = await callback(
          { access_token: token, state: login.state },
          { cookie: login.cookie },
        ).expect(403);

        expect(response.body.error.code).toBe('FORBIDDEN');
        expect(burnsCookie(response, STATE_COOKIE)).toBe(true);
        expect(setsCookie(response, SESSION_COOKIE)).toBe(false);
      });
    });

    describe('row 6 - everything checks out', () => {
      it('sets the session cookie and returns the browser to its next', async () => {
        const response = await signIn(staffToken, '/bookings?status=CONFIRMED');

        expect(response.status).toBe(302);
        expect(response.headers.location).toBe('/bookings?status=CONFIRMED');
        expect(response.headers['cache-control']).toBe('no-store');
        expect(response.headers['referrer-policy']).toBe('no-referrer');
        expect(burnsCookie(response, STATE_COOKIE)).toBe(true);

        const session = cookieNamed(response, SESSION_COOKIE);
        expect(pair(session)).toBe(`${SESSION_COOKIE}=${staffToken}`);
        expect(session).toContain('HttpOnly');
        expect(session).toContain('SameSite=Lax');
        expect(session).toContain('Path=/');
        expect(session).not.toContain('Secure');
      });

      it('lets the session cookie live exactly as long as the token', async () => {
        const response = await signIn(staffToken);
        const remaining = (decodeJwt(staffToken).exp as number) - Math.floor(Date.now() / 1000);

        // Counted at the callback, a moment before `remaining` was.
        const maxAge = maxAgeOf(cookieNamed(response, SESSION_COOKIE));
        expect(maxAge).toBeGreaterThanOrEqual(remaining);
        expect(maxAge).toBeLessThanOrEqual(remaining + 5);
      });

      it('lands on the home page when the sign-in had no next', async () => {
        const response = await signIn(staffToken);

        expect(response.headers.location).toBe('/');
      });

      it('checks the stored next again, since it came back from a cookie', async () => {
        const state = 'a'.repeat(43);
        const forged = `${STATE_COOKIE}=${state}.${Buffer.from('//evil.example.com').toString('base64url')}`;

        const response = await callback(
          { access_token: staffToken, state },
          { cookie: forged },
        ).expect(302);

        expect(response.headers.location).toBe('/');
        expect(setsCookie(response, SESSION_COOKIE)).toBe(true);
      });

      it('answers with a single response (no second write after the redirect)', async () => {
        const errors = jest.spyOn(Logger.prototype, 'error');

        try {
          const response = await signIn(staffToken, '/bookings');
          expect(response.status).toBe(302);

          // A handler that let Nest write its result after the redirect would
          // fail with ERR_HTTP_HEADERS_SENT, which lands in the error log.
          await new Promise((resolve) => setImmediate(resolve));
          expect(errors).not.toHaveBeenCalled();
        } finally {
          errors.mockRestore();
        }
      });

      it('lets the session cookie alone reach /api/v1/me, which reports when it expires', async () => {
        const response = await signIn(studentToken);

        const me = await request(server())
          .get('/api/v1/me')
          .set('Cookie', pair(cookieNamed(response, SESSION_COOKIE)))
          .expect(200);

        expect(me.body.data).toMatchObject({
          id: STUDENT_CORE_ID,
          coreRole: 'student',
          subsystemRole: 'STUDENT',
          session: {
            expiresAt: new Date((decodeJwt(studentToken).exp as number) * 1000).toISOString(),
          },
        });
      });
    });

    it('rejects unknown query parameters (400)', async () => {
      await callback({ access_token: staffToken, role: 'admin' }).expect(400);
    });

    it('never logs the token or the callback query, only the path and a reason', async () => {
      const lines: string[] = [];
      const capture = (...args: unknown[]) => {
        lines.push(args.map(String).join(' '));
      };
      const spies = (['log', 'warn', 'error', 'debug', 'verbose'] as const).map((level) =>
        jest.spyOn(Logger.prototype, level).mockImplementation(capture),
      );

      try {
        await signIn(staffToken);
        const orphan = await beginLogin();
        await callback({ access_token: staffToken, state: orphan.state });
        await callback({ access_token: tamperPayload(staffToken, { role: 'admin' }) });
      } finally {
        spies.forEach((spy) => spy.mockRestore());
      }

      const logged = lines.join('\n');
      expect(logged).not.toContain(staffToken.split('.')[1]);
      expect(logged).not.toContain('access_token=');
      expect(logged).toContain('"reason":"sso_state_missing"');
      expect(logged).toContain('"reason":"sso_restart_without_state"');
      expect(logged).toContain('"path":"/auth/callback"');
    });
  });

  // ------------------------------------------------------ /auth/logout --
  describe('POST /auth/logout', () => {
    it('clears both cookies and sends the browser to Core Hub web /logout', async () => {
      const signedIn = await signIn(staffToken);

      const response = await request(server())
        .post('/auth/logout')
        .set('Cookie', pair(cookieNamed(signedIn, SESSION_COOKIE)))
        .expect(303);

      expect(response.headers.location).toBe(`${CORE_HUB_WEB_URL}/logout`);
      expect(response.headers['cache-control']).toBe('no-store');

      const session = cookieNamed(response, SESSION_COOKIE);
      expect(isRemoval(session)).toBe(true);
      expect(session).toContain('Path=/');

      const state = cookieNamed(response, STATE_COOKIE);
      expect(isRemoval(state)).toBe(true);
      expect(state).toContain('Path=/auth/callback');
    });

    it('works without a session too - it only clears cookies', async () => {
      const response = await request(server()).post('/auth/logout').expect(303);

      expect(response.headers.location).toBe(`${CORE_HUB_WEB_URL}/logout`);
      expect(burnsCookie(response, SESSION_COOKIE)).toBe(true);
    });

    it('is POST only - opening it with GET signs nobody out', async () => {
      await request(server()).get('/auth/logout').expect(404);
    });
  });

  // ------------------------------------------------- the cookie session --
  describe('the session cookie on the API', () => {
    it('reaches a business API with the cookie alone', async () => {
      const signedIn = await signIn(studentToken);

      const response = await request(server())
        .get('/api/v1/bookings')
        .set('Cookie', pair(cookieNamed(signedIn, SESSION_COOKIE)))
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: [],
        meta: { total: 0, page: 1, limit: 20, totalPages: 0 },
      });
    });

    it('still enforces subsystem authorization for a cookie session', async () => {
      const signedIn = await signIn(studentToken);

      await request(server())
        .post('/api/v1/office-hours')
        .set('Cookie', pair(cookieNamed(signedIn, SESSION_COOKIE)))
        .send({ dayOfWeek: 'MON', startTime: '09:00', endTime: '11:00' })
        .expect(403);
    });

    it('prefers the Authorization header over the cookie', async () => {
      const signedIn = await signIn(studentToken);

      const response = await request(server())
        .get('/api/v1/me')
        .set('Cookie', pair(cookieNamed(signedIn, SESSION_COOKIE)))
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(200);

      expect(response.body.data.subsystemRole).toBe('TEACHER');
    });

    it.each([
      ['a forged cookie value', `${SESSION_COOKIE}=not-a-jwt`],
      ['a cookie with a tampered token', () => `${SESSION_COOKIE}=${tamperPayload(studentToken, { role: 'admin' })}`],
      ['a broken percent-encoding', `${SESSION_COOKIE}=%`],
      ['the SSO 1.0 cookie name', () => `core_hub_access_token=${staffToken}`],
      ["Core Hub's own web cookie", () => `csmju_access_token=${staffToken}`],
    ])('answers 401 for %s', async (_label, cookie) => {
      await request(server())
        .get('/api/v1/me')
        .set('Cookie', typeof cookie === 'function' ? cookie() : cookie)
        .expect(401);
    });
  });

  // -------------------------------------------------------------- routes --
  describe('route placement', () => {
    it.each([
      ['get', '/api/auth/login'],
      ['get', '/api/auth/callback'],
      ['post', '/api/auth/logout'],
    ] as const)('serves the SSO endpoints at the root, not %s %s', async (method, path) => {
      await request(server())[method](path).expect(404);
    });
  });
});

describe('Central SSO 1.1 in production (e2e)', () => {
  let app: INestApplication;
  let coreHub: FakeCoreHub;
  let key: TestSigningKey;

  beforeAll(async () => {
    key = await createSigningKey('core-hub-2026');
    coreHub = new FakeCoreHub();
    await coreHub.start([key]);

    process.env.CORE_HUB_URL = coreHub.url;
    process.env.CORE_HUB_JWKS_URL = coreHub.jwksUrl;

    // NODE_ENV is read when the configuration is built, while the module compiles.
    app = await bootApp(new InMemoryPrisma(), { NODE_ENV: 'production' });
  });

  afterAll(async () => {
    await app?.close();
    await coreHub?.stop();
  });

  it('marks the state and session cookies Secure', async () => {
    const login = await request(app.getHttpServer()).get('/auth/login').expect(302);
    const stateCookie = cookieNamed(login, STATE_COOKIE) ?? '';
    const state = new URL(login.headers.location).searchParams.get('state') ?? '';

    expect(stateCookie).toContain('Secure');

    const signedIn = await request(app.getHttpServer())
      .get('/auth/callback')
      .query({ access_token: await signCoreHubToken(key), state })
      .set('Cookie', pair(stateCookie))
      .expect(302);

    expect(cookieNamed(signedIn, SESSION_COOKIE)).toContain('Secure');
    expect(cookieNamed(signedIn, STATE_COOKIE)).toContain('Secure');
  });

  it('clears the cookies with Secure on logout', async () => {
    const response = await request(app.getHttpServer()).post('/auth/logout').expect(303);

    expect(cookieNamed(response, SESSION_COOKIE)).toContain('Secure');
  });
});
