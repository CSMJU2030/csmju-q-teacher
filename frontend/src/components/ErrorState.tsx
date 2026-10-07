"use client";

import { useEffect } from "react";
import { cardClass, primaryButtonClass } from "@/csmju";

// ErrorState มาตรฐาน (ui-design-system.md §9.3 INTERNAL_ERROR) — ห้ามแสดง error.message ดิบ
export default function ErrorState({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div role="alert" className={`${cardClass} px-6 py-12 text-center`}>
      <h1 className="mb-2 font-display text-headline-md text-on-surface">ระบบขัดข้องชั่วคราว</h1>
      <p className="text-body-md text-on-surface-variant">
        กรุณาลองอีกครั้ง หากยังพบปัญหา กรุณาแจ้งผู้ดูแลระบบ
        {error.digest && (
          <>
            {" "}
            พร้อมรหัส: <span className="tabular-nums">{error.digest}</span>
          </>
        )}
      </p>
      <button type="button" onClick={() => retry()} className={`${primaryButtonClass} mx-auto mt-6`}>
        ลองอีกครั้ง
      </button>
    </div>
  );
}
