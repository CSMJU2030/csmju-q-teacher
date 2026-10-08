import Link from "next/link";
import { cancelBooking, setSlotAvailability } from "@/app/actions";
import ConfirmForm from "@/components/ConfirmForm";
import type { ScheduleSlot } from "@/lib/api";
import {
  addDays,
  bangkokDate,
  bangkokInstant,
  formatCalendarDate,
  formatSlot,
  formatWeekday,
  minutesOfDay,
} from "@/lib/format";

const chatLinkClass =
  "rounded-md bg-primary-container px-2.5 py-1 text-label-sm text-white transition-opacity hover:opacity-90";

const DEFAULT_FROM = 8 * 60;
const DEFAULT_TO = 17 * 60;

type Cell =
  | { kind: "slot"; slot: ScheduleSlot; rowSpan: number }
  | { kind: "busy" }
  | { kind: "covered" };

const timeLabel = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

const minutesBetween = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60_000);

/**
 * One teacher's week (Monday to Friday) as a grid. The server already worked
 * out the slots; a time with no slot is "ไม่ว่าง" (busy). The rows are as tall
 * as the shortest slot of the week, and a longer slot spans several rows.
 *
 * `editable` is the teacher looking at their own week: they get the buttons
 * that open a busy time, set a free one busy, create an appointment in it or
 * cancel one. Everyone else - students and the admin - only reads.
 */
