import Link from "next/link";
import { cancelBooking, completeBooking } from "@/app/actions";
import ReSignIn from "@/app/_components/ReSignIn";
import ConfirmForm from "@/components/ConfirmForm";
import EmptyState from "@/components/EmptyState";
import LoadFailed from "@/components/LoadFailed";
import Notice from "@/components/Notice";
import Pagination from "@/components/Pagination";
import { requireMe } from "@/components/session";
import { EventIcon, PageHeader, StatusBadge, cardClass, inputClass, secondaryButtonClass, tdClass, thClass } from "@/csmju";
import { isUnauthorized, listBookings, type BookingStatus } from "@/lib/api";
import { canClose, counterpartOf } from "@/lib/booking";
import { formatSlot, STATUS_LABEL, STATUS_TONE } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "นัดหมายของฉัน" };

const PAGE_SIZE = 20;
type Query = { page?: string; status?: string; ok?: string; error?: string };

const isStatus = (value: string | undefined): value is BookingStatus =>
  value === "CONFIRMED" || value === "CANCELLED" || value === "COMPLETED";

export default async function BookingsPage({ searchParams }: { searchParams: Promise<Query> }) {
  const query = await searchParams;
  const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
  const status = isStatus(query.status) ? query.status : undefined;
  const here = `/bookings${status ? `?status=${status}` : ""}`;

  const gate = await requireMe(here);
  if (!gate.me) return gate.view;
  const me = gate.me;

  const bookings = await listBookings({ status, sort: "-startsAt", page, limit: PAGE_SIZE });
  if (isUnauthorized(bookings)) return <ReSignIn next={here} />;
  if (!bookings.ok) return <LoadFailed message={bookings.message} />;

  const teacherSide = me.subsystemRole !== "STUDENT";

  return (
    <>
      <PageHeader
        title="นัดหมายของฉัน"
        description={me.subsystemRole === "ADMIN" ? "นัดหมายทั้งหมดในระบบ" : "นัดหมายเข้าพบอาจารย์ทั้งที่ผ่านมาและที่กำลังจะมาถึง"}
      />

      <Notice ok={query.ok} error={query.error} />

      <div className={`fade-slide-up stagger-1 ${cardClass}`}>
        <form method="get" action="/bookings" className="flex flex-col gap-3 border-b border-outline-variant/40 px-6 py-5 md:flex-row md:items-end">
          <div>
            <label htmlFor="status" className="mb-2 block text-label-md text-on-surface">
              สถานะ
            </label>
            <select id="status" name="status" defaultValue={status ?? ""} className={`${inputClass} md:w-48`}>
              <option value="">ทุกสถานะ</option>
              <option value="CONFIRMED">{STATUS_LABEL.CONFIRMED}</option>
              <option value="COMPLETED">{STATUS_LABEL.COMPLETED}</option>
              <option value="CANCELLED">{STATUS_LABEL.CANCELLED}</option>
            </select>
          </div>
          <button type="submit" className={secondaryButtonClass}>
            ใช้ตัวกรอง
          </button>
          {status && (
            <Link href="/bookings" className={secondaryButtonClass}>
              ล้างตัวกรอง
            </Link>
          )}
        </form>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-outline-variant/40 bg-surface text-label-md text-on-surface-variant">
                <th className={thClass}>วันและเวลา</th>
                <th className={thClass}>{me.subsystemRole === "STUDENT" ? "อาจารย์" : "นักศึกษา"}</th>
                <th className={thClass}>หัวข้อ</th>
                <th className={thClass}>สถานะ</th>
                <th className={thClass}>ข้อความใหม่</th>
                <th className={`${thClass} text-right`}>จัดการ</th>
              </tr>
            </thead>
            <tbody className="text-body-md">
              {bookings.data.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState
                      icon={<EventIcon className="h-10 w-10" />}
                      title={status ? "ไม่พบนัดหมายตามตัวกรองนี้" : "ยังไม่มีนัดหมาย"}
                      hint={
                        status
                          ? "ลองล้างตัวกรองเพื่อดูนัดหมายทั้งหมด"
                          : teacherSide
                            ? "เปิดตารางนัดหมายแล้วเลือกช่วงเวลาที่ว่างเพื่อสร้างนัดหมาย"
                            : "อาจารย์เป็นผู้สร้างนัดหมายให้ ดูเวลาว่างของอาจารย์ได้ที่ตารางนัดหมาย"
                      }
                      action={status ? { label: "ล้างตัวกรอง", href: "/bookings" } : { label: "เปิดตารางนัดหมาย", href: "/schedule" }}
                    />
                  </td>
                </tr>
              ) : (
                bookings.data.map((booking) => {
                  const range = formatSlot(booking.startsAt, booking.endsAt);
                  return (
                    <tr key={booking.id} className="border-b border-outline-variant/40 last:border-0 hover:bg-surface/50">
                      <td className={`${tdClass} font-medium text-on-surface`}>{range}</td>
                      <td className={`${tdClass} text-on-surface-variant`}>{counterpartOf(me, booking)}</td>
                      <td className={`${tdClass} text-on-surface-variant`}>{booking.topic}</td>
                      <td className={tdClass}>
                        <StatusBadge tone={STATUS_TONE[booking.status]} label={STATUS_LABEL[booking.status]} />
                      </td>
                      <td className={`${tdClass} tabular-nums text-on-surface-variant`}>{booking.unreadCount}</td>
                      <td className={`${tdClass} text-right`}>
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <Link
                            href={`/bookings/${booking.id}`}
                            aria-label={`ดูรายละเอียดนัดหมาย ${range}`}
                            className="text-label-md text-primary-container hover:underline"
                          >
                            ดูรายละเอียด
                          </Link>
                          {canClose(me, booking) && (
                            <>
                              <ConfirmForm
                                action={completeBooking}
                                fields={{ id: booking.id, returnTo: here }}
                                trigger="เสร็จสิ้น"
                                triggerLabel={`ทำเครื่องหมายเสร็จสิ้น ${range}`}
                                title="ทำเครื่องหมายว่าเสร็จสิ้น?"
                                message={`นัดหมาย ${range} หัวข้อ "${booking.topic}" จะถูกปิดเป็นเสร็จสิ้น`}
                                confirmLabel="ทำเครื่องหมายเสร็จสิ้น"
                                tone="primary"
                              />
                              <ConfirmForm
                                action={cancelBooking}
                                fields={{ id: booking.id, returnTo: here }}
                                trigger="ยกเลิก"
                                triggerLabel={`ยกเลิกนัดหมาย ${range}`}
                                title="ยกเลิกนัดหมายนี้?"
                                message={`นัดหมาย ${range} หัวข้อ "${booking.topic}" จะถูกยกเลิก และช่วงเวลานี้จะกลับมาว่างให้นัดหมายใหม่`}
                                confirmLabel="ยกเลิกนัดหมาย"
                              />
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <Pagination meta={bookings.meta} path="/bookings" params={{ status }} />
      </div>
    </>
  );
}
