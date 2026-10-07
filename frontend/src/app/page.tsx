import Link from "next/link";
import { EventIcon, PageHeader, StatusBadge, cardClass, primaryButtonClass, tdClass, thClass } from "@/csmju";
import EmptyState from "@/components/EmptyState";
import LoadFailed from "@/components/LoadFailed";
import { requireMe } from "@/components/session";
import { counterpartOf } from "@/lib/booking";
import { isUnauthorized, listBookings } from "@/lib/api";
import { bangkokDate, formatSlot, STATUS_LABEL, STATUS_TONE } from "@/lib/format";
import ReSignIn from "./_components/ReSignIn";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const gate = await requireMe("/");
  if (!gate.me) return gate.view;
  const me = gate.me;

  const today = bangkokDate();
  const upcoming = await listBookings({ status: "CONFIRMED", from: today, sort: "startsAt", limit: 5 });
  if (isUnauthorized(upcoming)) return <ReSignIn next="/" />;
  if (!upcoming.ok) return <LoadFailed message={upcoming.message} />;

  const todayCount = upcoming.data.filter((booking) => bangkokDate(booking.startsAt) === today).length;
  const unread = upcoming.data.reduce((sum, booking) => sum + booking.unreadCount, 0);
  const teacher = me.subsystemRole === "TEACHER";
  const student = me.subsystemRole === "STUDENT";

  return (
    <>
      <PageHeader
        title="ภาพรวม"
        description={
          teacher
            ? "นัดหมายที่นักศึกษาจะมาพบและข้อความที่ยังไม่ได้อ่าน"
            : student
              ? "นัดหมายเข้าพบอาจารย์ของคุณและข้อความที่ยังไม่ได้อ่าน"
              : "ภาพรวมนัดหมายเข้าพบอาจารย์ทั้งระบบ"
        }
      />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <Stat label="นัดหมายที่กำลังจะมาถึง" value={upcoming.meta?.total ?? upcoming.data.length} />
        <Stat label="นัดหมายวันนี้ (ใน 5 รายการแรก)" value={todayCount} />
        <Stat label="ข้อความที่ยังไม่อ่าน (ใน 5 รายการแรก)" value={unread} />
      </div>

      <section className={`fade-slide-up stagger-1 ${cardClass}`}>
        <div className="flex flex-col gap-3 border-b border-outline-variant/40 px-6 py-5 md:flex-row md:items-center md:justify-between">
          <h2 className="border-l-4 border-primary-container pl-3 font-display text-headline-md text-on-surface">
            นัดหมายที่กำลังจะมาถึง
          </h2>
          <Link href="/bookings" className="text-label-md text-primary-container hover:underline">
            ดูทั้งหมด
          </Link>
        </div>

        {upcoming.data.length === 0 ? (
          <EmptyState
            icon={<EventIcon className="h-10 w-10" />}
            title="ยังไม่มีนัดหมายที่กำลังจะมาถึง"
            hint={student ? "อาจารย์เป็นผู้สร้างนัดหมายให้ ดูเวลาว่างของอาจารย์ได้ที่ตารางนัดหมาย" : "เปิดตารางนัดหมายแล้วเลือกช่วงเวลาที่ว่างเพื่อสร้างนัดหมาย"}
            action={{ label: student ? "ดูอาจารย์ทั้งหมด" : "เปิดตารางนัดหมาย", href: student ? "/teachers" : "/schedule" }}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-outline-variant/40 bg-surface text-label-md text-on-surface-variant">
                  <th className={thClass}>วันและเวลา</th>
                  <th className={thClass}>{teacher ? "นักศึกษา" : "อาจารย์"}</th>
                  <th className={thClass}>หัวข้อ</th>
                  <th className={thClass}>สถานะ</th>
                  <th className={`${thClass} text-right`}>จัดการ</th>
                </tr>
              </thead>
              <tbody className="text-body-md">
                {upcoming.data.map((booking) => (
                  <tr key={booking.id} className="border-b border-outline-variant/40 last:border-0 hover:bg-surface/50">
                    <td className={`${tdClass} font-medium text-on-surface`}>{formatSlot(booking.startsAt, booking.endsAt)}</td>
                    <td className={`${tdClass} text-on-surface-variant`}>{counterpartOf(me, booking)}</td>
                    <td className={`${tdClass} text-on-surface-variant`}>{booking.topic}</td>
                    <td className={tdClass}>
                      <StatusBadge tone={STATUS_TONE[booking.status]} label={STATUS_LABEL[booking.status]} />
                    </td>
                    <td className={`${tdClass} text-right`}>
                      <Link href={`/bookings/${booking.id}`} className="text-label-md text-primary-container hover:underline">
                        ดูรายละเอียด
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {!student && (
        <div className="flex justify-end">
          <Link href="/schedule" className={primaryButtonClass}>
            เปิดตารางนัดหมาย
          </Link>
        </div>
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className={`fade-slide-up ${cardClass} p-6`}>
      <p className="text-label-md text-on-surface-variant">{label}</p>
      <p className="mt-2 font-display text-headline-lg tabular-nums text-on-surface">{value}</p>
    </div>
  );
}
