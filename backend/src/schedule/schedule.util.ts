/**
 * Pure schedule arithmetic for Q-Teacher. No database and no clock in here, so
 * every rule can be tested with plain objects.
 *
 * Office hours are written in local Bangkok time (Asia/Bangkok is UTC+7 all
 * year, no daylight saving), while every stored and exchanged instant is UTC
 * (api-conventions.md 6). A "calendar date" below is the Bangkok date.
 */

export const BANGKOK_OFFSET_MINUTES = 7 * 60;
const MINUTE_MS = 60_000;
const DAY_MINUTES = 24 * 60;

export type WeekdayCode = 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI';
const WEEKDAYS: WeekdayCode[] = ['MON', 'TUE', 'WED', 'THU', 'FRI'];

export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** The instant a Bangkok calendar date starts (00:00 there). */
export function localMidnight(date: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day) - BANGKOK_OFFSET_MINUTES * MINUTE_MS);
}

/** The Bangkok calendar date (`YYYY-MM-DD`) an instant falls on. */
export function localDateOf(instant: Date): string {
  const shifted = new Date(instant.getTime() + BANGKOK_OFFSET_MINUTES * MINUTE_MS);
  return shifted.toISOString().slice(0, 10);
}

/** Adds whole days to a calendar date. */
export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** Monday to Friday of the week that contains `anchor` (a Saturday or Sunday belongs to the week before). */
export function weekDates(anchor: string): string[] {
  const [year, month, day] = anchor.split('-').map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0 = Sunday
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  const monday = addDays(anchor, mondayOffset);
  return [0, 1, 2, 3, 4].map((offset) => addDays(monday, offset));
}

/** Monday to Friday as a code; Saturday and Sunday have none. */
export function weekdayOf(date: string): WeekdayCode | null {
  const [year, month, day] = date.split('-').map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday >= 1 && weekday <= 5 ? WEEKDAYS[weekday - 1] : null;
}

/** "09:30" -> 570. Returns null when the text is not a valid time of day. */
export function parseTimeOfDay(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** 570 -> "09:30". */
export function formatTimeOfDay(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

export interface OfficeHourRule {
  dayOfWeek: WeekdayCode;
  startMinute: number;
  endMinute: number;
  slotMinutes: number;
  isAvailable: boolean;
}

export interface ExceptionRule {
  startsAt: Date;
  endsAt: Date;
  status: 'AVAILABLE' | 'UNAVAILABLE';
}

export interface BookingRule {
  startsAt: Date;
  endsAt: Date;
  status: 'CONFIRMED' | 'CANCELLED' | 'COMPLETED';
}

export interface Slot<B extends BookingRule = BookingRule> {
  startsAt: Date;
  endsAt: Date;
  status: 'AVAILABLE' | 'BOOKED';
  booking?: B;
}

/** Two intervals overlap when each starts before the other ends. */
export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * The slots of one teacher on one Bangkok calendar date:
 *
 *  1. every office-hour row of that weekday is cut into slots;
 *  2. the exceptions are applied in the order given (oldest first, so the
 *     newest decision on the same time wins): UNAVAILABLE removes every slot it
 *     overlaps, AVAILABLE adds its own window when no slot covers it yet;
 *  3. a slot that overlaps a booking that is not cancelled is BOOKED.
 *
 * A time with no slot is "busy": the teacher is not available then.
 */
export function buildDaySlots<B extends BookingRule>(
  date: string,
  officeHours: readonly OfficeHourRule[],
  exceptions: readonly ExceptionRule[],
  bookings: readonly B[],
): Slot<B>[] {
  const weekday = weekdayOf(date);
  const dayStart = localMidnight(date);
  const dayEnd = new Date(dayStart.getTime() + DAY_MINUTES * MINUTE_MS);

  let slots: Slot<B>[] = [];

  if (weekday !== null) {
    for (const rule of officeHours) {
      if (rule.dayOfWeek !== weekday || !rule.isAvailable || rule.slotMinutes <= 0) {
        continue;
      }
      for (
        let minute = rule.startMinute;
        minute + rule.slotMinutes <= rule.endMinute;
        minute += rule.slotMinutes
      ) {
        slots.push({
          startsAt: new Date(dayStart.getTime() + minute * MINUTE_MS),
          endsAt: new Date(dayStart.getTime() + (minute + rule.slotMinutes) * MINUTE_MS),
          status: 'AVAILABLE',
        });
      }
    }
  }

  for (const exception of exceptions) {
    if (!overlaps(exception.startsAt, exception.endsAt, dayStart, dayEnd)) {
      continue;
    }
    if (exception.status === 'UNAVAILABLE') {
      slots = slots.filter(
        (slot) => !overlaps(slot.startsAt, slot.endsAt, exception.startsAt, exception.endsAt),
      );
    } else if (
      !slots.some((slot) =>
        overlaps(slot.startsAt, slot.endsAt, exception.startsAt, exception.endsAt),
      )
    ) {
      slots.push({ startsAt: exception.startsAt, endsAt: exception.endsAt, status: 'AVAILABLE' });
    }
  }

  const active = bookings.filter((booking) => booking.status !== 'CANCELLED');
  slots = slots.map((slot) => {
    const booking = active.find((candidate) =>
      overlaps(slot.startsAt, slot.endsAt, candidate.startsAt, candidate.endsAt),
    );
    return booking ? { ...slot, status: 'BOOKED' as const, booking } : slot;
  });

  return slots.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}
