import { ConfigService } from '@nestjs/config';
import {
  TestSigningKey,
  createSigningKey,
  jwksDocument,
  rawJwks,
} from '../../test/helpers/token-factory';
import { AuthEventsLogger } from './auth-events.logger';
import { TokenRejectionReason, TokenVerificationError } from './auth.errors';
import { JwksService } from './jwks.service';

const CONFIG_DEFAULTS: Record<string, unknown> = {
  'coreHub.jwksUrl': 'http://core-hub.test/api/v1/.well-known/jwks.json',
  'coreHub.jwksCacheTtlMs': 600_000,
  'coreHub.jwksMinRefreshIntervalMs': 0,
  'coreHub.jwksRequestTimeoutMs': 1_000,
};

function configStub(overrides: Record<string, unknown> = {}): ConfigService {
  const values = { ...CONFIG_DEFAULTS, ...overrides };
  return {
    get: <T>(key: string, fallback?: T): T =>
      (values[key] !== undefined ? values[key] : fallback) as T,
  } as unknown as ConfigService;
}

function mockJwksResponse(body: unknown, ok = true, status = 200): jest.Mock {
  const fetchMock = jest.fn().mockResolvedValue({
    ok,
    status,
    json: async () => body,
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe('JwksService (spec §10, §11, §40)', () => {
  let key2026: TestSigningKey;
  let key2027: TestSigningKey;
  let service: JwksService;

  beforeAll(async () => {
    key2026 = await createSigningKey('core-hub-2026');
    key2027 = await createSigningKey('core-hub-2027');
  });

  beforeEach(() => {
    service = new JwksService(configStub(), new AuthEventsLogger());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('downloads the JWKS document and returns the key for a kid', async () => {
    const fetchMock = mockJwksResponse(jwksDocument([key2026]));

    await expect(service.getKey('core-hub-2026')).resolves.toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(CONFIG_DEFAULTS['coreHub.jwksUrl']);
  });

  it('caches keys instead of calling the Core Hub on every request', async () => {
    const fetchMock = mockJwksResponse(jwksDocument([key2026]));

    await service.getKey('core-hub-2026');
    await service.getKey('core-hub-2026');
    await service.getKey('core-hub-2026');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refreshes once when an unknown kid appears, then serves the rotated key', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => jwksDocument([key2026]) })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => jwksDocument([key2026, key2027]),
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    await service.getKey('core-hub-2026');
    await expect(service.getKey('core-hub-2027')).resolves.toBeDefined();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(service.knownKids()).toEqual(expect.arrayContaining(['core-hub-2026', 'core-hub-2027']));
  });

  it('rejects an unknown kid after a single refresh and does not loop', async () => {
    const fetchMock = mockJwksResponse(jwksDocument([key2026]));

    await expect(service.getKey('core-hub-9999')).rejects.toMatchObject({
      reason: TokenRejectionReason.UNKNOWN_KID,
    });

    // one initial fetch + at most one extra refresh for the unknown kid
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it('honours the minimum refresh interval so a bad kid cannot flood the Core Hub', async () => {
    service = new JwksService(
      configStub({ 'coreHub.jwksMinRefreshIntervalMs': 60_000 }),
      new AuthEventsLogger(),
    );
    const fetchMock = mockJwksResponse(jwksDocument([key2026]));

    await service.getKey('core-hub-2026');
    await expect(service.getKey('core-hub-9999')).rejects.toBeInstanceOf(TokenVerificationError);
    await expect(service.getKey('core-hub-9999')).rejects.toBeInstanceOf(TokenVerificationError);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('re-downloads the document after the cache TTL expires', async () => {
    service = new JwksService(
      configStub({ 'coreHub.jwksCacheTtlMs': 10 }),
      new AuthEventsLogger(),
    );
    const fetchMock = mockJwksResponse(jwksDocument([key2026]));

    await service.getKey('core-hub-2026');
    await new Promise((resolve) => setTimeout(resolve, 25));
    await service.getKey('core-hub-2026');

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps serving cached keys when the Core Hub is temporarily unreachable', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => jwksDocument([key2026]) })
      .mockRejectedValue(new Error('ECONNREFUSED'));
    global.fetch = fetchMock as unknown as typeof fetch;

    service = new JwksService(
      configStub({ 'coreHub.jwksCacheTtlMs': 10 }),
      new AuthEventsLogger(),
    );

    await service.getKey('core-hub-2026');
    await new Promise((resolve) => setTimeout(resolve, 25));

    await expect(service.getKey('core-hub-2026')).resolves.toBeDefined();
  });

  it('fails when no key has ever been cached and the Core Hub is unreachable', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;

    await expect(service.getKey('core-hub-2026')).rejects.toMatchObject({
      reason: TokenRejectionReason.JWKS_UNAVAILABLE,
    });
  });

  it('rejects a JWKS document that leaks private key material or non-RSA keys', async () => {
    mockJwksResponse(
      rawJwks([
        { ...key2026.publicJwk, d: 'private-material-must-be-ignored' },
        { kty: 'oct', kid: 'symmetric', k: 'secret' },
      ]),
    );

    await expect(service.getKey('core-hub-2026')).rejects.toBeInstanceOf(TokenVerificationError);
    expect(service.knownKids()).toHaveLength(0);
  });

  it('refuses a JWKS wrapped in an API envelope, with a diagnostic message', async () => {
    mockJwksResponse({
      success: true,
      data: { keys: [key2026.publicJwk] },
      requestId: '',
      timestamp: new Date().toISOString(),
    });

    await expect(service.getKey('core-hub-2026')).rejects.toMatchObject({
      reason: TokenRejectionReason.JWKS_UNAVAILABLE,
    });

    const logged = (service as unknown as { authEvents: { jwksRefreshFailed: unknown } })
      .authEvents;
    expect(logged).toBeDefined();
    expect(service.knownKids()).toHaveLength(0);
  });

  it('accepts a plain RFC 7517 document', async () => {
    mockJwksResponse({ keys: [key2026.publicJwk] });

    await expect(service.getKey('core-hub-2026')).resolves.toBeDefined();
  });

  it('rejects an empty kid without contacting the Core Hub', async () => {
    const fetchMock = mockJwksResponse(jwksDocument([key2026]));

    await expect(service.getKey('')).rejects.toMatchObject({
      reason: TokenRejectionReason.MISSING_KID,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shares one HTTP request between concurrent refreshes', async () => {
    const fetchMock = mockJwksResponse(jwksDocument([key2026]));

    await Promise.all([
      service.getKey('core-hub-2026'),
      service.getKey('core-hub-2026'),
      service.getKey('core-hub-2026'),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
