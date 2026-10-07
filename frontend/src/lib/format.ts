import type { BookingStatus, SubsystemRole, Weekday } from "./api";

/**
 * Display formats (ui-design-system 11.3): Buddhist Era, Thai wording, and
 * Bangkok time whatever the clock of the server or the browser says. The API
 * is spoken in ISO 8601 with an offset, so nothing here is sent anywhere.
 */
const TIME_ZONE = "Asia/Bangkok";
const DAY_MS = 24 * 60 * 60 * 1000;

const dateFormat = new Intl.DateTimeFormat("th-TH", {
  timeZone: TIME_ZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
});

const dateTimeFormat = new Intl.DateTimeFormat("th-TH", {
  timeZone: TIME_ZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const timeFormat = new Intl.DateTimeFormat("th-TH", {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const weekdayFormat = new Intl.DateTimeFormat("th-TH", { timeZone: TIME_ZONE, weekday: "short" });

/** `2026-10-12T02:00:00.000Z` -> `12 ต.ค. 2569` */
export const formatDate = (iso: string) => dateFormat.format(new Date(iso));

/** `2026-10-12T02:00:00.000Z` -> `12 ต.ค. 2569 09:00 น.` */
export const formatDateTime = (iso: string) => `${dateTimeFormat.format(new Date(iso))} น.`;

/** `2026-10-12T02:00:00.000Z` -> `09:00 น.` */
export const formatTime = (iso: string) => `${timeFormat.format(new Date(iso))} น.`;

/** `12 ต.ค. 2569 09:00–09:30 น.` */
export function formatSlot(startsAt: string, endsAt: string): string {
  const end = timeFormat.format(new Date(endsAt));
  return `${formatDate(startsAt)} ${timeFormat.format(new Date(startsAt))}–${end} น.`;
}

/** Short weekday of a Bangkok calendar date `YYYY-MM-DD`, e.g. `จ.` */
export const formatWeekday = (date: string) => weekdayFormat.format(new Date(`${date}T12:00:00+07:00`));

/** A Bangkok calendar date `YYYY-MM-DD` shown as `12 ต.ค. 2569`. */
export const formatCalendarDate = (date: string) => formatDate(`${date}T12:00:00+07:00`);

/** The Bangkok calendar date (`YYYY-MM-DD`) an instant falls on. */
export const bangkokDate = (instant: Date | string = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(new Date(instant));

export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Monday of the week that holds `date` (a weekend belongs to the week before, like the backend). */
export function mondayOf(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return addDays(date, weekday === 0 ? -6 : 1 - weekday);
}

/** `YYYY-MM-DD` that is a real calendar date, otherwise null. */
export function readDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return addDays(value, 0) === value ? value : null;
}

/** An instant for a Bangkok date and minutes after midnight, as ISO 8601 with the +07:00 offset. */
export function bangkokInstant(date: string, minutes: number): string {
  const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
  const mm = String(minutes % 60).padStart(2, "0");
  return `${date}T${hh}:${mm}:00+07:00`;
}

/** Minutes after Bangkok midnight of an instant. */
export function minutesOfDay(iso: string): number {
  const [hh, mm] = timeFormat.format(new Date(iso)).split(":").map(Number);
  return hh * 60 + mm;
}

export const WEEKDAY_LABEL: Record<Weekday, string> = {
  MON: "วันจันทร์",
  TUE: "วันอังคาร",
  WED: "วันพุธ",
  THU: "วันพฤหัสบดี",
  FRI: "วันศุกร์",
};

export const WEEKDAYS = Object.keys(WEEKDAY_LABEL) as Weekday[];

/** Thai role names of ui-design-system 10.3. */
export const ROLE_LABEL: Record<SubsystemRole, string> = {
  STUDENT: "นักศึกษา",
  TEACHER: "อาจารย์",
  ADMIN: "ผู้ดูแลระบบ",
};

export const STATUS_LABEL: Record<BookingStatus, string> = {
  CONFIRMED: "ยืนยันแล้ว",
  CANCELLED: "ยกเลิกแล้ว",
  COMPLETED: "เสร็จสิ้น",
};

export const STATUS_TONE: Record<BookingStatus, "info" | "error" | "success"> = {
  CONFIRMED: "info",
  CANCELLED: "error",
  COMPLETED: "success",
};
