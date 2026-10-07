import { randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Central SSO cookies (auth-contract 5.1, 5.2).
 *
 * The subsystem keeps no session of its own. Once `/auth/callback` has
 * verified a Core Hub access token it stores *that token* in an HttpOnly
 * cookie that expires with the token's `exp`, and every request verifies it
 * exactly like a Bearer token. When it expires the frontend sends the browser
 * through `/auth/login` again, and Core Hub renews it silently from its own
 * session - so revoking access or signing out at Core Hub reaches this
 * subsystem within one token lifetime (15 minutes), and no identity is stored
 * here.
 *
 * The second cookie carries the single-use `state` of one sign-in, which is
 * what lets the callback tell a sign-in it started from one it did not.
 */

/**
 * Cookie names start with the subsystem name (`-` becomes `_`). In
 * development every service runs on `localhost`, and cookies are not
 * separated by port, so two subsystems using one name would overwrite each
 * other - and Core Hub's own `csmju_*` cookies arrive here too, unread.
 */
export function ssoCookieNames(subsystemId: string): { session: string; state: string } {
  const prefix = subsystemId.replace(/-/g, '_');
  return { session: `${prefix}_access_token`, state: `${prefix}_sso_state` };
}

/** The state cookie is sent back only to the callback, the one place that reads it. */
export const SSO_STATE_COOKIE_PATH = '/auth/callback';

/** How long a sign-in may take at Core Hub (contracts/jwt-contract.json `stateTtlMaxSec`). */
export const SSO_STATE_TTL_SEC = 600;

/** Reads one cookie out of a raw `Cookie:` header without extra dependencies. */
export function readCookie(header: string | undefined, name: string): string | null {
  if (!header) {
    return null;
  }

  for (const part of header.split(';')) {
    const separator = part.indexOf('=');

    if (separator === -1) {
      continue;
    }

    if (part.slice(0, separator).trim() !== name) {
      continue;
    }

    const value = part.slice(separator + 1).trim();

    if (value.length === 0) {
      return null;
    }

    // A cookie is attacker-controlled input. `decodeURIComponent` throws a
    // URIError on malformed percent-encoding (for example `%`), and the guard
    // calls this outside a try/catch - an unhandled URIError there would be
    // rendered as HTTP 500 instead of 401. A broken cookie carries no usable
    // token, so it is treated exactly like no cookie at all.
    try {
      return decodeURIComponent(value);
    } catch {
      return null;
    }
  }

  return null;
}

function serialiseCookie(
  name: string,
  value: string,
  attributes: Record<string, string | boolean>,
): string {
  const parts = [`${name}=${encodeURIComponent(value)}`];

  for (const [key, attribute] of Object.entries(attributes)) {
    if (attribute === false) {
      continue;
    }
    parts.push(attribute === true ? key : `${key}=${attribute}`);
  }

  return parts.join('; ');
}

function maxAge(seconds: number): string {
  return String(Math.max(0, Math.floor(seconds)));
}

/** The session cookie: the verified Core Hub token, alive exactly as long as it is. */
export function buildSsoCookie(
  name: string,
  token: string,
  maxAgeSec: number,
  secure: boolean,
): string {
  return serialiseCookie(name, token, {
    'Path': '/',
    'HttpOnly': true,
    'SameSite': 'Lax',
    'Max-Age': maxAge(maxAgeSec),
    'Secure': secure,
  });
}

/**
 * The state cookie. Its value is `<state>.<next as base64url>`: the page to
 * return to travels with the state it belongs to, so a second sign-in in
 * another tab cannot send this one somewhere else. The state itself is
 * base64url and never contains a dot, so the first dot splits the two.
 */
export function buildSsoStateCookie(
  name: string,
  state: string,
  landing: string,
  ttlSec: number,
  secure: boolean,
): string {
  const value = `${state}.${Buffer.from(landing, 'utf8').toString('base64url')}`;

  return serialiseCookie(name, value, {
    'Path': SSO_STATE_COOKIE_PATH,
    'HttpOnly': true,
    'SameSite': 'Lax',
    'Max-Age': maxAge(ttlSec),
    'Secure': secure,
  });
}

/**
 * Reads the state cookie back. The landing is returned as stored and must be
 * checked with `safeNextPath` again before it is used: it came from a cookie.
 */
export function readSsoState(
  cookieHeader: string | undefined,
  name: string,
): { state: string; landing: string } | null {
  const raw = readCookie(cookieHeader, name);
  if (!raw) {
    return null;
  }

  const dot = raw.indexOf('.');
  const state = dot === -1 ? raw : raw.slice(0, dot);
  const landing = dot === -1 ? '' : Buffer.from(raw.slice(dot + 1), 'base64url').toString('utf8');

  return state.length > 0 ? { state, landing } : null;
}

/**
 * Expires a cookie. The Path must be the one it was set with, or the browser
 * treats it as a different cookie and keeps the original.
 */
export function buildCookieRemoval(name: string, path: string, secure: boolean): string {
  return serialiseCookie(name, '', {
    'Path': path,
    'HttpOnly': true,
    'SameSite': 'Lax',
    'Max-Age': '0',
    'Expires': 'Thu, 01 Jan 1970 00:00:00 GMT',
    'Secure': secure,
  });
}

/** 256 bits of randomness, URL-safe so it survives a query string unchanged. */
export function createSsoState(): string {
  return randomBytes(32).toString('base64url');
}

/** Constant-time comparison, so a mismatch leaks nothing through timing. */
export function timingSafeEqualString(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');

  if (left.length !== right.length || left.length === 0) {
    return false;
  }

  return timingSafeEqual(left, right);
}
