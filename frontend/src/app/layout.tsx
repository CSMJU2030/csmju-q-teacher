import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Noto_Sans_Thai } from "next/font/google";
import { CsmjuAppShell, type NavItem } from "@/csmju";
import { getMe, type Me } from "@/lib/api";
import { CORE_HUB_WEB_URL } from "@/lib/core-hub";
import { ROLE_LABEL } from "@/lib/format";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
});

const notoSansThai = Noto_Sans_Thai({
  variable: "--font-noto-thai",
  subsets: ["latin", "thai"],
  weight: ["400", "500", "600", "700"],
});

// ต้องตรงกับ display_name ใน subsystem.yaml
const DISPLAY_NAME = "Q-Teacher";

export const metadata: Metadata = {
  title: {
    template: `%s · ${DISPLAY_NAME} · CSMJU`,
    default: `${DISPLAY_NAME} · CSMJU`,
  },
};

/** The menu of each role: the UI only hides what the backend would answer 403 to anyway. */
function navFor(me: Me): NavItem[] {
  const teacherSide = me.subsystemRole !== "STUDENT";
  return [
    { label: "ภาพรวม", labelEn: "Overview", href: "/", icon: "dashboard" },
    { label: "ตารางนัดหมาย", labelEn: "Schedule", href: "/schedule", icon: "event" },
    ...(me.subsystemRole !== "TEACHER"
      ? [{ label: "อาจารย์", labelEn: "Teachers", href: "/teachers", icon: "school" } satisfies NavItem]
      : []),
    { label: "นัดหมายของฉัน", labelEn: "Bookings", href: "/bookings", icon: "description" },
    ...(teacherSide
      ? [{ label: "เวลาทำการ", labelEn: "Office hours", href: "/office-hours", icon: "settings" } satisfies NavItem]
      : []),
  ];
}

/** Two letters for the avatar: the start of the Core Hub email (display only, never a key). */
function initialsOf(me: Me): string {
  return (me.email.match(/[A-Za-z0-9]/g) ?? ["U"]).slice(0, 2).join("").toUpperCase();
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // The identity the backend verified from the Core Hub token. Without a session
  // (a first visit, or one that ended) the pages render their own sign-in view.
  const me = await getMe();

  return (
    <html
      lang="th"
      className={`${jakarta.variable} ${notoSansThai.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-on-surface">
        {me.ok ? (
          <CsmjuAppShell
            displayName={DISPLAY_NAME}
            nav={navFor(me.data)}
            user={{ initials: initialsOf(me.data), roleLabel: ROLE_LABEL[me.data.subsystemRole] }}
            coreHubUrl={CORE_HUB_WEB_URL}
          >
            {children}
          </CsmjuAppShell>
        ) : (
          <main className="flex min-h-dvh flex-col justify-center p-4 md:p-12">{children}</main>
        )}
      </body>
    </html>
  );
}
