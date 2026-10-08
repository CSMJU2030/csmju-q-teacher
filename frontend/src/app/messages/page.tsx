import Link from "next/link";
import ReSignIn from "@/app/_components/ReSignIn";
import EmptyState from "@/components/EmptyState";
import Forbidden from "@/components/Forbidden";
import LoadFailed from "@/components/LoadFailed";
import Pagination from "@/components/Pagination";
import { requireMe } from "@/components/session";
import { CampaignIcon, PageHeader, StatusBadge, cardClass, tdClass, thClass } from "@/csmju";
import { isUnauthorized, listBookings } from "@/lib/api";
import { counterpartOf } from "@/lib/booking";
import { formatSlot, STATUS_LABEL, STATUS_TONE } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "ข้อความ" };

const PAGE_SIZE = 20;

/**
 * Every conversation of the signed-in user: one per booking, between its
 * teacher and its student. The chat itself lives on the booking's page.
 */
export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page: pageText } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageText ?? "1", 10) || 1);

  const gate = await requireMe("/messages");
  if (!gate.me) return gate.view;
  const me = gate.me;
  // Not even an admin reads other people's chats (the backend answers 403 too).
  if (me.subsystemRole === "ADMIN") return <Forbidden />;

  const bookings = await listBookings({ sort: "-startsAt", page, limit: PAGE_SIZE });
  if (isUnauthorized(bookings)) return <ReSignIn next="/messages" />;
  if (!bookings.ok) return <LoadFailed message={bookings.message} />;

  const student = me.subsystemRole === "STUDENT";

  return (
    <>
      <PageHeader
        title="ข้อความ"
        description={
          student
            ? "แชทกับอาจารย์ได้ในทุกนัดหมายของคุณ เลือกนัดหมายเพื่อเปิดแชท"
            : "แชทกับนักศึกษาได้ในทุกนัดหมายของคุณ เลือกนัดหมายเพื่อเปิดแชท"
        }
      />

      <div className={`fade-slide-up stagger-1 ${cardClass}`}>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-outline-variant/40 bg-surface text-label-md text-on-surface-variant">
                <th className={thClass}>{student ? "อาจารย์" : "นักศึกษา"}</th>
                <th className={thClass}>นัดหมาย</th>
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
                      icon={<CampaignIcon className="h-10 w-10" />}
                      title="ยังไม่มีแชท"
                      hint={
                        student
                          ? "แชทจะเปิดให้เมื่ออาจารย์สร้างนัดหมายให้คุณ"
                          : "แชทจะเปิดให้เมื่อคุณสร้างนัดหมายให้นักศึกษา"
                      }
                      action={{ label: "เปิดตารางนัดหมาย", href: "/schedule" }}
                    />
                  </td>
                </tr>
              ) : (
                bookings.data.map((booking) => {
                  const range = formatSlot(booking.startsAt, booking.endsAt);
                  return (
                    <tr key={booking.id} className="border-b border-outline-variant/40 last:border-0 hover:bg-surface/50">
                      <td className={`${tdClass} font-medium text-on-surface`}>{counterpartOf(me, booking)}</td>
                      <td className={`${tdClass} text-on-surface-variant`}>{range}</td>
                      <td className={`${tdClass} text-on-surface-variant`}>{booking.topic}</td>
                      <td className={tdClass}>
                        <StatusBadge tone={STATUS_TONE[booking.status]} label={STATUS_LABEL[booking.status]} />
                      </td>
                      <td className={tdClass}>
                        {booking.unreadCount > 0 ? (
                          <StatusBadge tone="warning" label={`${booking.unreadCount} ข้อความ`} />
                        ) : (
                          <span className="text-on-surface-variant">-</span>
                        )}
                      </td>
                      <td className={`${tdClass} text-right`}>
                        <Link
                          href={`/bookings/${booking.id}#chat`}
                          aria-label={`เปิดแชท ${counterpartOf(me, booking)} ${range}`}
                          className="text-label-md text-primary-container hover:underline"
                        >
                          เปิดแชท
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <Pagination meta={bookings.meta} path="/messages" />
      </div>
    </>
  );
}
