import { HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppException, ErrorCode } from '../common/errors';
import { ReferenceDataEventsLogger } from './reference-data-events.logger';
import { ReferenceDataService } from './reference-data.service';
import { ReferenceDatasetConfig, ReferenceDatasetName } from './reference-datasets';

// ชุดข้อมูลทดสอบที่ไม่ใช่ของจริง — พิสูจน์ว่า service ไม่ผูกกับชุดใด
const REGISTRY: Record<string, ReferenceDatasetConfig> = {
  widgets: { path: '/widgets' },
  gadgets: { path: '/gadgets', ttlMs: 1_000 },
};
const WIDGETS = 'widgets' as ReferenceDatasetName;
const GADGETS = 'gadgets' as ReferenceDatasetName;
const TOKEN = 'secret-token-value';

const item = (code: string, isActive = true) => ({
  code,
  isActive,
  updatedAt: '2026-09-25T09:00:00.000Z',
});

const okBody = (data: unknown[], page = 1, totalPages = 1) => ({
  success: true,
  data,
  meta: { total: data.length, page, limit: 100, totalPages },
});

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

const failure = (status: number, headers: Record<string, string> = {}) =>
  jsonResponse({ success: false, error: { code: 'INTERNAL_ERROR', message: 'x' } }, status, headers);

function setup(overrides: Record<string, number> = {}) {
  const values: Record<string, unknown> = {
    'coreHub.url': 'http://core.test',
    'coreHub.dataCacheTtlMs': 60_000,
    'coreHub.dataMinRefreshIntervalMs': 30_000,
    'coreHub.dataRequestTimeoutMs': 5_000,
    ...overrides,
  };
  const config = {
    get: <T>(key: string, fallback?: T): T => (values[key] as T) ?? (fallback as T),
  } as unknown as ConfigService;
  const events = new ReferenceDataEventsLogger();
  const refresh = jest.spyOn(events, 'refresh').mockImplementation(() => undefined);
  const refreshFailed = jest.spyOn(events, 'refreshFailed').mockImplementation(() => undefined);
  const service = new ReferenceDataService(config, events, REGISTRY);
  return { service, refresh, refreshFailed };
}

const urlOf = (u: string | URL | Request): string =>
  typeof u === 'string' ? u : u instanceof URL ? u.href : u.url;

let now = 1_000_000;
let fetchMock: jest.SpiedFunction<typeof fetch>;

