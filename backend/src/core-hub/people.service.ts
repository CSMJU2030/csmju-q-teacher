import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CoreHubCallError, coreHubFailure, getFromCoreHub } from './core-hub-http';

/**
 * ข้อมูลบุคคลจาก Core Hub (reference-data.md ข้อ 5) — ไม่ใช่ข้อมูลอ้างอิง
 *
 * - **ห้าม cache ทุกแบบ** แม้แยกรายคน: เรียกตอนใช้ด้วย token ของผู้ใช้คนนั้นทุกครั้ง
 * - ระบบนี้เก็บได้แค่ `person_code` ตอนเกิดรายการ (ข้อ 8) — ไม่เก็บชื่อ อีเมล หรือ field อื่น
 *   คำตอบของ /people/me มีชื่อและอีเมล จึงไม่ log และไม่ส่งต่อทั้งก้อน
 */
/**
 * What Q-Teacher reads about another person (GET /people/:personCode). The name
 * is shown on the screen it was asked for and then dropped - never stored,
 * cached or logged (reference-data.md 5, 8).
 */
export interface PersonSummary {
  personCode: string;
  personType: string | null;
  fullNameTh: string | null;
  /** The `sub` of the account linked to this person; null when no account exists yet. */
  coreUserId: string | null;
}

@Injectable()
export class PeopleService {
  constructor(private readonly config: ConfigService) {}

  private get baseUrl(): string {
    return this.config.get<string>('coreHub.url', 'http://localhost:3000').replace(/\/+$/, '');
  }

  private get requestTimeoutMs(): number {
    return this.config.get<number>('coreHub.dataRequestTimeoutMs', 5_000);
  }

  /**
   * `personCode` ของผู้เรียก จาก `GET /people/me` — รหัสนักศึกษา หรือส่วนหน้าอีเมลของบุคลากร
   *
   * - บัญชียังไม่ผูกกับบุคคล (`data: null` เช่น บัญชีทดสอบ) → null
   * - role ที่อ่านไม่ได้ (`guest` ได้ 403) → null
   * - Core Hub ตอบ 401 → 401 UNAUTHORIZED ให้ frontend พา SSO ใหม่
   * - 429 → 503 + Retry-After ของ Core Hub · ล่ม/timeout/คำตอบผิดรูปแบบ → 503 + Retry-After 30
   */
  async myPersonCode(token: string): Promise<string | null> {
    let body: unknown;
    try {
      body = await getFromCoreHub(`${this.baseUrl}/api/v1/people/me`, token, this.requestTimeoutMs);
    } catch (error) {
      if (error instanceof CoreHubCallError && error.status === 403) {
        return null;
      }
      throw coreHubFailure(error);
    }

    const { success, data } = (body ?? {}) as { success?: unknown; data?: unknown };
    if (success === true && data === null) {
      return null;
    }
    const personCode = (data as { personCode?: unknown } | undefined)?.personCode;
    if (success !== true || typeof personCode !== 'string' || personCode.length === 0) {
      throw coreHubFailure(new Error('GET /people/me answered without a personCode'));
    }
    return personCode;
  }

  /**
   * One person by `personCode`, from `GET /people/:personCode` with the
   * caller's own token - allowed for lecturer / staff / admin only
   * (reference-data.md 2.2).
   *
   * - no such person (404) -> null
   * - a role that may not read people (403) -> 403 FORBIDDEN
   * - 401 / 429 / 5xx / timeout -> as `myPersonCode`
   *
   * Never called once per row of a list (7.2): it serves one student at the
   * moment a teacher puts them into the queue, and one name on a detail screen.
   */
  async findByPersonCode(personCode: string, token: string): Promise<PersonSummary | null> {
    let body: unknown;
    try {
      body = await getFromCoreHub(
        `${this.baseUrl}/api/v1/people/${encodeURIComponent(personCode)}`,
        token,
        this.requestTimeoutMs,
      );
    } catch (error) {
      if (error instanceof CoreHubCallError && error.status === 404) {
        return null;
      }
      throw coreHubFailure(error);
    }

    const { success, data } = (body ?? {}) as { success?: unknown; data?: unknown };
    const row = (data ?? null) as Record<string, unknown> | null;
    if (success !== true || row === null || typeof row.personCode !== 'string') {
      throw coreHubFailure(new Error('GET /people/:personCode answered without a personCode'));
    }

    return {
      personCode: row.personCode,
      personType: typeof row.personType === 'string' ? row.personType : null,
      fullNameTh: typeof row.fullNameTh === 'string' ? row.fullNameTh : null,
      coreUserId: typeof row.coreUserId === 'string' && row.coreUserId.length > 0 ? row.coreUserId : null,
    };
  }
}
