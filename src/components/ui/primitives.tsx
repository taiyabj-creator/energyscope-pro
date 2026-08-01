import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { motion } from "framer-motion";

export function Panel({
  children,
  className,
  delay = 0,
  solid,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  solid?: boolean;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] }}
      className={cn(solid ? "panel-solid" : "panel", "p-5 sm:p-6", className)}
    >
      {children}
    </motion.section>
  );
}

export function PanelHeading({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
      <div className="min-w-0">
        <h2 className="text-base font-semibold sm:text-lg">{title}</h2>
        {subtitle ? <p className="mt-1 text-xs text-muted-foreground sm:text-sm">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-muted/70", className)} />;
}

export function StatusDot({ status }: { status: "online" | "offline" | "warning" }) {
  const tone =
    status === "online"
      ? "bg-positive shadow-[0_0_0_4px_color-mix(in_oklab,var(--positive)_22%,transparent)]"
      : status === "warning"
        ? "bg-warning shadow-[0_0_0_4px_color-mix(in_oklab,var(--warning)_22%,transparent)]"
        : "bg-destructive shadow-[0_0_0_4px_color-mix(in_oklab,var(--destructive)_22%,transparent)]";
  return <span className={cn("inline-block size-2 shrink-0 rounded-full", tone)} />;
}

export function Chip({
  children,
  className,
  tone = "default",
}: {
  children: ReactNode;
  className?: string;
  tone?: "default" | "solar" | "load" | "grid" | "positive" | "warning";
}) {
  const tones: Record<string, string> = {
    default: "text-muted-foreground border-border bg-muted/40",
    solar: "text-solar border-solar/25 bg-solar/10",
    load: "text-load border-load/25 bg-load/10",
    grid: "text-grid border-grid/25 bg-grid/10",
    positive: "text-positive border-positive/25 bg-positive/10",
    warning: "text-warning border-warning/25 bg-warning/10",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium tracking-wide",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
