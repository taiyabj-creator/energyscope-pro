import { Skeleton } from "@/components/ui/skeleton";

export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* Top KPI cards */}
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl border bg-card p-6 space-y-4">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-3 w-40" />
          </div>
        ))}
      </div>

      {/* Main content */}
      <div className="grid gap-6 xl:grid-cols-3">
        {/* Generation profile */}
        <div className="xl:col-span-2 rounded-2xl border bg-card p-6">
          <Skeleton className="mb-3 h-6 w-48" />
          <Skeleton className="mb-6 h-4 w-64" />
          <Skeleton className="h-[420px] w-full rounded-xl" />
        </div>

        {/* Live power flow */}
        <div className="rounded-2xl border bg-card p-6">
          <Skeleton className="mb-3 h-6 w-40" />
          <Skeleton className="mb-6 h-4 w-56" />
          <Skeleton className="h-[420px] w-full rounded-xl" />
        </div>
      </div>

      {/* Bottom KPI cards */}
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl border bg-card p-6 space-y-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-3 w-32" />
          </div>
        ))}
      </div>
    </div>
  );
}
