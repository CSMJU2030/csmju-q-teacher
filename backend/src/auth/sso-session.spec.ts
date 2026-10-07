import {
  SSO_STATE_COOKIE_PATH,
  buildCookieRemoval,
  buildSsoCookie,
  buildSsoStateCookie,
  createSsoState,
  readCookie,
  readSsoState,
  ssoCookieNames,
  timingSafeEqualString,
} from './sso-session';

const { session: SESSION, state: STATE } = ssoCookieNames('csmju-q-teacher');

describe('SSO cookies', () => {
  describe('ssoCookieNames', () => {
    it('prefixes both cookies with the subsystem name', () => {
      expect(ssoCookieNames('csmju-q-teacher')).toEqual({
        session: 'csmju_q_teacher_access_token',
        state: 'csmju_q_teacher_sso_state',
      });
    });

    it('keeps two subsystems on localhost from sharing a cookie', () => {
      expect(ssoCookieNames('csmju-equipment').session).not.toBe(SESSION);
    });
  });

  describe('readCookie', () => {
    it('reads the token out of a Cookie header', () => {
      expect(readCookie(`${SESSION}=abc.def.ghi`, SESSION)).toBe('abc.def.ghi');
    });

    it('finds the cookie among others and ignores surrounding whitespace', () => {
      const header = `theme=dark; ${SESSION} = abc.def.ghi ; lang=th`;
      expect(readCookie(header, SESSION)).toBe('abc.def.ghi');
    });

    it('percent-decodes the stored value', () => {
      expect(readCookie(`${SESSION}=a%2Bb`, SESSION)).toBe('a+b');
    });

    it('returns null when the cookie is absent or empty', () => {
      expect(readCookie(undefined, SESSION)).toBeNull();
      expect(readCookie('theme=dark', SESSION)).toBeNull();
      expect(readCookie(`${SESSION}=`, SESSION)).toBeNull();
    });

    // Regression: a cookie is attacker-controlled input. decodeURIComponent
    // throws URIError on malformed percent-encoding, and the authentication
    // guard calls readCookie outside a try/catch - so this used to surface as
    // HTTP 500 on an unauthenticated request instead of 401.
    it.each(['%', '%zz', '%E0%A4%A', 'valid%'])(
      'returns null instead of throwing on malformed percent-encoding: %s',
      (value) => {
        expect(() => readCookie(`${SESSION}=${value}`, SESSION)).not.toThrow();
        expect(readCookie(`${SESSION}=${value}`, SESSION)).toBeNull();
      },
    );
  });

  describe('buildSsoCookie', () => {
    it('is HttpOnly, SameSite=Lax and scoped to the whole site', () => {
      const cookie = buildSsoCookie(SESSION, 'token-value', 900, false);
      expect(cookie.startsWith(`${SESSION}=token-value;`)).toBe(true);
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Lax');
      expect(cookie).toContain('Path=/;');
      expect(cookie).toContain('Max-Age=900');
      expect(cookie).not.toContain('Secure');
    });

    it('adds Secure outside development', () => {
      expect(buildSsoCookie(SESSION, 'token-value', 900, true)).toContain('Secure');
    });

    it('never writes a negative or fractional lifetime', () => {
      expect(buildSsoCookie(SESSION, 't', -5, false)).toContain('Max-Age=0');
      expect(buildSsoCookie(SESSION, 't', 899.9, false)).toContain('Max-Age=899');
    });

    it('round-trips through readCookie', () => {
      const header = buildSsoCookie(SESSION, 'a+b/c=', 60, false).split(';')[0];
      expect(readCookie(header, SESSION)).toBe('a+b/c=');
    });
  });

  describe('state cookie', () => {
    it('is short-lived, HttpOnly and sent back only to the callback', () => {
      const cookie = buildSsoStateCookie(STATE, 'abc', '/bookings', 600, false);
      expect(cookie.startsWith(`${STATE}=`)).toBe(true);
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Lax');
      expect(cookie).toContain(`Path=${SSO_STATE_COOKIE_PATH}`);
      expect(cookie).toContain('Max-Age=600');
    });

    it('carries the state and the landing page together', () => {
      const state = createSsoState();
      const header = buildSsoStateCookie(STATE, state, '/bookings?status=PENDING#top', 600, false).split(
        ';',
      )[0];
      expect(readSsoState(header, STATE)).toEqual({ state, landing: '/bookings?status=PENDING#top' });
    });

    it('keeps a Thai landing page intact', () => {
      const header = buildSsoStateCookie(STATE, 's1', '/ห้อง?q=ประชุม', 600, false).split(';')[0];
      expect(readSsoState(header, STATE)?.landing).toBe('/ห้อง?q=ประชุม');
    });

    it('reads a state with no landing as an empty landing', () => {
      expect(readSsoState(`${STATE}=only-state`, STATE)).toEqual({
        state: 'only-state',
        landing: '',
      });
    });

    it('returns null when the cookie is missing or has no state', () => {
      expect(readSsoState(undefined, STATE)).toBeNull();
      expect(readSsoState('theme=dark', STATE)).toBeNull();
      expect(readSsoState(`${STATE}=.L2Jvb2tpbmdz`, STATE)).toBeNull();
    });
  });

  describe('buildCookieRemoval', () => {
    it('expires the cookie on the path it was set with', () => {
      const cookie = buildCookieRemoval(STATE, SSO_STATE_COOKIE_PATH, false);
      expect(cookie).toContain(`${STATE}=;`);
      expect(cookie).toContain(`Path=${SSO_STATE_COOKIE_PATH}`);
      expect(cookie).toContain('Max-Age=0');
      expect(cookie).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
    });

    it('keeps Secure outside development so the removal is accepted', () => {
      expect(buildCookieRemoval(SESSION, '/', true)).toContain('Secure');
    });
  });

  describe('createSsoState', () => {
    it('mints 256 bits of URL-safe randomness with no dot in it', () => {
      const state = createSsoState();
      expect(state).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(state.length).toBeGreaterThanOrEqual(43);
    });

    it('never repeats', () => {
      const values = new Set(Array.from({ length: 200 }, () => createSsoState()));
      expect(values.size).toBe(200);
    });
  });

  describe('timingSafeEqualString', () => {
    it('accepts an exact match', () => {
      const state = createSsoState();
      expect(timingSafeEqualString(state, state)).toBe(true);
    });

    it('rejects a different value of the same length', () => {
      expect(timingSafeEqualString('abcdef', 'abcdeg')).toBe(false);
    });

    it('rejects values of different lengths without throwing', () => {
      expect(() => timingSafeEqualString('short', 'much-longer-value')).not.toThrow();
      expect(timingSafeEqualString('short', 'much-longer-value')).toBe(false);
    });

    // An empty expected value must never compare equal, otherwise a missing
    // state cookie would satisfy the check.
    it('rejects empty values', () => {
      expect(timingSafeEqualString('', '')).toBe(false);
      expect(timingSafeEqualString('', 'x')).toBe(false);
    });
  });
});
