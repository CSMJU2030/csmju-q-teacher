import Link from "next/link";
import ReSignIn from "@/app/_components/ReSignIn";
import EmptyState from "@/components/EmptyState";
import Forbidden from "@/components/Forbidden";
import LoadFailed from "@/components/LoadFailed";
import Pagination from "@/components/Pagination";
import { requireMe } from "@/components/session";
import { GroupIcon, PageHeader, cardClass, tdClass, thClass } from "@/csmju";
import { call, isUnauthorized, type Teacher } from "@/lib/api";

export const dynamic = "force-dynamic";
export const metadata = { title: "อาจารย์" };

const PAGE_SIZE = 20;

export default async function TeachersPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page: pageText } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageText ?? "1", 10) || 1);

  const gate = await requireMe("/teachers");
  if (!gate.me) return gate.view;
  // A teacher has no use for this list; the backend would answer it for them too.
  if (gate.me.subsystemRole === "TEACHER") return <Forbidden />;

  const teachers = await call<Teacher[]>(`/api/v1/teachers?page=${page}&limit=${PAGE_SIZE}`);
  if (isUnauthorized(teachers)) return <ReSignIn next="/teachers" />;
  if (!teachers.ok) return <LoadFailed message={teachers.message} />;

  return (
    <>
      <PageHeader title="อาจารย์" description="อาจารย์ที่เปิดเวลาทำการแล้ว เลือกเพื่อดูช่วงเวลาที่ว่าง" />

      <div className={`fade-slide-up stagger-1 ${cardClass}`}>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-outline-variant/40 bg-surface text-label-md text-on-surface-variant">
                <th className={thClass}>รหัสบุคลากร</th>
                <th className={`${thClass} text-right`}>จัดการ</th>
              </tr>
            </thead>
            <tbody className="text-body-md">
              {teachers.data.length === 0 ? (
                <tr>
                  <td colSpan={2}>
                    <EmptyState
                      icon={<GroupIcon className="h-10 w-10" />}
                      title="ยังไม่มีอาจารย์เปิดเวลาทำการ"
                      hint="เมื่ออาจารย์เพิ่มเวลาทำการแล้ว จะแสดงที่หน้านี้"
                    />
                  </td>
                </tr>
              ) : (
                teachers.data.map((teacher) => (
                  <tr
                    key={teacher.coreUserId}
                    className="border-b border-outline-variant/40 last:border-0 hover:bg-surface/50"
                  >
                    <td className={`${tdClass} font-medium tabular-nums text-on-surface`}>
                      {teacher.personCode ?? "ไม่ทราบรหัส"}
                    </td>
                    <td className={`${tdClass} text-right`}>
                      <Link
                        href={`/schedule?teacher=${encodeURIComponent(teacher.coreUserId)}`}
                        aria-label={`ดูตารางของอาจารย์ ${teacher.personCode ?? ""}`}
                        className="text-label-md text-primary-container hover:underline"
                      >
                        ดูตาราง
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination meta={teachers.meta} path="/teachers" />
      </div>
    </>
  );
}
