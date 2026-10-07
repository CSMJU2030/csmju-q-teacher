import { AppException } from '../common/errors';

/**
 * The one way this subsystem calls Core Hub (reference-data.md 7): a GET from
 * the backend, with the token of the user whose request this is
 * (auth-contract 6.1 - never logged, never passed on) and a timeout.
 *
 * What went wrong is decided by HTTP status (7.4) - Core Hub answers every
 * 5xx with `error.code = "INTERNAL_ERROR"`, so the code says nothing.
 */

/** Wait this long when Core Hub could not help and said nothing about when to retry. */
export const DEFAULT_RETRY_AFTER_SEC = 30;

/**
 * A call to Core Hub that produced no usable answer. `status` is the HTTP
 * status Core Hub sent, or 0 when it sent none (timeout, no connection).
 */
export class CoreHubCallError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfterSec?: number,
  ) {
    super(message);
    this.name = 'CoreHubCallError';
  }

  /**
   * Core Hub refused this user, not the service: 401 (their Core Hub session
   * is over) or 403 (their role may not do this). Says nothing about Core
   * Hub's health, so it must not hold back other users' calls.
   */
  get isRefusal(): boolean {
    return this.status === 401 || this.status === 403;
  }
}

/** Resolves the JSON body of a 2xx answer; anything else is a CoreHubCallError. */
export async function getFromCoreHub(
  url: string,
  token: string,
  timeoutMs: number,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let response: Response;
    try {
      response = await fetch(url, {
        signal: controller.signal,
        headers: { accept: 'application/json', authorization: `Bearer ${token}` },
      });
    } catch (error) {
      throw new CoreHubCallError(
        controller.signal.aborted
          ? `Core Hub did not answer within ${timeoutMs} ms`
          : `Core Hub could not be reached (${error instanceof Error ? error.message : 'unknown error'})`,
        0,
      );
    }

    if (!response.ok) {
      throw new CoreHubCallError(
        `Core Hub responded with HTTP ${response.status}`,
        response.status,
        retryAfterSeconds(response.headers.get('retry-after')),
      );
    }

    try {
      return await response.json();
    } catch {
      throw new CoreHubCallError('Core Hub answered with a body that is not JSON', response.status);
    }
  } finally {
    clearTimeout(timer);
  }
}

/**
 * A Retry-After header as whole seconds - delta-seconds or an HTTP date
 * (RFC 9110 10.2.3). Undefined when absent or unreadable.
 */
export function retryAfterSeconds(value: string | null, now = Date.now()): number | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed);
  }
  // An HTTP date ends in GMT; Date.parse alone would also read "-5" as a year.
  const date = /GMT$/.test(trimmed) ? Date.parse(trimmed) : Number.NaN;
  return Number.isNaN(date) ? undefined : Math.max(0, Math.ceil((date - now) / 1000));
}

/**
 * What this subsystem answers its own caller when a Core Hub call failed and
 * nothing cached can stand in (reference-data.md 7.4):
 *
 *   Core Hub 401  -> 401 UNAUTHORIZED - the user's Core Hub session is over, so
 *                    the frontend signs in again (silent re-SSO). Never a 503.
 *   Core Hub 403  -> 403 FORBIDDEN
 *   Core Hub 429  -> 503 SERVICE_UNAVAILABLE + Retry-After
 *   5xx, timeout, no connection, a malformed answer
 *                 -> 503 SERVICE_UNAVAILABLE + Retry-After
 *
 * `retryAfterSec` is when this subsystem will ask Core Hub again; without it
 * a 429 passes Core Hub's Retry-After on, and anything else says 30 s.
 */
export function coreHubFailure(error: unknown, retryAfterSec?: number): AppException {
  const status = error instanceof CoreHubCallError ? error.status : 0;

  if (status === 401) {
    return AppException.unauthorized('Core Hub has ended this session - sign in again');
  }
  if (status === 403) {
    return AppException.forbidden('Core Hub does not allow this for your role');
  }

  const coreHubWait = error instanceof CoreHubCallError ? error.retryAfterSec : undefined;
  return AppException.serviceUnavailable(
    status === 429
      ? 'Core Hub is rate limiting this subsystem - try again later'
      : 'Core Hub is unavailable right now - try again later',
    retryAfterSec ?? (status === 429 ? coreHubWait : undefined) ?? DEFAULT_RETRY_AFTER_SEC,
  );
}
