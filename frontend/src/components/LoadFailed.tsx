import { cardClass } from "@/csmju";

/** A call the page needed failed: say what happened, in place of the content (ui-design-system 9.3). */
export default function LoadFailed({ message }: { message: string }) {
  return (
    <div role="alert" className={`${cardClass} px-6 py-12 text-center`}>
      <h2 className="mb-2 font-display text-headline-md text-on-surface">โหลดข้อมูลไม่สำเร็จ</h2>
      <p className="text-body-md text-on-surface-variant">{message}</p>
    </div>
  );
}
