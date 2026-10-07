import { cardClass } from "@/csmju";

/** Loading shapes that look like the page that follows (ui-design-system 9.1). */
const bar = "animate-pulse rounded-lg bg-surface-container";

function PageHeaderSkeleton() {
  return (
    <div className="space-y-3">
      <div className={`${bar} h-8 w-48`} />
      <div className={`${bar} h-5 w-72 max-w-full`} />
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-8">
      <span className="sr-only">กำลังโหลดข้อมูล...</span>
      <PageHeaderSkeleton />
      <div className={cardClass}>
        <div className="border-b border-outline-variant/40 px-6 py-5">
          <div className={`${bar} h-11`} />
        </div>
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="border-b border-outline-variant/40 px-6 py-4 last:border-0">
            <div className={`${bar} h-6`} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function GridSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-8">
      <span className="sr-only">กำลังโหลดข้อมูล...</span>
      <PageHeaderSkeleton />
      <div className={`${cardClass} p-6`}>
        <div className="grid grid-cols-6 gap-2">
          {Array.from({ length: 42 }, (_, i) => (
            <div key={i} className={`${bar} h-10`} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function CardsSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-8">
      <span className="sr-only">กำลังโหลดข้อมูล...</span>
      <PageHeaderSkeleton />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className={`${cardClass} p-6`}>
            <div className={`${bar} mb-3 h-5 w-24`} />
            <div className={`${bar} h-9 w-16`} />
          </div>
        ))}
      </div>
      <div className={`${cardClass} p-6`}>
        <div className={`${bar} h-40`} />
      </div>
    </div>
  );
}
