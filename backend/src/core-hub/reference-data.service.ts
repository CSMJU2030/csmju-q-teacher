import { HttpStatus, Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppException, ErrorCode } from '../common/errors';
import {
  CoreHubCallError,
  DEFAULT_RETRY_AFTER_SEC,
  coreHubFailure,
  getFromCoreHub,
} from './core-hub-http';
import { ReferenceDataEventsLogger } from './reference-data-events.logger';
import {
  REFERENCE_DATASETS,
  ReferenceDatasetConfig,
  ReferenceDatasetName,
} from './reference-datasets';
import { ReferenceItem } from './reference-data.types';

/** ใช้ใน test เพื่อแทนรายการชุดข้อมูล — แอปจริงใช้ REFERENCE_DATASETS */
export const REFERENCE_DATASET_REGISTRY = Symbol('REFERENCE_DATASET_REGISTRY');

interface DatasetCache {
  items: ReferenceItem[];
  fetchedAt: number;
  lastRefreshAttemptAt: number;
  /** Core Hub answered 429: no call to it before this time (its Retry-After). */
  retryNotBefore: number;
  inFlight: Promise<void> | null;
}

interface PageMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const PAGE_LIMIT = 100;

/**
 * ตัวเรียกข้อมูลอ้างอิงจาก Core Hub แบบกลาง (SHARED_DATA_HANDOFF ข้อ 6.3)
 *
 * โครงเดียวกับ JwksService:
 * - cache แยกตามชุดข้อมูล มีอายุ (TTL) — ไม่ยิง Core Hub ทุกคำขอ
 * - กันยิงถี่: เพิ่งลองดึงไม่เกิน minRefreshInterval จะไม่ดึงซ้ำ
 * - คำขอที่มาพร้อมกันรอผลการดึงครั้งเดียว (inFlight แยกตามชุด)
 * - timeout ด้วย AbortController
 * - Core Hub ล่ม/ตอบผิดรูปแบบ แต่มี cache เก่า → ใช้ของเก่าต่อ + log เตือน
 *   ไม่มี cache เลย → 503 SERVICE_UNAVAILABLE + Retry-After (reference-data.md 7.4)
 * - Core Hub ตอบ 429 → ไม่เรียกซ้ำก่อนครบ Retry-After · ระหว่างนั้นใช้ของเก่า
 * - Core Hub ตอบ 401 (session ของผู้ใช้จบแล้ว) → 401 UNAUTHORIZED ให้ frontend พา SSO ใหม่
 *   ไม่ใช่ 503 · 403 → 403 — ทั้งสองเป็นคำตอบเรื่องผู้ใช้คนนั้น ไม่ใช่ Core Hub ล่ม
 *   จึงไม่ใช้ของเก่าแทน และไม่ทำให้ผู้ใช้คนอื่นต้องรอ
 *
 * ไฟล์นี้ต้องไม่มีชื่อชุดข้อมูลใด — ทุกอย่างมาจาก reference-datasets.ts
 */
@Injectable()
export class ReferenceDataService {
  private readonly caches = new Map<string, DatasetCache>();
  private readonly registry: Record<string, ReferenceDatasetConfig>;

  constructor(
    private readonly config: ConfigService,
    private readonly events: ReferenceDataEventsLogger,
    @Optional()
    @Inject(REFERENCE_DATASET_REGISTRY)
    registry?: Record<string, ReferenceDatasetConfig>,
  ) {
    this.registry = registry ?? REFERENCE_DATASETS;
  }

  private get baseUrl(): string {
    return this.config.get<string>('coreHub.url', 'http://localhost:3000').replace(/\/+$/, '');
  }

  private get defaultTtlMs(): number {
    return this.config.get<number>('coreHub.dataCacheTtlMs', 600_000);
  }

  private get minRefreshIntervalMs(): number {
    return this.config.get<number>('coreHub.dataMinRefreshIntervalMs', 30_000);
  }

  private get requestTimeoutMs(): number {
    return this.config.get<number>('coreHub.dataRequestTimeoutMs', 5_000);
  }

  /** รายการที่เปิดใช้งาน · กรองเพิ่มได้ด้วย predicate */
  async list<T extends ReferenceItem>(
    dataset: ReferenceDatasetName,
    token: string,
    predicate?: (item: T) => boolean,
  ): Promise<T[]> {
    const items = (await this.load(dataset, token)) as T[];
    return items.filter((item) => item.isActive && (!predicate || predicate(item)));
  }

