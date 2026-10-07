import { ConfigService } from '@nestjs/config';
import { ErrorCode } from '../common/errors';
import { PeopleService } from './people.service';

const TOKEN = 'secret-token-value';

const CONFIG: Record<string, unknown> = {
  'coreHub.url': 'http://core.test/',
  'coreHub.dataRequestTimeoutMs': 5_000,
};
const config = {
  get: <T>(key: string, fallback?: T): T => (CONFIG[key] ?? fallback) as T,
} as unknown as ConfigService;

const respond = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

const person = {
  personCode: '6500000002',
  personType: 'STUDENT',
  fullNameTh: 'ชื่อ ทดสอบ',
  universityEmail: 'someone@example.test',
  status: 'ACTIVE',
};

let fetchMock: jest.SpiedFunction<typeof fetch>;

beforeEach(() => {
  fetchMock = jest.spyOn(global, 'fetch');
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('PeopleService.myPersonCode', () => {
  it('reads personCode from GET /people/me with the caller token', async () => {
    fetchMock.mockResolvedValueOnce(respond({ success: true, data: person }));

    await expect(new PeopleService(config).myPersonCode(TOKEN)).resolves.toBe('6500000002');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://core.test/api/v1/people/me');
    expect((init?.headers as Record<string, string>).authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('asks Core Hub every time - personal data is never cached', async () => {
    fetchMock.mockImplementation(async () => respond({ success: true, data: person }));
    const service = new PeopleService(config);

    await service.myPersonCode(TOKEN);
    await service.myPersonCode(TOKEN);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('is null for an account linked to no person (data: null)', async () => {
    fetchMock.mockResolvedValueOnce(respond({ success: true, data: null }));

    await expect(new PeopleService(config).myPersonCode(TOKEN)).resolves.toBeNull();
  });

  it('is null when the role may not read it (guest gets 403)', async () => {
    fetchMock.mockResolvedValueOnce(respond({ success: false, error: { code: 'FORBIDDEN' } }, 403));

    await expect(new PeopleService(config).myPersonCode(TOKEN)).resolves.toBeNull();
  });

  it('answers a Core Hub 401 with 401 UNAUTHORIZED, so the user signs in again', async () => {
    fetchMock.mockResolvedValueOnce(respond({ success: false }, 401));

    await expect(new PeopleService(config).myPersonCode(TOKEN)).rejects.toMatchObject({
      code: ErrorCode.UNAUTHORIZED,
      status: 401,
    });
  });

  it("answers a Core Hub 429 with 503 and Core Hub's Retry-After", async () => {
    fetchMock.mockResolvedValueOnce(respond({ success: false }, 429, { 'retry-after': '45' }));

    await expect(new PeopleService(config).myPersonCode(TOKEN)).rejects.toMatchObject({
      code: ErrorCode.SERVICE_UNAVAILABLE,
      status: 503,
      retryAfterSec: 45,
    });
  });

  it.each([
    ['a 5xx', () => fetchMock.mockResolvedValueOnce(respond({ success: false }, 502))],
    ['no connection', () => fetchMock.mockRejectedValueOnce(new Error('connect ECONNREFUSED'))],
    ['an answer without personCode', () => fetchMock.mockResolvedValueOnce(respond({ success: true, data: {} }))],
  ])('answers %s with 503 and Retry-After 30', async (_label, arrange) => {
    arrange();

    await expect(new PeopleService(config).myPersonCode(TOKEN)).rejects.toMatchObject({
      code: ErrorCode.SERVICE_UNAVAILABLE,
      retryAfterSec: 30,
    });
  });
});

describe('PeopleService.findByPersonCode', () => {
  const student = {
    personCode: '6704101312',
    personType: 'STUDENT',
    fullNameTh: 'นักศึกษา ทดสอบ',
    universityEmail: 'student@example.test',
    coreUserId: 'user-6704101312',
    status: 'ACTIVE',
  };

  it('reads the person from GET /people/:personCode with the caller token and keeps only four fields', async () => {
    fetchMock.mockResolvedValueOnce(respond({ success: true, data: student }));

    await expect(new PeopleService(config).findByPersonCode('6704101312', TOKEN)).resolves.toEqual({
      personCode: '6704101312',
      personType: 'STUDENT',
      fullNameTh: 'นักศึกษา ทดสอบ',
      coreUserId: 'user-6704101312',
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://core.test/api/v1/people/6704101312');
    expect((init?.headers as Record<string, string>).authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('encodes the code into the path', async () => {
    fetchMock.mockResolvedValueOnce(respond({ success: true, data: { ...student, personCode: 'a b' } }));

    await new PeopleService(config).findByPersonCode('a b', TOKEN);

    expect(fetchMock.mock.calls[0][0]).toBe('http://core.test/api/v1/people/a%20b');
  });

  it('has no coreUserId when the person has no account yet', async () => {
    fetchMock.mockResolvedValueOnce(respond({ success: true, data: { ...student, coreUserId: null } }));

    await expect(new PeopleService(config).findByPersonCode('6704101312', TOKEN)).resolves.toMatchObject({
      coreUserId: null,
    });
  });

  it('is null when Core Hub does not know the code (404)', async () => {
    fetchMock.mockResolvedValueOnce(respond({ success: false }, 404));

    await expect(new PeopleService(config).findByPersonCode('0000000000', TOKEN)).resolves.toBeNull();
  });

  it('answers 403 FORBIDDEN when the caller role may not read people', async () => {
    fetchMock.mockResolvedValueOnce(respond({ success: false }, 403));

    await expect(new PeopleService(config).findByPersonCode('6704101312', TOKEN)).rejects.toMatchObject({
      code: ErrorCode.FORBIDDEN,
      status: 403,
    });
  });

  it('answers 503 + Retry-After 30 when Core Hub is down', async () => {
    fetchMock.mockRejectedValueOnce(new Error('connect ECONNREFUSED'));

    await expect(new PeopleService(config).findByPersonCode('6704101312', TOKEN)).rejects.toMatchObject({
      code: ErrorCode.SERVICE_UNAVAILABLE,
      retryAfterSec: 30,
    });
  });
});
