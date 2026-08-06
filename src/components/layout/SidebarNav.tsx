import { Link, useRouterState } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  Activity,
  BarChart3,
  CalendarClock,
  ChevronLeft,
  Cpu,
  CloudSun,
  Stethoscope,
  LayoutDashboard,
  Settings,
  Sun,
  Wrench,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/energy", label: "Energy", icon: Zap },
  { to: "/history", label: "History", icon: CalendarClock },
  { to: "/weather", label: "Weather", icon: CloudSun },
  { to: "/maintenance", label: "Maintenance", icon: Wrench },
  { to: "/devices", label: "Devices", icon: Cpu },
  { to: "/diagnostics", label: "Diagnostics", icon: Stethoscope },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function SidebarNav({
  collapsed,
  onToggle,
  onNavigate,
  capacityKw,
}: {
  collapsed: boolean;
  onToggle?: () => void;
  onNavigate?: () => void;
  capacityKw: number | undefined;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <div className="flex items-center gap-3 px-1 pt-1">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[image:var(--gradient-solar)] text-background shadow-lg">
          <Sun className="size-5" aria-hidden />
        </span>
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-tight">UTL Solar</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {capacityKw ?? "—"} kW · On-grid
            </p>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-1" aria-label="Main navigation">
        {navItems.map((item) => {
          const active = pathname === item.to;
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              title={collapsed ? item.label : undefined}
              className={cn(
                "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
                active
                  ? "bg-primary/12 text-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              {active && (
                <motion.span
                  layoutId="nav-active"
                  className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-full bg-primary"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              )}
              <item.icon
                className={cn(
                  "size-[18px] shrink-0 transition-transform duration-200 group-hover:scale-110",
                  active && "text-primary",
                )}
                aria-hidden
              />
              {!collapsed && <span className="truncate font-medium">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-3">
        {!collapsed && (
          <div className="rounded-2xl border border-border/70 bg-muted/30 p-3">
            <p className="text-[11px] font-medium text-muted-foreground">Battery storage</p>
            <p className="mt-1 text-xs">
              No battery installed — widgets stay hidden until storage is added.
            </p>
          </div>
        )}
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-border/70 px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            <ChevronLeft className={cn("size-4 transition-transform", collapsed && "rotate-180")} />
            {!collapsed && "Collapse"}
          </button>
        )}
      </div>
    </div>
  );
}

export function SidebarFooterStatus() {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <Activity className="size-3.5" aria-hidden /> Live
    </span>
  );
}
