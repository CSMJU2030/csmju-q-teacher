/**
 * REAL integration test (spec §37).
 *
 *   1. Login to the running Core Hub
 *   2. Receive an RS256 access_token
 *   3. Call the running Q-Teacher with it
 *   4. The subsystem downloads the Core Hub JWKS
 *   5. The subsystem verifies the token
 *   6. The subsystem maps the Core role to a subsystem role
 *   7. The protected API returns 200
 *
 * Run it with both services up:
 *
 *   CORE_HUB_URL=http://localhost:3000 \
 *   SUBSYSTEM_URL=http://localhost:4224 \
 *   CORE_HUB_TEST_EMAIL=staff@core.local \
 *   CORE_HUB_TEST_PASSWORD=<password> \
 *   pnpm --filter backend test:integration
 *
 * Without those variables the suite skips instead of failing, so `pnpm test`
 * stays green on a machine that has no Core Hub running.
 */
import { decodeJwt, decodeProtectedHeader } from 'jose';
import { mapCoreRoleToSubsystemRole } from '../src/auth/role-mapping';
import { ssoCookieNames } from '../src/auth/sso-session';

const CORE_HUB_URL = process.env.CORE_HUB_URL ?? '';
const SUBSYSTEM_BASE = process.env.SUBSYSTEM_URL ?? 'http://localhost:4224';
const EMAIL = process.env.CORE_HUB_TEST_EMAIL ?? '';
const PASSWORD = process.env.CORE_HUB_TEST_PASSWORD ?? '';
const PRESET_TOKEN = process.env.CORE_HUB_ACCESS_TOKEN ?? '';

const canRun = Boolean(CORE_HUB_URL && ((EMAIL && PASSWORD) || PRESET_TOKEN));
const describeIntegration = canRun ? describe : describe.skip;

if (!canRun) {
  console.warn(
    '[integration] skipped: set CORE_HUB_URL and CORE_HUB_TEST_EMAIL/CORE_HUB_TEST_PASSWORD ' +
      '(or CORE_HUB_ACCESS_TOKEN) to run the real Core Hub integration test.',
  );
}

