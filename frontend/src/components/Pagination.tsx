import Link from "next/link";
import type { PaginationMeta } from "@/lib/api";
import { secondaryButtonClass } from "@/csmju";

/** Page links of a list (api-conventions 5): the page number goes in ?page=, the other filters are kept. */
export default function Pagination({
  meta,
  path,
  params,
}: {
  meta: PaginationMeta | undefined;
  path: string;
  params?: Record<string, string | undefined>;
}) {
  if (!meta || meta.totalPages <= 1) return null;

  const hrefFor = (page: number) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params ?? {})) if (value) search.set(key, value);
    if (page > 1) search.set("page", String(page));
    const text = search.toString();
    return text ? `${path}?${text}` : path;
  };

  return (
    <nav
      aria-label="เลือกหน้า"
      className="flex items-center justify-between gap-3 border-t border-outline-variant/40 px-6 py-4 text-body-md text-on-surface-variant"
    >
      <span className="tabular-nums">
        หน้า {meta.page} จาก {meta.totalPages} · ทั้งหมด {meta.total} รายการ
      </span>
      <div className="flex gap-2">
        {meta.page > 1 && (
          <Link href={hrefFor(meta.page - 1)} className={secondaryButtonClass}>
            ก่อนหน้า
          </Link>
        )}
        {meta.page < meta.totalPages && (
          <Link href={hrefFor(meta.page + 1)} className={secondaryButtonClass}>
            ถัดไป
          </Link>
        )}
      </div>
    </nav>
  );
}
