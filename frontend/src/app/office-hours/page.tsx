import { createOfficeHour, deleteOfficeHour, toggleOfficeHour } from "@/app/actions";
import ReSignIn from "@/app/_components/ReSignIn";
import ConfirmForm from "@/components/ConfirmForm";
import EmptyState from "@/components/EmptyState";
import Forbidden from "@/components/Forbidden";
import LoadFailed from "@/components/LoadFailed";
import Notice from "@/components/Notice";
import { requireMe } from "@/components/session";
import { EventIcon, PageHeader, StatusBadge, cardClass, inputClass, primaryButtonClass, tdClass, thClass } from "@/csmju";
import { isUnauthorized, listOfficeHours } from "@/lib/api";
import { WEEKDAYS, WEEKDAY_LABEL } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "เวลาทำการ" };

const SLOT_CHOICES = [15, 20, 30, 45, 60];

export default async function OfficeHoursPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { ok, error } = await searchParams;

  const gate = await requireMe("/office-hours");
  if (!gate.me) return gate.view;
  const me = gate.me;
  if (me.subsystemRole === "STUDENT") return <Forbidden />;

  const hours = await listOfficeHours();
  if (isUnauthorized(hours)) return <ReSignIn next="/office-hours" />;
  if (!hours.ok) return <LoadFailed message={hours.message} />;

  const teacher = me.subsystemRole === "TEACHER";

  return (
    <>
      <PageHeader
        title="เวลาทำการ"
        description="เวลาที่เปิดให้นักศึกษานัดเข้าพบในแต่ละสัปดาห์ ตารางนัดหมายสร้างจากเวลาเหล่านี้"
      />

      <Notice ok={ok} error={error} />

      {teacher && (
        <form action={createOfficeHour} className={`fade-slide-up stagger-1 ${cardClass} space-y-4 px-6 py-5`}>
          <h2 className="font-display text-headline-md text-on-surface">เพิ่มเวลาทำการ</h2>
          <p className="text-label-sm text-on-surface-variant">ช่องที่มี * จำเป็นต้องกรอก</p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div>
              <label htmlFor="dayOfWeek" className="mb-2 block text-label-md text-on-surface">
                วัน *
              </label>
              <select id="dayOfWeek" name="dayOfWeek" required aria-required="true" className={inputClass}>
                {WEEKDAYS.map((day) => (
                  <option key={day} value={day}>
                    {WEEKDAY_LABEL[day]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="startTime" className="mb-2 block text-label-md text-on-surface">
                เวลาเริ่ม *
              </label>
              <input id="startTime" name="startTime" type="time" required aria-required="true" defaultValue="09:00" className={inputClass} />
            </div>
            <div>
              <label htmlFor="endTime" className="mb-2 block text-label-md text-on-surface">
                เวลาสิ้นสุด *
              </label>
              <input id="endTime" name="endTime" type="time" required aria-required="true" defaultValue="12:00" className={inputClass} />
            </div>
            <div>
              <label htmlFor="slotMinutes" className="mb-2 block text-label-md text-on-surface">
                ความยาวต่อนัดหมาย (นาที)
              </label>
              <select id="slotMinutes" name="slotMinutes" defaultValue="30" className={inputClass}>
                {SLOT_CHOICES.map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {minutes}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-end pt-2">
            <button type="submit" className={primaryButtonClass}>
              เพิ่มเวลาทำการ
            </button>
          </div>
        </form>
      )}

      <section className={`fade-slide-up stagger-2 ${cardClass}`}>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-outline-variant/40 bg-surface text-label-md text-on-surface-variant">
                {!teacher && <th className={thClass}>อาจารย์</th>}
                <th className={thClass}>วัน</th>
                <th className={thClass}>เวลา</th>
                <th className={thClass}>ความยาวต่อนัดหมาย</th>
                <th className={thClass}>สถานะ</th>
                <th className={`${thClass} text-right`}>จัดการ</th>
              </tr>
            </thead>
            <tbody className="text-body-md">
              {hours.data.length === 0 ? (
                <tr>
                  <td colSpan={teacher ? 5 : 6}>
                    <EmptyState
                      icon={<EventIcon className="h-10 w-10" />}
                      title="ยังไม่มีเวลาทำการ"
                      hint={teacher ? "เริ่มต้นด้วยการเพิ่มเวลาทำการแรกในฟอร์มด้านบน" : "อาจารย์ยังไม่ได้เพิ่มเวลาทำการ"}
                    />
                  </td>
                </tr>
              ) : (
                hours.data.map((hour) => {
                  const label = `${WEEKDAY_LABEL[hour.dayOfWeek]} ${hour.startTime}–${hour.endTime}`;
                  return (
                    <tr key={hour.id} className="border-b border-outline-variant/40 last:border-0 hover:bg-surface/50">
                      {!teacher && (
                        <td className={`${tdClass} tabular-nums text-on-surface-variant`}>{hour.teacherPersonCode ?? "ไม่ทราบรหัส"}</td>
                      )}
                      <td className={`${tdClass} font-medium text-on-surface`}>{WEEKDAY_LABEL[hour.dayOfWeek]}</td>
                      <td className={`${tdClass} tabular-nums text-on-surface-variant`}>
                        {hour.startTime}–{hour.endTime} น.
                      </td>
                      <td className={`${tdClass} tabular-nums text-on-surface-variant`}>{hour.slotMinutes} นาที</td>
                      <td className={tdClass}>
                        <StatusBadge
                          tone={hour.isAvailable ? "success" : "neutral"}
                          label={hour.isAvailable ? "เปิดรับนัดหมาย" : "ปิดรับนัดหมาย"}
                        />
                      </td>
                      <td className={`${tdClass} text-right`}>
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <form action={toggleOfficeHour}>
                            <input type="hidden" name="id" value={hour.id} />
                            <input type="hidden" name="isAvailable" value={String(!hour.isAvailable)} />
                            <button
                              type="submit"
                              aria-label={`${hour.isAvailable ? "ปิดรับนัดหมาย" : "เปิดรับนัดหมาย"} ${label}`}
                              className="rounded-md border border-outline-variant px-2.5 py-1 text-label-sm text-on-surface-variant transition-colors hover:bg-surface-variant/50"
                            >
                              {hour.isAvailable ? "ปิดรับนัดหมาย" : "เปิดรับนัดหมาย"}
                            </button>
                          </form>
                          <ConfirmForm
                            action={deleteOfficeHour}
                            fields={{ id: hour.id }}
                            trigger="ลบ"
                            triggerLabel={`ลบเวลาทำการ ${label}`}
                            title={`ลบเวลาทำการ ${label}?`}
                            message="เวลาทำการนี้จะถูกลบถาวร ช่วงเวลาในตารางนัดหมายที่สร้างจากเวลานี้จะหายไป นัดหมายที่มีอยู่แล้วจะยังคงอยู่"
                            confirmLabel="ลบเวลาทำการ"
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
