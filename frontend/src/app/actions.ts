"use server";

import { redirect } from "next/navigation";
import { call, type ApiResult, type Weekday } from "@/lib/api";
import { sameSitePath } from "@/lib/sign-in";

/**
 * Form actions. Each forwards the SSO cookie to the backend, which checks the
 * permission itself - hiding a button is only a convenience. The result goes
 * back to the page as ?ok= / ?error= so the pages need no client JavaScript.
 */

const text = (formData: FormData, name: string) => String(formData.get(name) ?? "").trim();

/** Where a form came from (a path of this site), without an earlier result in its query. */
function returnPath(formData: FormData, fallback: string): string {
  const url = new URL(sameSitePath(text(formData, "returnTo") || fallback), "http://local");
  url.searchParams.delete("ok");
  url.searchParams.delete("error");
  return `${url.pathname}${url.search}`;
}

function withResult(path: string, result: Record<string, string>): string {
  const url = new URL(path, "http://local");
  for (const [key, value] of Object.entries(result)) url.searchParams.set(key, value);
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * The backend answered 401 to a form: the session ended (or Core Hub signed
 * the user out). An action cannot navigate the top-level page to /auth/login,
 * so /signin-again asks the user and does it (auth-contract 7), then returns
 * to the form's page with a note on why it is empty again.
 */
function signInAgain(path: string): never {
  const page = withResult(path, { error: "การเข้าสู่ระบบหมดอายุ กรุณาส่งอีกครั้ง" });
  redirect(`/signin-again?${new URLSearchParams({ next: page })}`);
}

function back(path: string, result: ApiResult<unknown>, done: string, to?: string): never {
  if (!result.ok && result.status === 401) signInAgain(path);
  redirect(result.ok ? withResult(to ?? path, { ok: done }) : withResult(path, { error: result.message }));
}

/** A time of day typed as HH:mm. */
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function createOfficeHour(formData: FormData) {
  const path = returnPath(formData, "/office-hours");
  const startTime = text(formData, "startTime");
  const endTime = text(formData, "endTime");
  if (!TIME_PATTERN.test(startTime) || !TIME_PATTERN.test(endTime)) {
    back(path, { ok: false, status: 400, code: "VALIDATION_ERROR", message: "กรุณาระบุเวลาเริ่มและเวลาสิ้นสุดให้ครบ" }, "");
  }

  const result = await call("/api/v1/office-hours", {
    method: "POST",
    body: {
      dayOfWeek: text(formData, "dayOfWeek") as Weekday,
      startTime,
      endTime,
      slotMinutes: Number(text(formData, "slotMinutes")) || undefined,
    },
  });
  back(path, result, "เพิ่มเวลาทำการแล้ว");
}

export async function toggleOfficeHour(formData: FormData) {
  const path = returnPath(formData, "/office-hours");
  const result = await call(`/api/v1/office-hours/${encodeURIComponent(text(formData, "id"))}`, {
    method: "PATCH",
    body: { isAvailable: text(formData, "isAvailable") === "true" },
  });
  back(path, result, text(formData, "isAvailable") === "true" ? "เปิดรับนัดหมายแล้ว" : "ปิดรับนัดหมายแล้ว");
}

export async function deleteOfficeHour(formData: FormData) {
  const path = returnPath(formData, "/office-hours");
  const result = await call(`/api/v1/office-hours/${encodeURIComponent(text(formData, "id"))}`, {
    method: "DELETE",
  });
  back(path, result, "ลบเวลาทำการแล้ว");
}

/** Open (AVAILABLE) or close (UNAVAILABLE = "ไม่ว่าง") one time of the week. */
export async function setSlotAvailability(formData: FormData) {
  const path = returnPath(formData, "/schedule");
  const status = text(formData, "status") === "AVAILABLE" ? "AVAILABLE" : "UNAVAILABLE";
  const result = await call("/api/v1/booking-exceptions", {
    method: "POST",
    body: { startsAt: text(formData, "startsAt"), endsAt: text(formData, "endsAt"), status },
  });
  back(path, result, status === "AVAILABLE" ? "เปิดเวลานี้ให้นัดหมายแล้ว" : "ตั้งเวลานี้เป็นไม่ว่างแล้ว");
}

export async function createBooking(formData: FormData) {
  const path = returnPath(formData, "/schedule");
  const studentPersonCode = text(formData, "studentPersonCode");
  const topic = text(formData, "topic");
  if (!studentPersonCode || !topic) {
    back(path, { ok: false, status: 400, code: "VALIDATION_ERROR", message: "กรุณากรอกรหัสนักศึกษาและหัวข้อให้ครบ" }, "");
  }

  const result = await call("/api/v1/bookings", {
    method: "POST",
    body: {
      studentPersonCode,
      startsAt: text(formData, "startsAt"),
      endsAt: text(formData, "endsAt"),
      topic,
    },
  });
  // The slot is taken now, so the form's own ?slot= is dropped on success.
  const cleaned = new URL(path, "http://local");
  cleaned.searchParams.delete("slot");
  back(path, result, "สร้างนัดหมายแล้ว", `${cleaned.pathname}${cleaned.search}`);
}

async function close(formData: FormData, action: "cancel" | "complete") {
  const path = returnPath(formData, "/bookings");
  const result = await call(`/api/v1/bookings/${encodeURIComponent(text(formData, "id"))}/${action}`, {
    method: "PATCH",
  });
  back(path, result, action === "cancel" ? "ยกเลิกนัดหมายแล้ว" : "ทำเครื่องหมายเสร็จสิ้นแล้ว");
}

export async function cancelBooking(formData: FormData) {
  await close(formData, "cancel");
}

export async function completeBooking(formData: FormData) {
  await close(formData, "complete");
}

export async function sendChatMessage(formData: FormData) {
  const bookingId = text(formData, "bookingId");
  // Back to the conversation itself, not the top of the booking page.
  const path = `/bookings/${encodeURIComponent(bookingId)}#chat`;
  const message = text(formData, "message");
  if (!message) {
    back(path, { ok: false, status: 400, code: "VALIDATION_ERROR", message: "กรุณาพิมพ์ข้อความก่อนส่ง" }, "");
  }

  const result = await call("/api/v1/chat-messages", { method: "POST", body: { bookingId, message } });
  back(path, result, "ส่งข้อความแล้ว");
}
