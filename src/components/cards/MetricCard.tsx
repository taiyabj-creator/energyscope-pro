import { motion } from "framer-motion";
import { ArrowDownRight, ArrowUpRight, Minus, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/primitives";

export type MetricTone = "solar" | "load" | "grid" | "battery" | "neutral";

const toneRing: Record<MetricTone, string> = {
  solar: "text-solar",
  load: "text-load",
  grid: "text-grid",
  battery: "text-battery",
  neutral: "text-primary",
};

const toneGlow: Record<MetricTone, string> = {
  solar: "from-solar/18",
  load: "from-load/18",
  grid: "from-grid/18",
  battery: "from-battery/18",
  neutral: "from-primary/18",
};

export function MetricCard({
  title,
  value,
  unit,
  icon: Icon,
  tone = "neutral",
  trend,
  footnote,
  loading,
  delay = 0,
}: {
  title: string;
  value: string;
  unit?: string;
  icon: LucideIcon;
  tone?: MetricTone;
  trend?: number | null;
  footnote?: string;
  loading?: boolean;
  delay?: number;
}) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -3 }}
      className="panel group relative overflow-hidden p-5"
    >
      <div
        className={cn(
          "pointer-events-none absolute -right-10 -top-14 size-36 rounded-full bg-gradient-to-b to-transparent opacity-70 blur-2xl transition-opacity duration-500 group-hover:opacity-100",
          toneGlow[tone],
        )}
      />
      <div className="relative grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <p className="min-w-0 truncate text-[13px] font-medium text-muted-foreground">{title}</p>
        <span
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-xl border border-border/70 bg-muted/40",
            toneRing[tone],
          )}
        >
          <Icon className="size-4" aria-hidden />
        </span>
      </div>

      <div className="relative mt-4 flex items-baseline gap-1.5">
        {loading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <>
            <span className="num text-3xl font-semibold">{value}</span>
            {unit ? <span className="text-sm text-muted-foreground">{unit}</span> : null}
          </>
        )}
      </div>

      <div className="relative mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
        {typeof trend === "number" ? <Trend value={trend} /> : null}
        {footnote ? <span className="text-muted-foreground">{footnote}</span> : null}
      </div>
    </motion.article>
  );
}

export function Trend({ value }: { value: number }) {
  const flat = Math.abs(value) < 0.5;
  const up = value > 0;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-medium",
        flat
          ? "bg-muted/50 text-muted-foreground"
          : up
            ? "bg-positive/12 text-positive"
            : "bg-destructive/12 text-destructive",
      )}
    >
      <Icon className="size-3" aria-hidden />
      {flat ? "flat" : `${Math.abs(value).toFixed(1)}%`}
    </span>
  );
}
