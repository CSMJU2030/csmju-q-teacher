import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { decodeProtectedHeader, errors as joseErrors, jwtVerify } from 'jose';
import { CoreHubTokenPayload } from './core-hub-identity';
import { JwksService } from './jwks.service';
import { TokenRejectionReason, TokenVerificationError } from './auth.errors';

/** The Core Hub contract is immutable (spec §43). */
const REQUIRED_ALGORITHM = 'RS256';

/**
 * Longest life an access token may have, from contracts/jwt-contract.json:
 * `maxTokenLifetimeSeconds` (15 minutes) plus `clockToleranceSeconds`.
 * A refresh token lives 7 days, so this is what keeps one from being used in
 * place of an access token.
 */
const MAX_TOKEN_LIFETIME_SEC = 900;
const TOKEN_LIFETIME_TOLERANCE_SEC = 60;

/**
 * Verifies a Core Hub access token - the ten steps of auth-contract 4:
 *
 *  1. a token was supplied           6. iss and aud
 *  2. read alg and kid (untrusted)   7. exp (clock tolerance <= 60 s)
 *  3. require alg = RS256            8. a non-empty sub
 *  4. public key from JWKS by kid    9. iat present, exp - iat <= 900 + 60 s
 *  5. signature, RS256 again        10. azp, when present, names this subsystem
 *
 * Claims outside the contract are ignored, never a reason to reject: Core Hub
 * may add claims without breaking it.
 */
@Injectable()
export class CoreHubTokenVerifier {
  constructor(
    private readonly jwks: JwksService,
    private readonly config: ConfigService,
  ) {}

  async verify(token: string): Promise<CoreHubTokenPayload> {
    // Step 1: there is a token at all.
    if (typeof token !== 'string' || token.trim().length === 0) {
      throw new TokenVerificationError(TokenRejectionReason.MISSING_TOKEN, 'No token supplied');
    }

    // Step 2: inspect the (unverified) header only to learn alg and kid.
    let header: ReturnType<typeof decodeProtectedHeader>;
    try {
      header = decodeProtectedHeader(token);
    } catch {
      throw new TokenVerificationError(
        TokenRejectionReason.MALFORMED_TOKEN,
        'Token is not a well-formed JWT',
      );
    }

    // Step 3: `alg: none`, HS256 and every other algorithm are rejected outright.
    if (header.alg !== REQUIRED_ALGORITHM) {
      throw new TokenVerificationError(
        TokenRejectionReason.UNSUPPORTED_ALGORITHM,
        `Unsupported token algorithm: ${String(header.alg)}`,
        header.kid,
      );
    }

    if (typeof header.kid !== 'string' || header.kid.length === 0) {
      throw new TokenVerificationError(
        TokenRejectionReason.MISSING_KID,
        'Token header does not contain a key id',
      );
    }

    // Step 4: resolve the public key for this kid (refreshing JWKS if needed).
    const key = await this.jwks.getKey(header.kid);

    // Step 5-7: signature + registered claim validation, enforcing RS256 again.
    // exp is required: a token without one would never expire.
    let payload: CoreHubTokenPayload;
    try {
      const result = await jwtVerify(token, key, {
        algorithms: [REQUIRED_ALGORITHM],
        issuer: this.config.get<string>('coreHub.issuer', 'core-hub'),
        audience: this.config.get<string>('coreHub.audience', 'csmju2030'),
        clockTolerance: this.config.get<number>('coreHub.clockToleranceSec', 5),
        requiredClaims: ['exp'],
      });
      payload = result.payload as unknown as CoreHubTokenPayload;
    } catch (error) {
      throw this.translate(error, header.kid);
    }

    // Step 8: the subsystem also requires a usable subject.
    if (typeof payload.sub !== 'string' || payload.sub.trim().length === 0) {
      throw new TokenVerificationError(
        TokenRejectionReason.INVALID_CLAIMS,
        'Token has no subject claim',
        header.kid,
      );
    }

    // Step 9: an access token lives 15 minutes. Without iat its lifetime is
    // unknown, so that fails this step too.
    if (typeof payload.iat !== 'number') {
      throw new TokenVerificationError(
        TokenRejectionReason.TOKEN_LIFETIME_EXCEEDED,
        'Token has no issued-at claim, so its lifetime cannot be checked',
        header.kid,
      );
    }
    if ((payload.exp as number) - payload.iat > MAX_TOKEN_LIFETIME_SEC + TOKEN_LIFETIME_TOLERANCE_SEC) {
      throw new TokenVerificationError(
        TokenRejectionReason.TOKEN_LIFETIME_EXCEEDED,
        'Token lives longer than a Core Hub access token',
        header.kid,
      );
    }

    // Step 10: a token Core Hub issued for another subsystem is not for us.
    // Checked only when azp is present - a later standard makes it required.
    if (payload.azp !== undefined && payload.azp !== this.subsystemId) {
      throw new TokenVerificationError(
        TokenRejectionReason.INVALID_AZP,
        'Token was issued for another subsystem',
        header.kid,
      );
    }

    return payload;
  }

  private get subsystemId(): string {
    return this.config.get<string>('subsystemId', 'csmju-q-teacher');
  }

  private translate(error: unknown, kid: string): TokenVerificationError {
    if (error instanceof TokenVerificationError) {
      return error;
    }

    if (error instanceof joseErrors.JWTExpired) {
      return new TokenVerificationError(TokenRejectionReason.EXPIRED, 'Token has expired', kid);
    }

    if (error instanceof joseErrors.JWTClaimValidationFailed) {
      if (error.claim === 'iat') {
        // jose saw an iat that is not a number - step 9 cannot pass.
        return new TokenVerificationError(
          TokenRejectionReason.TOKEN_LIFETIME_EXCEEDED,
          'Token issued-at claim is invalid',
          kid,
        );
      }
      if (error.claim === 'iss') {
        return new TokenVerificationError(
          TokenRejectionReason.INVALID_ISSUER,
          'Token issuer is not the Core Hub',
          kid,
        );
      }
      if (error.claim === 'aud') {
        return new TokenVerificationError(
          TokenRejectionReason.INVALID_AUDIENCE,
          'Token audience does not include this platform',
          kid,
        );
      }
      return new TokenVerificationError(
        TokenRejectionReason.INVALID_CLAIMS,
        `Token claim "${error.claim}" is invalid`,
        kid,
      );
    }

    if (
      error instanceof joseErrors.JOSEError &&
      error.code === 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED'
    ) {
      return new TokenVerificationError(
        TokenRejectionReason.INVALID_SIGNATURE,
        'Token signature verification failed',
        kid,
      );
    }

    return new TokenVerificationError(
      TokenRejectionReason.MALFORMED_TOKEN,
      'Token could not be verified',
      kid,
    );
  }
}
