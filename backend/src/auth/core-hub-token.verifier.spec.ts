import { ConfigService } from '@nestjs/config';
import { SignJWT } from 'jose';
import {
  CORE_HUB_AUDIENCE,
  CORE_HUB_ISSUER,
  TestSigningKey,
  createAlgNoneToken,
  createSigningKey,
  jwksDocument,
  signCoreHubToken,
  signHs256Token,
  tamperPayload,
} from '../../test/helpers/token-factory';
import { AuthEventsLogger } from './auth-events.logger';
import { TokenRejectionReason } from './auth.errors';
import { CoreHubTokenVerifier } from './core-hub-token.verifier';
import { JwksService } from './jwks.service';

const CONFIG: Record<string, unknown> = {
  'coreHub.jwksUrl': 'http://core-hub.test/api/v1/.well-known/jwks.json',
  'coreHub.issuer': CORE_HUB_ISSUER,
  'coreHub.audience': CORE_HUB_AUDIENCE,
  'coreHub.jwksCacheTtlMs': 600_000,
  'coreHub.jwksMinRefreshIntervalMs': 0,
  'coreHub.jwksRequestTimeoutMs': 1_000,
  'coreHub.clockToleranceSec': 0,
  subsystemId: 'csmju-q-teacher',
};

const config = {
  get: <T>(key: string, fallback?: T): T =>
    (CONFIG[key] !== undefined ? CONFIG[key] : fallback) as T,
} as unknown as ConfigService;

