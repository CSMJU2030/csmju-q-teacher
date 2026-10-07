/**
 * Test helpers that imitate the Core Hub token issuer.
 *
 * The keys generated here exist only inside the test process. The subsystem
 * itself never owns or stores signing keys (spec §29, §41.5).
 */
import { JWK, SignJWT, exportJWK, generateKeyPair } from 'jose';
import { KeyLike } from 'jose';

export interface TestSigningKey {
  kid: string;
  privateKey: KeyLike;
  publicJwk: JWK;
}

export const CORE_HUB_ISSUER = 'core-hub';
export const CORE_HUB_AUDIENCE = 'csmju2030';
export const CORE_HUB_KID = 'core-hub-2026';

export async function createSigningKey(kid: string = CORE_HUB_KID): Promise<TestSigningKey> {
  const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true });
  const publicJwk = await exportJWK(publicKey);

  return {
    kid,
    privateKey: privateKey as KeyLike,
    publicJwk: { ...publicJwk, kid, use: 'sig', alg: 'RS256' },
  };
}

export interface TokenOptions {
  sub?: string;
  email?: string;
  role?: string;
  sid?: string;
  issuer?: string;
  audience?: string;
  /** Seconds relative to now. Negative values produce an expired token. */
  expiresInSec?: number;
  issuedAtOffsetSec?: number;
  kid?: string;
  omitSub?: boolean;
  /** A token without `iat`, whose lifetime cannot be checked. */
  omitIat?: boolean;
  /** Authorized party - the subsystem the token was issued for. */
  azp?: string;
  /** Claims beyond the contract, which a subsystem must ignore. */
  extraClaims?: Record<string, unknown>;
}

/** Signs a Core Hub-shaped RS256 access token. */
export async function signCoreHubToken(
  key: TestSigningKey,
  options: TokenOptions = {},
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: Record<string, unknown> = {
    ...options.extraClaims,
    email: options.email ?? 'lecturer@core.local',
    role: options.role ?? 'lecturer',
    sid: options.sid ?? 'session-id',
  };

  if (!options.omitSub) {
    payload.sub = options.sub ?? 'user-003';
  }
  if (options.azp !== undefined) {
    payload.azp = options.azp;
  }

  const jwt = new SignJWT(payload)
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT', kid: options.kid ?? key.kid })
    .setIssuer(options.issuer ?? CORE_HUB_ISSUER)
    .setAudience(options.audience ?? CORE_HUB_AUDIENCE)
    .setExpirationTime(now + (options.expiresInSec ?? 900));

  if (!options.omitIat) {
    jwt.setIssuedAt(now + (options.issuedAtOffsetSec ?? 0));
  }

  return jwt.sign(key.privateKey);
}

/** An HS256 token - the subsystem must never accept it (spec §9, §29). */
export async function signHs256Token(
  secret = 'attacker-shared-secret',
  kid = CORE_HUB_KID,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ sub: 'user-999', role: 'admin', email: 'attacker@evil.local' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT', kid })
    .setIssuer(CORE_HUB_ISSUER)
    .setAudience(CORE_HUB_AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + 900)
    .sign(new TextEncoder().encode(secret));
}

const b64url = (value: unknown): string =>
  Buffer.from(JSON.stringify(value)).toString('base64url');

/** An unsigned `alg: none` token (spec §29). */
export function createAlgNoneToken(role = 'admin'): string {
  const header = b64url({ alg: 'none', typ: 'JWT', kid: CORE_HUB_KID });
  const payload = b64url({
    sub: 'user-999',
    email: 'attacker@evil.local',
    role,
    iss: CORE_HUB_ISSUER,
    aud: CORE_HUB_AUDIENCE,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 900,
  });
  return `${header}.${payload}.`;
}

/**
 * Takes a valid token and rewrites a claim (e.g. role=student -> role=admin)
 * while keeping the original signature: the classic tampering attack.
 */
export function tamperPayload(token: string, patch: Record<string, unknown>): string {
  const [header, payload, signature] = token.split('.');
  const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  return `${header}.${b64url({ ...decoded, ...patch })}.${signature}`;
}

/**
 * An RFC 7517 JWK Set - exactly the shape the Core Hub JWKS endpoint serves
 * (`{ "keys": [ ... ] }`, no API envelope).
 */
export interface JwksDocument {
  keys: JWK[];
}

export function jwksDocument(keys: TestSigningKey[]): JwksDocument {
  return { keys: keys.map((key) => key.publicJwk) };
}

/** Same shape, for fixtures that need hand-written (or malformed) JWKs. */
export function rawJwks(keys: unknown[]): JwksDocument {
  return { keys: keys as JWK[] };
}