  /** รายการเดียว — รวมที่ปิดใช้งานแล้ว (ใช้แสดงชื่อในประวัติ) · ไม่พบคืน null */
  async get<T extends ReferenceItem>(
    dataset: ReferenceDatasetName,
    code: string,
    token: string,
  ): Promise<T | null> {
    let found = (await this.load(dataset, token)).find((item) => item.code === code);

    // code ที่ยังไม่เห็น อาจเพิ่งถูกสร้างที่ Core Hub — ดึงใหม่ได้อีกครั้ง (มีกันยิงถี่)
    if (!found && this.canAttemptRefresh(this.cacheOf(dataset), Date.now())) {
      await this.refresh(dataset, token, 'unknown_code');
      found = this.cacheOf(dataset).items.find((item) => item.code === code);
    }
    return (found as T | undefined) ?? null;
  }

  /** ใช้ตอนรับข้อมูลเข้า — code ต้องมีจริงและเปิดใช้งานอยู่ ไม่งั้น VALIDATION_ERROR (400) */
  async assertActive(dataset: ReferenceDatasetName, code: string, token: string): Promise<void> {
    const item = await this.get(dataset, code, token);
    if (!item || !item.isActive) {
      throw new AppException(
        ErrorCode.VALIDATION_ERROR,
        `ไม่พบ ${dataset} รหัส ${code} หรือถูกปิดใช้งานแล้ว`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /** ล้าง cache ทั้งหมด (ใช้ใน test) */
  reset(): void {
    this.caches.clear();
  }

  // ---------------------------------------------------------------------------

  private datasetConfig(dataset: string): ReferenceDatasetConfig {
    const config = this.registry[dataset];
    if (!config) {
      throw new AppException(
        ErrorCode.INTERNAL_ERROR,
        `Unknown reference dataset: ${dataset}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    return config;
  }

  private cacheOf(dataset: string): DatasetCache {
    let cache = this.caches.get(dataset);
    if (!cache) {
      cache = { items: [], fetchedAt: 0, lastRefreshAttemptAt: 0, retryNotBefore: 0, inFlight: null };
      this.caches.set(dataset, cache);
    }
    return cache;
  }

  private isFresh(dataset: string, cache: DatasetCache, now: number): boolean {
    const ttl = this.datasetConfig(dataset).ttlMs ?? this.defaultTtlMs;
    return cache.fetchedAt > 0 && now - cache.fetchedAt < ttl;
  }

  /** ลองดึงได้เมื่อพ้นช่วงกันยิงถี่ และพ้น Retry-After ที่ Core Hub ขอไว้ */
  private canAttemptRefresh(cache: DatasetCache, now: number): boolean {
    return (
      now - cache.lastRefreshAttemptAt >= this.minRefreshIntervalMs && now >= cache.retryNotBefore
    );
  }

  /** อีกกี่วินาทีระบบนี้จะลองถาม Core Hub ใหม่ — ค่า Retry-After ของคำตอบ 503 */
  private secondsUntilRetry(cache: DatasetCache, now: number): number {
    const next = Math.max(cache.lastRefreshAttemptAt + this.minRefreshIntervalMs, cache.retryNotBefore);
    return Math.max(1, Math.ceil((next - now) / 1000));
  }

  /** คืนรายการทั้งหมดใน cache (รวมที่ปิดใช้งาน) โดยดึงใหม่เมื่อจำเป็น */
  private async load(dataset: string, token: string): Promise<ReferenceItem[]> {
    const cache = this.cacheOf(dataset);
    const now = Date.now();

    if (this.isFresh(dataset, cache, now)) {
      return cache.items;
    }
    const canRefresh = this.canAttemptRefresh(cache, now);
    // หมดอายุแล้ว แต่กำลังดึงอยู่ เพิ่งล้มไป หรือ Core Hub ขอให้รอ — ใช้ของเก่าต่อ ไม่ยิงถี่
    if (cache.fetchedAt > 0 && !canRefresh) {
      return cache.items;
    }
    // ไม่มีอะไรเลย และเพิ่งล้มไปหรือยังไม่พ้น Retry-After — 503 ทันที ไม่ยิงซ้ำ
    if (cache.fetchedAt === 0 && !canRefresh && !cache.inFlight) {
      throw AppException.serviceUnavailable(
        'Core Hub reference data is currently unavailable',
        this.secondsUntilRetry(cache, now),
      );
    }

    await this.refresh(dataset, token, cache.fetchedAt === 0 ? 'cache_empty' : 'cache_stale');
    return cache.items;
  }

  /** ดึงทั้งชุด — คำขอที่มาพร้อมกันรอผลเดียวกัน */
  private refresh(dataset: string, token: string, reason: string): Promise<void> {
    const cache = this.cacheOf(dataset);
    if (cache.inFlight) {
      return cache.inFlight;
    }
    const previousAttemptAt = cache.lastRefreshAttemptAt;
    cache.lastRefreshAttemptAt = Date.now();
    cache.inFlight = this.doRefresh(dataset, cache, token, reason, previousAttemptAt).finally(() => {
      cache.inFlight = null;
    });
    return cache.inFlight;
  }

  private async doRefresh(
    dataset: string,
    cache: DatasetCache,
    token: string,
    reason: string,
    previousAttemptAt: number,
  ): Promise<void> {
    try {
      const items: ReferenceItem[] = [];
      let page = 1;
      let totalPages = 1;
      do {
        const body = await this.fetchPage(dataset, token, page);
        items.push(...body.data);
        totalPages = body.meta.totalPages;
        page += 1;
      } while (page <= totalPages);

      cache.items = items;
      cache.fetchedAt = Date.now();
      this.events.refresh({ dataset, reason, itemCount: items.length });
    } catch (error) {
      this.events.refreshFailed({
        dataset,
        reason: error instanceof Error ? error.message : 'unknown error',
        cachedItemCount: cache.items.length,
      });

      // 401/403 ตอบเรื่องผู้ใช้คนนี้ ไม่ใช่ Core Hub ล่ม: ผู้ใช้คนอื่นดึงใหม่ได้ทันที
      // และห้ามใช้ของเก่าแทน — 401 ต้องถึง frontend เพื่อพา SSO ใหม่
      if (error instanceof CoreHubCallError && error.isRefusal) {
        cache.lastRefreshAttemptAt = previousAttemptAt;
        throw coreHubFailure(error);
      }
      // 429: เคารพ Retry-After — ไม่เรียกซ้ำก่อนครบเวลา
      if (error instanceof CoreHubCallError && error.status === 429) {
        cache.retryNotBefore =
          Date.now() + (error.retryAfterSec ?? DEFAULT_RETRY_AFTER_SEC) * 1000;
      }

      // ใช้ของเก่าต่อเมื่อเคยดึงสำเร็จ — ล้มจริงเฉพาะตอนไม่มี cache เลย
      if (cache.fetchedAt === 0) {
        throw coreHubFailure(error, this.secondsUntilRetry(cache, Date.now()));
      }
    }
  }

  private async fetchPage(
    dataset: string,
    token: string,
    page: number,
  ): Promise<{ data: ReferenceItem[]; meta: PageMeta }> {
    const { path } = this.datasetConfig(dataset);
    const url = `${this.baseUrl}/api/v1${path}?limit=${PAGE_LIMIT}&includeInactive=true&page=${page}`;

    return this.validate(await getFromCoreHub(url, token, this.requestTimeoutMs));
  }

  /** ตรวจรูปแบบคำตอบตามสัญญากลาง — ไม่ครบถือว่าล้ม (ไม่เขียนทับ cache ที่ดี) */
  private validate(body: unknown): { data: ReferenceItem[]; meta: PageMeta } {
    if (typeof body !== 'object' || body === null) {
      throw new Error('Response is not a JSON object');
    }
    const { success, data, meta } = body as { success?: unknown; data?: unknown; meta?: unknown };
    if (success !== true || !Array.isArray(data)) {
      throw new Error('Response must be { success: true, data: [...] }');
    }
    const m = meta as Partial<PageMeta> | undefined;
    if (
      !m ||
      typeof m.total !== 'number' ||
      typeof m.page !== 'number' ||
      typeof m.limit !== 'number' ||
      typeof m.totalPages !== 'number'
    ) {
      throw new Error('Response has no valid meta { total, page, limit, totalPages }');
    }
    for (const item of data as unknown[]) {
      const row = item as Partial<ReferenceItem> | null;
      if (
        !row ||
        typeof row.code !== 'string' ||
        typeof row.isActive !== 'boolean' ||
        typeof row.updatedAt !== 'string'
      ) {
        throw new Error('Every item must have code, isActive and updatedAt');
      }
    }
    return { data: data as ReferenceItem[], meta: m as PageMeta };
  }
}
