import Link from "next/link";
import type { ReactNode } from "react";
import { secondaryButtonClass } from "@/csmju";

/** Icon + why it is empty + a way out (ui-design-system 9.2). */
export default function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon: ReactNode;
  title: string;
  hint?: string;
  action?: { label: string; href: string };
}) {
  return (
    <div className="px-6 py-12 text-center text-body-md text-on-surface-variant">
      <div className="mx-auto mb-3 flex justify-center text-outline">{icon}</div>
      <p className="text-on-surface">{title}</p>
      {hint && <p className="mt-1">{hint}</p>}
      {action && (
        <Link href={action.href} className={`${secondaryButtonClass} mt-4 inline-block`}>
          {action.label}
        </Link>
      )}
    </div>
  );
}
