import { CsmjuLogo, cardClass, primaryButtonClass, secondaryButtonClass } from "@/csmju";
import { getHealth } from "@/lib/api";
import { CORE_HUB_WEB_URL } from "@/lib/core-hub";
import { loginHref } from "@/lib/sign-in";

/**
 * What a visitor without a session sees. The subsystem has no sign-in form of
 * its own (SEC-05): the button is a link to /auth/login, which sends the
 * browser to Core Hub.
 */
export default async function SignedOut({ reason, next = "/" }: { reason: string | null; next?: string }) {
  const health = await getHealth();

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6">
      <CsmjuLogo framed className="mx-auto w-56" />
      <section className={`${cardClass} px-6 py-8`}>
        <h1 className="mb-2 font-display text-headline-lg text-on-surface">Q-Teacher</h1>
        <p className="mb-6 text-body-md text-on-surface-variant">
          ระบบนัดหมายเข้าพบอาจารย์ สาขาวิชาวิทยาการคอมพิวเตอร์ มหาวิทยาลัยแม่โจ้
        </p>
        {reason && (
          <p role="alert" className="mb-4 rounded-lg bg-error-container px-4 py-3 text-label-md text-on-error-container">
            {reason}
          </p>
        )}
        <p className="mb-6 text-body-md text-on-surface-variant">
          ระบบนี้ไม่มีหน้าเข้าสู่ระบบของตัวเอง ใช้บัญชีเดียวกับ CSMJU Core Hub
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <a className={primaryButtonClass} href={loginHref(next)}>
            เข้าสู่ระบบผ่าน CSMJU Core Hub
          </a>
          {CORE_HUB_WEB_URL && (
            <a className={`${secondaryButtonClass} text-center`} href={CORE_HUB_WEB_URL}>
              กลับ CSMJU Portal
            </a>
          )}
        </div>
        <p className="mt-6 text-label-sm text-on-surface-variant">
          สถานะระบบ: {health?.status === "ok" ? "พร้อมใช้งาน" : "ติดต่อ backend ไม่ได้"}
        </p>
      </section>
    </div>
  );
}
