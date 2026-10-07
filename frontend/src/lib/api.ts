import { cache } from "react";
import { cookies } from "next/headers";
import type { components } from "./api-types";

/**
 * Server-only client for this subsystem's own backend. The browser never
 * calls the backend with a token of its own: pages and server actions
 * forward the HttpOnly SSO cookie, and the backend verifies it against the
 * Core Hub JWKS on every request.
 *
 * Every type below comes from backend/openapi.json (pnpm generate:api-types):
 * none is written by hand (API-01).
 */
const BACKEND_URL = process.env.BACKEND_URL ?? "http://127.0.0.1:4224";

/**
 * The session cookie the backend sets at /auth/callback: `<SUBSYSTEM_ID>_access_token`
 * with `-` as `_` (auth-contract 5.1). HttpOnly - only this server reads it.
 */
export const SSO_COOKIE = `${(process.env.SUBSYSTEM_ID ?? "csmju-q-teacher").replace(/-/g, "_")}_access_token`;

type Schemas = components["schemas"];
export type Me = Schemas["MeModel"];
export type SubsystemRole = Me["subsystemRole"];
export type OfficeHour = Schemas["OfficeHourResponse"];
export type Weekday = OfficeHour["dayOfWeek"];
export type Booking = Schemas["BookingResponse"];
export type BookingStatus = Booking["status"];
export type ChatMessage = Schemas["ChatMessageResponse"];
export type ScheduleSlot = Schemas["ScheduleSlotResponse"];
export type Teacher = Schemas["TeacherResponse"];
export type BookingException = Schemas["BookingExceptionResponse"];
export type PaginationMeta = Schemas["PaginationMetaModel"];

type ErrorBody = { code: string; message: string; details?: unknown };

type Envelope<T> =
  | { success: true; data: T; meta?: PaginationMeta }
  | { success: false; error: ErrorBody };

export type ApiResult<T> =
  | { ok: true; data: T; meta?: PaginationMeta }
  | { ok: false; status: number; code: string; message: string };

/**
 * The backend answered 401: no session, or one that ended (expired, or Core
 * Hub signed the user out). The page then renders <ReSignIn />.
 */
export const isUnauthorized = (...results: ApiResult<unknown>[]) =>
  results.some((result) => !result.ok && result.status === 401);

/** Teachers (and an admin) run the schedule; the backend enforces it either way. */
export const isTeacherSide = (me: Me) => me.subsystemRole === "TEACHER" || me.subsystemRole === "ADMIN";

/** Whether this browser has a session cookie at all - a first visit has none. */
export async function hasSession(): Promise<boolean> {
  return (await cookies()).has(SSO_COOKIE);
}

export async function call<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<ApiResult<T>> {
  const token = (await cookies()).get(SSO_COOKIE)?.value;
  if (!token) return { ok: false, status: 401, code: "UNAUTHORIZED", message: "ยังไม่ได้เข้าสู่ระบบ" };

  let res: Response;
  try {
    res = await fetch(`${BACKEND_URL}${path}`, {
      method: init.method ?? "GET",
      headers: {
        Cookie: `${SSO_COOKIE}=${encodeURIComponent(token)}`,
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });
  } catch {
    return {
      ok: false,
      status: 503,
      code: "SERVICE_UNAVAILABLE",
      message: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง",
    };
  }

  const body = (await res.json().catch(() => null)) as Envelope<T> | null;
  if (res.ok && body?.success) return { ok: true, data: body.data, meta: body.meta };
  if (body && !body.success) {
    return { ok: false, status: res.status, code: body.error.code, message: describeError(res.status, body.error) };
  }
  return { ok: false, status: res.status, code: "INTERNAL_ERROR", message: describeError(res.status) };
}

/** Standard Thai wording per error code (ui-design-system 9.3); the backend's own Thai message wins when it has one. */
function describeError(status: number, error?: ErrorBody): string {
  if (status === 403) return "คุณไม่มีสิทธิ์ทำรายการนี้ หากคิดว่าเป็นข้อผิดพลาด กรุณาติดต่อผู้ดูแลระบบย่อยนี้";
  if (status === 429) return "มีการใช้งานถี่เกินไป กรุณารอสักครู่แล้วลองใหม่";
  if (status >= 500) return "ระบบขัดข้องชั่วคราว กรุณาลองอีกครั้ง หากยังพบปัญหา กรุณาแจ้งผู้ดูแลระบบ";
  const thai = error && /[฀-๿]/.test(error.message) ? error.message : null;
  if (thai) return thai;
  // Validation errors from the pipe come as a list of messages (some written in Thai).
  if (Array.isArray(error?.details)) {
    const lines = (error.details as unknown[]).filter((line): line is string => typeof line === "string");
    if (lines.length > 0) return lines.join(" · ");
  }
  if (status === 404) return "ไม่พบข้อมูลที่ต้องการ อาจถูกลบไปแล้วหรือลิงก์ไม่ถูกต้อง";
  if (status === 409) return "ข้อมูลขัดแย้งกับรายการที่มีอยู่แล้ว กรุณารีเฟรชแล้วลองใหม่";
  return "ข้อมูลที่ส่งไม่ถูกต้อง กรุณาตรวจสอบแล้วลองอีกครั้ง";
}

/** GET /api/v1/me - the identity the backend verified from the Core Hub token (once per request). */
export const getMe = cache(() => call<Me>("/api/v1/me"));

const qs = (params: Record<string, string | number | undefined>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
};

export const listTeachers = () => call<Teacher[]>(`/api/v1/teachers${qs({ limit: 100 })}`);

export const listOfficeHours = () => call<OfficeHour[]>(`/api/v1/office-hours${qs({ limit: 100 })}`);

export const listBookings = (query: {
  status?: BookingStatus;
  from?: string;
  to?: string;
  sort?: "startsAt" | "-startsAt" | "-createdAt";
  page?: number;
  limit?: number;
}) => call<Booking[]>(`/api/v1/bookings${qs(query)}`);

export const getBooking = (id: string) => call<Booking>(`/api/v1/bookings/${encodeURIComponent(id)}`);

export const listChatMessages = (bookingId: string) =>
  call<ChatMessage[]>(`/api/v1/chat-messages${qs({ bookingId, limit: 100 })}`);

/** A whole week of slots: the backend pages at 100, so keep asking until the last page. */
export async function listScheduleSlots(
  teacherCoreUserId: string | undefined,
  weekStart: string,
): Promise<ApiResult<ScheduleSlot[]>> {
  const slots: ScheduleSlot[] = [];
  for (let page = 1; page <= 10; page += 1) {
    const result = await call<ScheduleSlot[]>(
      `/api/v1/schedule-slots${qs({ teacherCoreUserId, weekStart, page, limit: 100 })}`,
    );
    if (!result.ok) return result;
    slots.push(...result.data);
    if (!result.meta || page >= result.meta.totalPages) break;
  }
  return { ok: true, data: slots };
}

/** GET /api/health - public. */
export async function getHealth(): Promise<{ status: string; service?: string } | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/health`, { cache: "no-store" });
    const body = (await res.json()) as Envelope<{ status: string; service?: string }>;
    return body.success ? body.data : null;
  } catch {
    return null;
  }
}