async function loginToCoreHub(): Promise<string> {
  if (PRESET_TOKEN) {
    return PRESET_TOKEN;
  }

  const response = await fetch(`${CORE_HUB_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });

  if (!response.ok) {
    throw new Error(`Core Hub login failed with HTTP ${response.status}`);
  }

  const body = (await response.json()) as Record<string, any>;
  const token = body.access_token ?? body.data?.access_token;

  if (typeof token !== 'string') {
    throw new Error('Core Hub login response did not contain an access_token');
  }

  return token;
}

describeIntegration('Core Hub -> Q-Teacher integration (spec §37, §38)', () => {
  let accessToken: string;

  beforeAll(async () => {
    accessToken = await loginToCoreHub();
  });

  it('Step 1-2: the Core Hub issues an RS256 token matching the fixed contract', () => {
    const header = decodeProtectedHeader(accessToken);
    const payload = decodeJwt(accessToken);

    expect(header.alg).toBe('RS256');
    expect(header.kid).toBeTruthy();
    expect(payload.iss).toBe(process.env.CORE_HUB_ISSUER ?? 'core-hub');
    expect(payload.aud).toBe(process.env.CORE_HUB_AUDIENCE ?? 'csmju2030');
    expect(payload.sub).toBeTruthy();
    expect(payload.role).toBeTruthy();
  });

  it('the Core Hub publishes a JWKS containing the token key id (public material only)', async () => {
    const jwksUrl =
      process.env.CORE_HUB_JWKS_URL ?? `${CORE_HUB_URL}/api/v1/.well-known/jwks.json`;
    const response = await fetch(jwksUrl);
    expect(response.ok).toBe(true);

    // RFC 7517: the JWKS document must be `{ "keys": [...] }` at the top level,
    // with no API envelope around it.
    const body = (await response.json()) as {
      keys?: Array<Record<string, unknown>>;
    };
    const header = decodeProtectedHeader(accessToken);

    const keys = body.keys ?? [];

    expect(Array.isArray(body.keys)).toBe(true);
    expect(keys.some((jwk) => jwk.kid === header.kid)).toBe(true);
    // A public JWKS must never expose private RSA parameters.
    expect(keys.every((jwk) => jwk.d === undefined)).toBe(true);
  });

  it('the Q-Teacher health endpoint is public', async () => {
    const response = await fetch(`${SUBSYSTEM_BASE}/api/health`);
    expect(response.status).toBe(200);

    const body = (await response.json()) as Record<string, any>;
    expect(body.data.status).toBe('ok');
  });

  it('Step 3-6: the subsystem verifies the Core Hub token and maps the role', async () => {
    const response = await fetch(`${SUBSYSTEM_BASE}/api/v1/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    expect(response.status).toBe(200);

    const body = (await response.json()) as Record<string, any>;
    const payload = decodeJwt(accessToken);

    expect(body.success).toBe(true);
    expect(body.data.id).toBe(payload.sub);
    expect(body.data.coreRole).toBe(payload.role);
    expect(body.data.subsystemRole).toBe(mapCoreRoleToSubsystemRole(String(payload.role)));
  });

  it('Step 7: a protected business API returns 200 with the same token', async () => {
    const response = await fetch(`${SUBSYSTEM_BASE}/api/v1/teachers`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    expect(response.status).toBe(200);

    const body = (await response.json()) as Record<string, any>;
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('rejects the same request without a token (401)', async () => {
    const response = await fetch(`${SUBSYSTEM_BASE}/api/v1/teachers`);
    expect(response.status).toBe(401);
  });

  // ------------------------------------------------------------ central SSO --
  // SSO 1.1: every sign-in starts at the subsystem's /auth/login. This suite
  // plays Core Hub's web app, which calls the API authorize with the user's
  // Bearer token and the state /auth/login minted.
  describe('Central SSO 1.1', () => {
    const SUBSYSTEM = process.env.SSO_SUBSYSTEM ?? 'csmju-q-teacher';
    const names = ssoCookieNames(SUBSYSTEM);

    const authorize = (query: string, token = accessToken) =>
      fetch(`${CORE_HUB_URL}/api/v1/auth/sso/authorize?${query}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        redirect: 'manual',
      });

    const cookieFrom = (response: Response, name: string): string | undefined =>
      response.headers
        .getSetCookie()
        .find((entry) => entry.startsWith(`${name}=`))
        ?.split(';')[0];

    /** GET /auth/login of the running subsystem: the state and its cookie. */
    async function beginLogin(): Promise<{ state: string; cookie: string }> {
      const response = await fetch(`${SUBSYSTEM_BASE}/auth/login`, { redirect: 'manual' });
      const location = new URL(response.headers.get('location') ?? 'about:blank');

      return {
        state: location.searchParams.get('state') ?? '',
        cookie: cookieFrom(response, names.state) ?? '',
      };
    }

    it('redirects to the registered callback and returns the state unchanged', async () => {
      const { state } = await beginLogin();
      const response = await authorize(`subsystem=${SUBSYSTEM}&state=${encodeURIComponent(state)}`);

      expect(response.status).toBe(302);

      const redirect = new URL(response.headers.get('location') ?? '');

      expect(redirect.pathname).toBe('/auth/callback');
      expect(redirect.searchParams.get('access_token')).toBeTruthy();
      expect(redirect.searchParams.get('state')).toBe(state);
    });

    it('signs in and reaches the subsystem with the session cookie alone', async () => {
      const login = await beginLogin();
      const handoff = await authorize(`subsystem=${SUBSYSTEM}&state=${encodeURIComponent(login.state)}`);

      const callback = await fetch(handoff.headers.get('location') as string, {
        headers: { cookie: login.cookie },
        redirect: 'manual',
      });

      expect(callback.status).toBe(302);

      const session = cookieFrom(callback, names.session);
      expect(session).toBeTruthy();

      const me = await fetch(`${SUBSYSTEM_BASE}/api/v1/me`, { headers: { cookie: session as string } });

      expect(me.status).toBe(200);

      const body = (await me.json()) as Record<string, any>;

      expect(body.data.id).toBe(decodeJwt(accessToken).sub);
    });

    it('restarts at /auth/login when Core Hub started the sign-in without a state', async () => {
      const handoff = await authorize(`subsystem=${SUBSYSTEM}`);
      const callback = await fetch(handoff.headers.get('location') as string, {
        redirect: 'manual',
      });

      expect(callback.status).toBe(302);
      expect(callback.headers.get('location')).toBe('/auth/login');
      expect(cookieFrom(callback, names.session)).toBeUndefined();
    });

    it('rejects an unauthenticated SSO request (401)', async () => {
      const response = await authorize(`subsystem=${SUBSYSTEM}`, '');

      expect(response.status).toBe(401);
    });

    it('rejects an unknown subsystem (404)', async () => {
      const response = await authorize('subsystem=does-not-exist-subsystem');

      expect(response.status).toBe(404);
    });

    it('rejects a callback URL that is not registered (400)', async () => {
      const response = await authorize(
        `subsystem=${SUBSYSTEM}&callback_url=${encodeURIComponent('https://evil.example.com/steal')}`,
      );

      expect(response.status).toBe(400);
    });
  });

  it('rejects a tampered token (401)', async () => {
    const [header, payload, signature] = accessToken.split('.');
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    const tampered = `${header}.${Buffer.from(
      JSON.stringify({ ...decoded, role: 'admin' }),
    ).toString('base64url')}.${signature}`;

    const response = await fetch(`${SUBSYSTEM_BASE}/api/v1/me`, {
      headers: { Authorization: `Bearer ${tampered}` },
    });

    expect(response.status).toBe(401);
  });
});
