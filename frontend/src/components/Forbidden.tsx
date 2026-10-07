import Link from "next/link";
import { cardClass, secondaryButtonClass } from "@/csmju";

/** ui-design-system 9.3 FORBIDDEN: a page this role may not open. */
export default function Forbidden() {
  return (
    <div className={`${cardClass} px-6 py-12 text-center`}>
      <h1 className="mb-2 font-display text-headline-md text-on-surface">ไม่มีสิทธิ์เข้าถึงส่วนนี้</h1>
      <p className="text-body-md text-on-surface-variant">
        คุณไม่มีสิทธิ์เข้าถึงส่วนนี้ หากคิดว่าเป็นข้อผิดพลาด กรุณาติดต่อผู้ดูแลระบบย่อยนี้
      </p>
      <Link href="/" className={`${secondaryButtonClass} mt-6 inline-block`}>
        กลับหน้าหลัก
      </Link>
    </div>
  );
}