describe('CoreHubTokenVerifier - authentication tests (spec §13, §36)', () => {
  let key: TestSigningKey;
  let rotatedKey: TestSigningKey;
  let verifier: CoreHubTokenVerifier;
  let jwks: JwksService;

  beforeAll(async () => {
    key = await createSigningKey('core-hub-2026');
    rotatedKey = await createSigningKey('core-hub-2027');
  });

  beforeEach(() => {
    jwks = new JwksService(config, new AuthEventsLogger());
    verifier = new CoreHubTokenVerifier(jwks, config);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => jwksDocument([key]),
    }) as unknown as typeof fetch;
  });

  afterEach(() => jest.restoreAllMocks());

  it('accepts a valid Core Hub token and returns the verified claims', async () => {
    const token = await signCoreHubToken(key, {
      sub: 'user-003',
      email: 'staff@core.local',
      role: 'staff',
      sid: 'session-id',
    });

    const payload = await verifier.verify(token);

    expect(payload).toMatchObject({
      sub: 'user-003',
      email: 'staff@core.local',
      role: 'staff',
      sid: 'session-id',
      iss: CORE_HUB_ISSUER,
      aud: CORE_HUB_AUDIENCE,
    });
  });

  it('rejects an expired token', async () => {
    const token = await signCoreHubToken(key, { expiresInSec: -60, issuedAtOffsetSec: -120 });

    await expect(verifier.verify(token)).rejects.toMatchObject({
      reason: TokenRejectionReason.EXPIRED,
    });
  });

  it('rejects a token signed by a different (attacker) key', async () => {
    const attackerKey = await createSigningKey('core-hub-2026'); // same kid, wrong key
    const token = await signCoreHubToken(attackerKey);

    await expect(verifier.verify(token)).rejects.toMatchObject({
      reason: TokenRejectionReason.INVALID_SIGNATURE,
    });
  });

  it('rejects a token whose payload was modified after signing (role escalation)', async () => {
    const studentToken = await signCoreHubToken(key, { role: 'student', sub: 'user-001' });
    const escalated = tamperPayload(studentToken, { role: 'admin' });

    await expect(verifier.verify(escalated)).rejects.toMatchObject({
      reason: TokenRejectionReason.INVALID_SIGNATURE,
    });
  });

  it('rejects a wrong issuer', async () => {
    const token = await signCoreHubToken(key, { issuer: 'evil-hub' });

    await expect(verifier.verify(token)).rejects.toMatchObject({
      reason: TokenRejectionReason.INVALID_ISSUER,
    });
  });

  it('rejects a wrong audience', async () => {
    const token = await signCoreHubToken(key, { audience: 'another-platform' });

    await expect(verifier.verify(token)).rejects.toMatchObject({
      reason: TokenRejectionReason.INVALID_AUDIENCE,
    });
  });

  it('rejects an HS256 token even when the kid matches', async () => {
    const token = await signHs256Token();

    await expect(verifier.verify(token)).rejects.toMatchObject({
      reason: TokenRejectionReason.UNSUPPORTED_ALGORITHM,
    });
  });

  it('rejects an unsigned alg=none token', async () => {
    await expect(verifier.verify(createAlgNoneToken())).rejects.toMatchObject({
      reason: TokenRejectionReason.UNSUPPORTED_ALGORITHM,
    });
  });

  it('rejects a missing token', async () => {
    await expect(verifier.verify('')).rejects.toMatchObject({
      reason: TokenRejectionReason.MISSING_TOKEN,
    });
  });

  it('rejects a malformed token', async () => {
    await expect(verifier.verify('not-a-jwt')).rejects.toMatchObject({
      reason: TokenRejectionReason.MALFORMED_TOKEN,
    });
  });

  it('rejects a token with an unknown kid', async () => {
    const unknownKidKey = await createSigningKey('core-hub-1999');
    const token = await signCoreHubToken(unknownKidKey);

    await expect(verifier.verify(token)).rejects.toMatchObject({
      reason: TokenRejectionReason.UNKNOWN_KID,
    });
  });

  it('rejects a token without a subject claim', async () => {
    const token = await signCoreHubToken(key, { omitSub: true });

    await expect(verifier.verify(token)).rejects.toMatchObject({
      reason: TokenRejectionReason.INVALID_CLAIMS,
    });
  });

  it('rejects a token without an expiry claim', async () => {
    const token = await new SignJWT({ sub: 'user-003', role: 'staff' })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT', kid: key.kid })
      .setIssuer(CORE_HUB_ISSUER)
      .setAudience(CORE_HUB_AUDIENCE)
      .setIssuedAt()
      .sign(key.privateKey);

    await expect(verifier.verify(token)).rejects.toMatchObject({
      reason: TokenRejectionReason.INVALID_CLAIMS,
    });
  });

  // ---- step 9 (auth-contract 1.2): the lifetime of an access token --------
  describe('step 9 - token lifetime', () => {
    it('rejects a token without iat, whose lifetime cannot be checked', async () => {
      const token = await signCoreHubToken(key, { omitIat: true });

      await expect(verifier.verify(token)).rejects.toMatchObject({
        reason: TokenRejectionReason.TOKEN_LIFETIME_EXCEEDED,
      });
    });

    it('rejects a token whose iat is not a number', async () => {
      const token = await signCoreHubToken(key, {
        omitIat: true,
        extraClaims: { iat: 'yesterday' },
      });

      await expect(verifier.verify(token)).rejects.toMatchObject({
        reason: TokenRejectionReason.TOKEN_LIFETIME_EXCEEDED,
      });
    });

    it('rejects a refresh-token-like lifetime of 7 days', async () => {
      const token = await signCoreHubToken(key, { expiresInSec: 7 * 24 * 60 * 60 });

      await expect(verifier.verify(token)).rejects.toMatchObject({
        reason: TokenRejectionReason.TOKEN_LIFETIME_EXCEEDED,
      });
    });

    it('rejects exp - iat of 961 s, one second past 900 + 60', async () => {
      const token = await signCoreHubToken(key, { issuedAtOffsetSec: -61, expiresInSec: 900 });

      await expect(verifier.verify(token)).rejects.toMatchObject({
        reason: TokenRejectionReason.TOKEN_LIFETIME_EXCEEDED,
      });
    });

    it('accepts exp - iat of exactly 900 + 60 s', async () => {
      const token = await signCoreHubToken(key, { issuedAtOffsetSec: -60, expiresInSec: 900 });

      await expect(verifier.verify(token)).resolves.toMatchObject({ sub: 'user-003' });
    });
  });

  // ---- step 10 (auth-contract 1.2): the authorized party --------------------
  describe('step 10 - azp', () => {
    it('rejects a token issued for another subsystem', async () => {
      const token = await signCoreHubToken(key, { azp: 'csmju-equipment' });

      await expect(verifier.verify(token)).rejects.toMatchObject({
        reason: TokenRejectionReason.INVALID_AZP,
      });
    });

    it('rejects an azp that is not a string', async () => {
      const token = await signCoreHubToken(key, { extraClaims: { azp: ['csmju-q-teacher'] } });

      await expect(verifier.verify(token)).rejects.toMatchObject({
        reason: TokenRejectionReason.INVALID_AZP,
      });
    });

    it('accepts a token issued for this subsystem', async () => {
      const token = await signCoreHubToken(key, { azp: 'csmju-q-teacher' });

      await expect(verifier.verify(token)).resolves.toMatchObject({
        azp: 'csmju-q-teacher',
      });
    });

    it('accepts a token without azp - Core Hub does not set it everywhere yet', async () => {
      const token = await signCoreHubToken(key);

      await expect(verifier.verify(token)).resolves.toMatchObject({ sub: 'user-003' });
    });
  });

  it('accepts claims beyond the contract - Core Hub may add them', async () => {
    const token = await signCoreHubToken(key, {
      extraClaims: { faculty: 'SCI', scope: 'reference:read', amr: ['pwd'] },
    });

    await expect(verifier.verify(token)).resolves.toMatchObject({ sub: 'user-003' });
  });

  it('accepts a token signed with a rotated key after JWKS refresh (spec §40)', async () => {
    (global.fetch as unknown as jest.Mock)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => jwksDocument([key]) })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => jwksDocument([key, rotatedKey]),
      });

    await verifier.verify(await signCoreHubToken(key));

    const rotatedToken = await signCoreHubToken(rotatedKey);
    await expect(verifier.verify(rotatedToken)).resolves.toMatchObject({ sub: 'user-003' });
  });
});