export default function WeekGrid({
  weekStart,
  slots,
  editable,
  returnTo,
  slotLink,
  myBookingIdFor,
}: {
  weekStart: string;
  slots: ScheduleSlot[];
  editable: boolean;
  /** The page (with its week and teacher) the buttons come back to. */
  returnTo: string;
  /** Link that picks a free slot to book, from the slot's start. */
  slotLink: (startsAt: string) => string;
  /** A student's own appointment in a slot (the schedule hides its id from anyone but the teacher). */
  myBookingIdFor?: (slot: ScheduleSlot) => string | undefined;
}) {
  const dates = [0, 1, 2, 3, 4].map((offset) => addDays(weekStart, offset));
  const today = bangkokDate();

  const step = slots.reduce((least, slot) => Math.min(least, minutesBetween(slot.startsAt, slot.endsAt)), 30);
  const rowStep = Math.max(15, step);
  const from = Math.floor(Math.min(DEFAULT_FROM, ...slots.map((slot) => minutesOfDay(slot.startsAt))) / rowStep) * rowStep;
  const to = Math.max(DEFAULT_TO, ...slots.map((slot) => minutesOfDay(slot.endsAt)));
  const rows = Math.ceil((to - from) / rowStep);

  // cells[column][row]
  const cells: Cell[][] = dates.map(() => Array.from({ length: rows }, (): Cell => ({ kind: "busy" })));
  for (const slot of slots) {
    const column = dates.indexOf(bangkokDate(slot.startsAt));
    if (column < 0) continue;
    const row = Math.floor((minutesOfDay(slot.startsAt) - from) / rowStep);
    if (row < 0 || row >= rows) continue;
    const length = minutesBetween(slot.startsAt, slot.endsAt);
    const rowSpan = Math.max(1, Math.min(rows - row, Math.ceil(length / rowStep)));
    cells[column][row] = { kind: "slot", slot, rowSpan };
    for (let covered = 1; covered < rowSpan; covered += 1) cells[column][row + covered] = { kind: "covered" };
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] table-fixed border-collapse text-left">
        <caption className="sr-only">ตารางนัดหมายประจำสัปดาห์ วันจันทร์ถึงวันศุกร์</caption>
        <thead>
          <tr className="border-b border-outline-variant/40 bg-surface text-label-md text-on-surface-variant">
            <th scope="col" className="w-20 px-3 py-3 font-semibold">
              เวลา
            </th>
            {dates.map((date) => (
              <th
                key={date}
                scope="col"
                className={`px-3 py-3 font-semibold ${date === today ? "text-primary-container" : ""}`}
              >
                {formatWeekday(date)} {formatCalendarDate(date)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="text-label-sm">
          {Array.from({ length: rows }, (_, row) => {
            const minute = from + row * rowStep;
            return (
              <tr key={minute} className="border-b border-outline-variant/30 last:border-0">
                <th scope="row" className="px-3 py-2 align-top font-medium tabular-nums text-on-surface-variant">
                  {timeLabel(minute)}
                </th>
                {dates.map((date, column) => {
                  const cell = cells[column][row];
                  if (cell.kind === "covered") return null;
                  if (cell.kind === "busy") {
                    return (
                      <td key={date} className="border-l border-outline-variant/30 bg-surface-variant/40 px-2 py-2 align-top">
                        <p className="text-on-surface-variant">ไม่ว่าง</p>
                        {editable && (
                          <SlotForm
                            startsAt={bangkokInstant(date, minute)}
                            endsAt={bangkokInstant(date, minute + rowStep)}
                            status="AVAILABLE"
                            label="เปิดเวลานี้"
                            returnTo={returnTo}
                          />
                        )}
                      </td>
                    );
                  }
                  return (
                    <td
                      key={date}
                      rowSpan={cell.rowSpan}
                      className="border-l border-outline-variant/30 px-2 py-2 align-top"
                    >
                      <SlotCell
                        slot={cell.slot}
                        editable={editable}
                        returnTo={returnTo}
                        slotLink={slotLink}
                        myBookingId={myBookingIdFor?.(cell.slot)}
                      />
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SlotForm({
  startsAt,
  endsAt,
  status,
  label,
  returnTo,
}: {
  startsAt: string;
  endsAt: string;
  status: "AVAILABLE" | "UNAVAILABLE";
  label: string;
  returnTo: string;
}) {
  return (
    <form action={setSlotAvailability} className="mt-1">
      <input type="hidden" name="startsAt" value={startsAt} />
      <input type="hidden" name="endsAt" value={endsAt} />
      <input type="hidden" name="status" value={status} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <button
        type="submit"
        aria-label={`${label} ${formatSlot(startsAt, endsAt)}`}
        className="rounded-md border border-outline-variant px-2.5 py-1 text-label-sm text-on-surface-variant transition-colors hover:bg-surface-variant/50"
      >
        {label}
      </button>
    </form>
  );
}

function SlotCell({
  slot,
  editable,
  returnTo,
  slotLink,
  myBookingId,
}: {
  slot: ScheduleSlot;
  editable: boolean;
  returnTo: string;
  slotLink: (startsAt: string) => string;
  myBookingId?: string;
}) {
  const range = formatSlot(slot.startsAt, slot.endsAt);

  if (slot.status === "AVAILABLE") {
    return (
      <div className="rounded-lg bg-success/10 p-2 text-emerald-700">
        <p className="font-medium">ว่าง</p>
        {editable && (
          <div className="mt-1 flex flex-wrap gap-2">
            <Link
              href={slotLink(slot.startsAt)}
              aria-label={`สร้างนัดหมาย ${range}`}
              className="rounded-md bg-primary-container px-2.5 py-1 text-label-sm text-white transition-opacity hover:opacity-90"
            >
              สร้างนัดหมาย
            </Link>
            <SlotForm
              startsAt={slot.startsAt}
              endsAt={slot.endsAt}
              status="UNAVAILABLE"
              label="ตั้งเป็นไม่ว่าง"
              returnTo={returnTo}
            />
          </div>
        )}
      </div>
    );
  }

  const booking = slot.booking;
  return (
    <div className="rounded-lg bg-primary-container/10 p-2 text-primary-container">
      <p className="font-medium">
        {slot.bookedByMe ? "นัดหมายของฉัน" : booking ? (booking.studentPersonCode ?? "จองแล้ว") : "จองแล้ว"}
      </p>
      {booking && <p className="mt-0.5 break-words text-on-surface-variant">{booking.topic}</p>}
      {!booking && slot.bookedByMe && (
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Link href={myBookingId ? `/bookings/${myBookingId}#chat` : "/messages"} className={chatLinkClass}>
            แชทกับอาจารย์
          </Link>
          {myBookingId && (
            <Link href={`/bookings/${myBookingId}`} className="text-label-sm underline">
              ดูรายละเอียด
            </Link>
          )}
        </div>
      )}
      {booking && (
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Link href={`/bookings/${booking.id}#chat`} aria-label={`แชท ${range}`} className={chatLinkClass}>
            แชท
          </Link>
          <Link href={`/bookings/${booking.id}`} className="text-label-sm underline">
            ดูรายละเอียด
          </Link>
          {editable && booking.status === "CONFIRMED" && (
            <ConfirmForm
              action={cancelBooking}
              fields={{ id: booking.id, returnTo }}
              trigger="ยกเลิกนัดหมาย"
              triggerLabel={`ยกเลิกนัดหมาย ${range}`}
              title="ยกเลิกนัดหมายนี้?"
              message={`นัดหมาย ${range} หัวข้อ "${booking.topic}" จะถูกยกเลิก และช่วงเวลานี้จะกลับมาว่างให้นัดหมายใหม่`}
              confirmLabel="ยกเลิกนัดหมาย"
            />
          )}
        </div>
      )}
    </div>
  );
}
