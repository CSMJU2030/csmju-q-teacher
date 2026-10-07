import type { Booking, Me } from "./api";

/**
 * Who the booking is with, from the viewer's side. Core Hub is the only place
 * a person's name lives and a student can read nobody else's, so a student
 * sees the teacher's person code and a teacher the student's (or, when Core
 * Hub could describe them at the time, the name it gave).
 */
export function counterpartOf(me: Me, booking: Booking): string {
  if (me.subsystemRole === "STUDENT") return booking.teacherPersonCode ?? "อาจารย์";
  return booking.studentFullNameTh ?? booking.studentPersonCode ?? "นักศึกษา";
}

/** A teacher or admin may close a booking; the backend allows only the booking's own teacher (or an admin). */
export const canClose = (me: Me, booking: Booking) =>
  booking.status === "CONFIRMED" && (me.subsystemRole === "ADMIN" || me.id === booking.teacherCoreUserId);
