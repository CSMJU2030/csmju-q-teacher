import Link from "next/link";
import { createBooking } from "@/app/actions";
import ReSignIn from "@/app/_components/ReSignIn";
import EmptyState from "@/components/EmptyState";
import LoadFailed from "@/components/LoadFailed";
import Notice from "@/components/Notice";
import { requireMe } from "@/components/session";
import WeekGrid from "@/components/WeekGrid";
import { GroupIcon, PageHeader, cardClass, inputClass, primaryButtonClass, secondaryButtonClass } from "@/csmju";
import { isUnauthorized, listBookings, listScheduleSlots, listTeachers, type ScheduleSlot } from "@/lib/api";
import { addDays, bangkokDate, formatCalendarDate, formatSlot, mondayOf, readDate } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "ตารางนัดหมาย" };

type Query = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function SchedulePage({ searchParams }: { searchParams: Promise<Query> }) {
  const query = await searchParams;
  const weekStart = mondayOf(readDate(first(query.week)) ?? bangkokDate());

  const gate = await requireMe(`/schedule?week=${weekStart}`);
  if (!gate.me) return gate.view;
  const me = gate.me;

  // A teacher looks at their own week; a student or the admin picks a teacher first.
  const ownWeek = me.subsystemRole === "TEACHER";
  let teachers: { coreUserId: string; personCode: string | null }[] = [];
  let teacherId: string | undefined;
  if (!ownWeek) {
    const list = await listTeachers();
    if (isUnauthorized(list)) return <ReSignIn next={`/schedule?week=${weekStart}`} />;
    if (!list.ok) return <LoadFailed message={list.message} />;
    teachers = list.data;
    teacherId = first(query.teacher) ?? teachers[0]?.coreUserId;
    if (!teacherId) {
      return (
        <>
          <PageHeader title="ตารางนัดหมาย" description="ดูช่วงเวลาที่อาจารย์ว่างและนัดหมายของคุณ" />
          <div className={cardClass}>
            <EmptyState
              icon={<GroupIcon className="h-10 w-10" />}
              title="ยังไม่มีอาจารย์เปิดเวลาทำการ"
              hint="เมื่ออาจารย์เพิ่มเวลาทำการแล้ว จะเลือกดูตารางได้ที่หน้านี้"
            />
          </div>
        </>
      );
    }
  }

  const slots = await listScheduleSlots(teacherId, weekStart);
  const here = `/schedule${teacherId ? `?teacher=${encodeURIComponent(teacherId)}&` : "?"}week=${weekStart}`;
  if (isUnauthorized(slots)) return <ReSignIn next={here} />;
  if (!slots.ok) return <LoadFailed message={slots.message} />;

  // The schedule shows a student only that a slot is theirs; their own bookings
  // of this week give the id, so the slot can open the chat with the teacher.
  const mine =
    me.subsystemRole === "STUDENT"
      ? await listBookings({ from: weekStart, to: addDays(weekStart, 4), limit: 100 })
      : null;
  if (mine && isUnauthorized(mine)) return <ReSignIn next={here} />;
  const myBookings = mine?.ok ? mine.data.filter((booking) => booking.status !== "CANCELLED") : [];
  const myBookingIdFor = (slot: ScheduleSlot) =>
    myBookings.find(
      (booking) =>
        booking.teacherCoreUserId === teacherId &&
        new Date(booking.startsAt) < new Date(slot.endsAt) &&
        new Date(slot.startsAt) < new Date(booking.endsAt),
    )?.id;

  const weekEnd = addDays(weekStart, 4);
  const link = (week: string) => `/schedule${teacherId ? `?teacher=${encodeURIComponent(teacherId)}&` : "?"}week=${week}`;
  const pick = first(query.slot);
  const picked = ownWeek ? slots.data.find((slot) => slot.startsAt === pick && slot.status === "AVAILABLE") : undefined;

  return (
    <>
      <PageHeader
        title="ตารางนัดหมาย"
        description={
          ownWeek
            ? "จัดการเวลาว่างของคุณ เปิดเวลาที่ไม่ว่าง หรือสร้างนัดหมายให้นักศึกษา"
            : "ดูช่วงเวลาที่อาจารย์ว่างและนัดหมายของคุณ อาจารย์เป็นผู้สร้างนัดหมาย"
        }
      />

      <Notice ok={first(query.ok)} error={first(query.error)} />

      {picked && (
        <form action={createBooking} className={`${cardClass} space-y-4 px-6 py-5`}>
          <h2 className="font-display text-headline-md text-on-surface">สร้างนัดหมาย {formatSlot(picked.startsAt, picked.endsAt)}</h2>
          <p className="text-label-sm text-on-surface-variant">ช่องที่มี * จำเป็นต้องกรอก</p>
          <input type="hidden" name="startsAt" value={picked.startsAt} />
          <input type="hidden" name="endsAt" value={picked.endsAt} />
          <input type="hidden" name="returnTo" value={here} />
          <div>
            <label htmlFor="studentPersonCode" className="mb-2 block text-label-md text-on-surface">
              รหัสนักศึกษา *
            </label>
            <input
              id="studentPersonCode"
              name="studentPersonCode"
              required
              aria-required="true"
              maxLength={50}
              inputMode="numeric"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="topic" className="mb-2 block text-label-md text-on-surface">
              หัวข้อ *
            </label>
            <input id="topic" name="topic" required aria-required="true" maxLength={200} className={inputClass} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Link href={here} className={secondaryButtonClass}>
              ยกเลิก
            </Link>
            <button type="submit" className={primaryButtonClass}>
              สร้างนัดหมาย
            </button>
          </div>
        </form>
      )}

      <section className={`fade-slide-up stagger-1 ${cardClass}`}>
        <div className="flex flex-col gap-3 border-b border-outline-variant/40 px-6 py-5 md:flex-row md:items-center md:justify-between">
          {!ownWeek && (
            <form method="get" action="/schedule" className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <input type="hidden" name="week" value={weekStart} />
              <div>
                <label htmlFor="teacher" className="mb-2 block text-label-md text-on-surface">
                  อาจารย์
                </label>
                <select id="teacher" name="teacher" defaultValue={teacherId} className={`${inputClass} md:w-64`}>
                  {teachers.map((teacher) => (
                    <option key={teacher.coreUserId} value={teacher.coreUserId}>
                      {teacher.personCode ?? "อาจารย์ (ไม่ทราบรหัส)"}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" className={secondaryButtonClass}>
                ดูตาราง
              </button>
            </form>
          )}
          <nav aria-label="เลือกสัปดาห์" className="flex flex-wrap items-center gap-2 md:ml-auto">
            <Link href={link(addDays(weekStart, -7))} className={secondaryButtonClass}>
              สัปดาห์ก่อน
            </Link>
            <Link href={link(bangkokDate())} className={secondaryButtonClass}>
              สัปดาห์นี้
            </Link>
            <Link href={link(addDays(weekStart, 7))} className={secondaryButtonClass}>
              สัปดาห์ถัดไป
            </Link>
          </nav>
        </div>
        <p className="border-b border-outline-variant/40 px-6 py-3 text-label-md text-on-surface-variant">
          สัปดาห์ {formatCalendarDate(weekStart)} – {formatCalendarDate(weekEnd)}
        </p>

        {slots.data.length === 0 && (
          <p className="border-b border-outline-variant/40 px-6 py-3 text-label-md text-on-surface-variant">
            {ownWeek
              ? "สัปดาห์นี้ยังไม่มีเวลาว่าง เพิ่มเวลาทำการที่หน้าเวลาทำการ หรือกดเปิดเวลาในตารางด้านล่าง"
              : "อาจารย์ท่านนี้ยังไม่มีเวลาว่างในสัปดาห์นี้"}
          </p>
        )}

        <WeekGrid
          weekStart={weekStart}
          slots={slots.data}
          editable={ownWeek}
          returnTo={here}
          slotLink={(startsAt) => `${here}&slot=${encodeURIComponent(startsAt)}`}
          myBookingIdFor={myBookingIdFor}
        />
      </section>
    </>
  );
}
