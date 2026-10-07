/**
 * รายการชุดข้อมูลอ้างอิงจาก Core Hub — ไฟล์เดียวที่ต้องแก้เมื่อมีชุดข้อมูลใหม่
 * (SHARED_DATA_HANDOFF ข้อ 6.2 · สารบัญอยู่ใน csmju2030-standards/docs/reference-data.md)
 */
export interface ReferenceDatasetConfig {
  /** path ใต้ /api/v1 ของ Core Hub */
  path: string;
  /** ถ้าไม่ใส่ ใช้ค่าเริ่มต้นจาก CORE_HUB_DATA_CACHE_TTL_MS */
  ttlMs?: number;
}

export const REFERENCE_DATASETS = {
  faculties: { path: '/faculties' },
  rooms: { path: '/rooms' },
  'academic-terms': { path: '/academic-terms' },
} as const satisfies Record<string, ReferenceDatasetConfig>;

export type ReferenceDatasetName = keyof typeof REFERENCE_DATASETS;