beforeEach(() => {
  now = 1_000_000;
  jest.spyOn(Date, 'now').mockImplementation(() => now);
  fetchMock = jest.spyOn(global, 'fetch');
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('ReferenceDataService', () => {
  it('cache ยังไม่หมดอายุ → ไม่ยิง Core Hub ซ้ำ', async () => {
    const { service } = setup();
    fetchMock.mockResolvedValue(jsonResponse(okBody([item('A')])));
    await service.list(WIDGETS, TOKEN);
    now += 59_000;
    await service.list(WIDGETS, TOKEN);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('cache หมดอายุ → ยิงใหม่ 1 ครั้ง · ชุดที่ตั้ง ttlMs เองใช้ค่าของมัน', async () => {
    const { service } = setup({ 'coreHub.dataMinRefreshIntervalMs': 1 });
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse(okBody([item('A')]))));
    await service.list(GADGETS, TOKEN);
    now += 1_500; // เกิน ttl ของ gadgets (1 วินาที) แต่ไม่เกินค่าเริ่มต้น
    await service.list(GADGETS, TOKEN);
    await service.list(WIDGETS, TOKEN);
    now += 1_500;
    await service.list(WIDGETS, TOKEN);
    const gadgetCalls = fetchMock.mock.calls.filter(([u]) => urlOf(u).includes('/gadgets'));
    const widgetCalls = fetchMock.mock.calls.filter(([u]) => urlOf(u).includes('/widgets'));
    expect(gadgetCalls).toHaveLength(2);
    expect(widgetCalls).toHaveLength(1);
  });

  it('คำขอ 10 ตัวพร้อมกันตอน cache ว่าง → ยิงแค่ 1 ครั้งต่อชุด', async () => {
    const { service } = setup();
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse(okBody([item('A')]))));
    await Promise.all([
      ...Array.from({ length: 10 }, () => service.list(WIDGETS, TOKEN)),
      ...Array.from({ length: 10 }, () => service.list(GADGETS, TOKEN)),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('cache ของชุดหนึ่งไม่ไปทับอีกชุด', async () => {
    const { service } = setup();
    fetchMock.mockImplementation((url) =>
      Promise.resolve(
        jsonResponse(okBody([item(urlOf(url).includes('/widgets') ? 'W-1' : 'G-1')])),
      ),
    );
    const widgets = await service.list(WIDGETS, TOKEN);
    const gadgets = await service.list(GADGETS, TOKEN);
    expect(widgets.map((w) => w.code)).toEqual(['W-1']);
    expect(gadgets.map((g) => g.code)).toEqual(['G-1']);
  });

  it('ดึงหลายหน้า (totalPages: 3) → ได้ครบทุกหน้า และขอ limit=100 includeInactive=true', async () => {
    const { service } = setup();
    fetchMock
      .mockResolvedValueOnce(jsonResponse(okBody([item('P1')], 1, 3)))
      .mockResolvedValueOnce(jsonResponse(okBody([item('P2')], 2, 3)))
      .mockResolvedValueOnce(jsonResponse(okBody([item('P3')], 3, 3)));
    const items = await service.list(WIDGETS, TOKEN);
    expect(items.map((i) => i.code)).toEqual(['P1', 'P2', 'P3']);
    expect(urlOf(fetchMock.mock.calls[0][0])).toBe(
      'http://core.test/api/v1/widgets?limit=100&includeInactive=true&page=1',
    );
    expect(urlOf(fetchMock.mock.calls[2][0])).toContain('page=3');
  });

  it('Core Hub ล่มแต่มี cache เก่า → คืนของเก่า + log core_data.refresh.failure', async () => {
    const { service, refreshFailed } = setup();
    fetchMock.mockResolvedValueOnce(jsonResponse(okBody([item('A')])));
    await service.list(WIDGETS, TOKEN);
    now += 61_000;
    fetchMock.mockRejectedValueOnce(new Error('connect ECONNREFUSED'));
    const items = await service.list(WIDGETS, TOKEN);
    expect(items.map((i) => i.code)).toEqual(['A']);
    expect(refreshFailed).toHaveBeenCalledWith(
      expect.objectContaining({ dataset: 'widgets', cachedItemCount: 1 }),
    );
  });

  it('Core Hub ล่มและไม่มี cache → 503 SERVICE_UNAVAILABLE + Retry-After 30', async () => {
    const { service } = setup();
    fetchMock.mockRejectedValue(new Error('connect ECONNREFUSED'));
    await expect(service.list(WIDGETS, TOKEN)).rejects.toMatchObject({
      code: ErrorCode.SERVICE_UNAVAILABLE,
      status: HttpStatus.SERVICE_UNAVAILABLE,
      retryAfterSec: 30,
    });
  });

  it.each([500, 502, 503, 504])('Core Hub ตอบ %d และไม่มี cache → 503 + Retry-After', async (status) => {
    const { service } = setup();
    fetchMock.mockResolvedValue(failure(status));
    await expect(service.list(WIDGETS, TOKEN)).rejects.toMatchObject({
      code: ErrorCode.SERVICE_UNAVAILABLE,
      retryAfterSec: 30,
    });
  });

  it('ล้มแล้วไม่มี cache → คำขอถัดไปภายใน 30 วินาทีได้ 503 ทันที ไม่ยิง Core Hub ซ้ำ', async () => {
    const { service } = setup();
    fetchMock.mockResolvedValue(failure(503));
    await expect(service.list(WIDGETS, TOKEN)).rejects.toBeInstanceOf(AppException);

    now += 10_000;
    await expect(service.list(WIDGETS, TOKEN)).rejects.toMatchObject({
      code: ErrorCode.SERVICE_UNAVAILABLE,
      retryAfterSec: 20,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    now += 20_000;
    fetchMock.mockResolvedValueOnce(jsonResponse(okBody([item('A')])));
    expect((await service.list(WIDGETS, TOKEN)).map((i) => i.code)).toEqual(['A']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('Core Hub ตอบ 401 → 401 UNAUTHORIZED ไม่ใช่ 503 แม้มี cache เก่า', async () => {
    const { service } = setup();
    fetchMock.mockResolvedValueOnce(jsonResponse(okBody([item('A')])));
    await service.list(WIDGETS, TOKEN);
    now += 61_000;
    fetchMock.mockResolvedValueOnce(failure(401));

    await expect(service.list(WIDGETS, TOKEN)).rejects.toMatchObject({
      code: ErrorCode.UNAUTHORIZED,
      status: HttpStatus.UNAUTHORIZED,
    });
  });

  it('401 ของผู้ใช้คนหนึ่งไม่ทำให้ผู้ใช้คนอื่นต้องรอ 30 วินาที', async () => {
    const { service } = setup();
    fetchMock.mockResolvedValueOnce(failure(401));
    await expect(service.list(WIDGETS, 'ended-session')).rejects.toMatchObject({
      code: ErrorCode.UNAUTHORIZED,
    });

    fetchMock.mockResolvedValueOnce(jsonResponse(okBody([item('A')])));
    expect((await service.list(WIDGETS, TOKEN)).map((i) => i.code)).toEqual(['A']);
  });

  it('Core Hub ตอบ 403 → 403 FORBIDDEN', async () => {
    const { service } = setup();
    fetchMock.mockResolvedValueOnce(failure(403));
    await expect(service.list(WIDGETS, TOKEN)).rejects.toMatchObject({
      code: ErrorCode.FORBIDDEN,
      status: HttpStatus.FORBIDDEN,
    });
  });

  it('Core Hub ตอบ 429 → ใช้ของเก่า และไม่เรียกซ้ำก่อนครบ Retry-After', async () => {
    const { service } = setup();
    fetchMock.mockResolvedValueOnce(jsonResponse(okBody([item('A')])));
    await service.list(WIDGETS, TOKEN);
    now += 61_000;
    fetchMock.mockResolvedValueOnce(failure(429, { 'retry-after': '120' }));
    expect((await service.list(WIDGETS, TOKEN)).map((i) => i.code)).toEqual(['A']);

    // เลยช่วงกันยิงถี่ 30 วินาทีแล้ว แต่ยังไม่ครบ 120 วินาทีที่ Core Hub ขอ
    now += 60_000;
    expect((await service.list(WIDGETS, TOKEN)).map((i) => i.code)).toEqual(['A']);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    now += 61_000;
    fetchMock.mockResolvedValueOnce(jsonResponse(okBody([item('B')])));
    expect((await service.list(WIDGETS, TOKEN)).map((i) => i.code)).toEqual(['B']);
  });

  it('Core Hub ตอบ 429 และไม่มี cache → 503 + Retry-After ค่าเดียวกัน', async () => {
    const { service } = setup();
    fetchMock.mockResolvedValueOnce(failure(429, { 'retry-after': '120' }));
    await expect(service.list(WIDGETS, TOKEN)).rejects.toMatchObject({
      code: ErrorCode.SERVICE_UNAVAILABLE,
      status: HttpStatus.SERVICE_UNAVAILABLE,
      retryAfterSec: 120,
    });

    now += 100_000;
    await expect(service.list(WIDGETS, TOKEN)).rejects.toMatchObject({ retryAfterSec: 20 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('timeout ทำงานจริง', async () => {
    jest.restoreAllMocks();
    fetchMock = jest.spyOn(global, 'fetch');
    const { service, refreshFailed } = setup({ 'coreHub.dataRequestTimeoutMs': 20 });
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    await expect(service.list(WIDGETS, TOKEN)).rejects.toMatchObject({
      code: ErrorCode.SERVICE_UNAVAILABLE,
    });
    expect(refreshFailed).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'Core Hub did not answer within 20 ms' }),
    );
  });

  it('คำตอบรูปแบบผิด → ถือว่าล้ม ไม่เขียนทับ cache ที่ดี', async () => {
    const { service } = setup();
    fetchMock.mockResolvedValueOnce(jsonResponse(okBody([item('GOOD')])));
    await service.list(WIDGETS, TOKEN);

    now += 61_000;
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, data: [item('X')] })); // ไม่มี meta
    expect((await service.list(WIDGETS, TOKEN)).map((i) => i.code)).toEqual(['GOOD']);

    now += 31_000;
    fetchMock.mockResolvedValueOnce(jsonResponse(okBody([{ isActive: true, updatedAt: 'x' }]))); // ไม่มี code
    expect((await service.list(WIDGETS, TOKEN)).map((i) => i.code)).toEqual(['GOOD']);
  });

  it('list คืนเฉพาะที่เปิด · get คืนที่ปิดแล้วได้ · ไม่พบคืน null', async () => {
    const { service } = setup();
    // code มีตัวเลขและ "-" แบบ code จริง — API-04 ของ standards 1.0.0 อ่าน code: 'ตัวใหญ่ล้วน' เป็น error code
    fetchMock.mockResolvedValue(jsonResponse(okBody([item('ON-1'), item('OFF-1', false)])));
    expect((await service.list(WIDGETS, TOKEN)).map((i) => i.code)).toEqual(['ON-1']);
    expect(await service.get(WIDGETS, 'OFF-1', TOKEN)).toMatchObject({
      code: 'OFF-1',
      isActive: false,
    });
    expect(await service.get(WIDGETS, 'NONE', TOKEN)).toBeNull();
  });

  it('list กรองเพิ่มด้วย predicate', async () => {
    const { service } = setup();
    fetchMock.mockResolvedValue(jsonResponse(okBody([item('LAB-1'), item('LECT-1')])));
    const labs = await service.list(WIDGETS, TOKEN, (i) => i.code.startsWith('LAB'));
    expect(labs.map((i) => i.code)).toEqual(['LAB-1']);
  });

  it('assertActive กับ code ที่ไม่มี / ปิดแล้ว → VALIDATION_ERROR (400)', async () => {
    const { service } = setup();
    fetchMock.mockResolvedValue(jsonResponse(okBody([item('ON'), item('OFF', false)])));
    await expect(service.assertActive(WIDGETS, 'ON', TOKEN)).resolves.toBeUndefined();
    for (const code of ['OFF', 'NONE']) {
      await expect(service.assertActive(WIDGETS, code, TOKEN)).rejects.toMatchObject({
        code: ErrorCode.VALIDATION_ERROR,
        status: HttpStatus.BAD_REQUEST,
      });
    }
  });

  it('ส่ง token ใน Authorization แต่ log ไม่มี token หลุดออกไป', async () => {
    const { service, refresh, refreshFailed } = setup();
    fetchMock.mockResolvedValueOnce(jsonResponse(okBody([item('A')])));
    await service.list(WIDGETS, TOKEN);
    now += 61_000;
    fetchMock.mockResolvedValueOnce(jsonResponse({ nope: true }, 500));
    await service.list(WIDGETS, TOKEN);

    const headers = fetchMock.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers.authorization).toBe(`Bearer ${TOKEN}`);
    const logged = JSON.stringify([...refresh.mock.calls, ...refreshFailed.mock.calls]);
    expect(logged).not.toContain(TOKEN);
  });
});
