import Link from "next/link";
import { cardClass, secondaryButtonClass } from "@/csmju";

// EmptyState สำหรับ 404 (ui-design-system.md §9.3 NOT_FOUND) — ไม่ใช่ error สีแดง
export default function NotFound() {
  return (
    <div className={`${cardClass} px-6 py-12 text-center`}>
      <h1 className="mb-2 font-display text-headline-md text-on-surface">
        ไม่พบหน้าที่คุณกำลังค้นหา
      </h1>
      <p className="text-body-md text-on-surface-variant">
        อาจถูกลบไปแล้วหรือลิงก์ไม่ถูกต้อง
      </p>
      <Link href="/" className={`${secondaryButtonClass} mt-6 inline-block`}>
        กลับหน้าหลัก
      </Link>
    </div>
  );
}
