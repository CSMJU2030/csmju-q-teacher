/**
 * Why a Core Hub token was rejected. Logged; never returned verbatim in detail.
 * The values are the closed list of standards/contracts/log-events.json.
 */
export enum TokenRejectionReason {
  MISSING_TOKEN = 'missing_token',
  MALFORMED_TOKEN = 'malformed_token',
  UNSUPPORTED_ALGORITHM = 'unsupported_algorithm',
  MISSING_KID = 'missing_kid',
  UNKNOWN_KID = 'unknown_kid',
  JWKS_UNAVAILABLE = 'jwks_unavailable',
  INVALID_SIGNATURE = 'invalid_signature',
  EXPIRED = 'expired',
  INVALID_ISSUER = 'invalid_issuer',
  INVALID_AUDIENCE = 'invalid_audience',
  INVALID_CLAIMS = 'invalid_claims',
  /** Step 9: no `iat`, or `exp - iat` longer than an access token lives (e.g. a refresh token). */
  TOKEN_LIFETIME_EXCEEDED = 'token_lifetime_exceeded',
  /** Step 10: the token carries an `azp` naming another subsystem. */
  INVALID_AZP = 'invalid_azp',
  /** A callback without `state`: Core Hub started the sign-in, so it restarts at /auth/login. */
  SSO_RESTART_WITHOUT_STATE = 'sso_restart_without_state',
  /** A callback with a `state` but no state cookie - this browser never started it. */
  SSO_STATE_MISSING = 'sso_state_missing',
  /** A callback whose `state` is not the one in the state cookie. */
  SSO_STATE_MISMATCH = 'sso_state_mismatch',
}

/** Raised by the JWKS/verification layer. Turned into HTTP 401 by the guard. */
export class TokenVerificationError extends Error {
  constructor(
    readonly reason: TokenRejectionReason,
    message: string,
    readonly kid?: string,
  ) {
    super(message);
    this.name = 'TokenVerificationError';
  }
}
