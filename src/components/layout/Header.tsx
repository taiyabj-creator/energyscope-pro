import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Bell, Menu, Moon, Sun } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useLivePower, useLogger, useNotifications, usePlantInfo } from "@/hooks/useSolarData";
import { Chip, StatusDot } from "@/components/ui/primitives";

import { formatMeasurementFreshness } from "@/utils/measurementFreshness";

function useClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export function Header({ title, onOpenSidebar }: { title: string; onOpenSidebar: () => void }) {
  const { theme, toggle } = useTheme();
  const now = useClock();
  const navigate = useNavigate();
  const { data: plant } = usePlantInfo();
  const { data: live } = useLivePower();
  const { data: logger } = useLogger();
  const { data: notifications } = useNotifications();
  const unread = notifications?.filter((n) => n.unread).length ?? 0;
  const freshness = formatMeasurementFreshness(live?.timestamp);

  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/70 backdrop-blur-xl">
      <div className="mx-auto grid max-w-[1600px] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3.5 sm:px-6 lg:py-5">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onOpenSidebar}
            aria-label="Open navigation"
            className="grid size-10 shrink-0 place-items-center rounded-xl border border-border/70 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground lg:hidden"
          >
            <Menu className="size-5" />
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold sm:text-2xl">{title}</h1>
            <p className="truncate text-[12px] text-muted-foreground sm:text-sm">
              Welcome, {plant?.ownerName ?? "—"} 👋 · Real-time monitoring
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <div className="hidden text-right lg:block">
            <p className="num text-sm font-semibold">
              {now
                ? now.toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                    hour12: true,
                  })
                : "--:--"}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {now
                ? now.toLocaleDateString("en-GB", {
                    weekday: "short",
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })
                : ""}
            </p>
          </div>

          <div className="hidden items-center gap-2 md:flex">
            <Chip tone={logger?.status === "online" ? "positive" : "warning"}>
              <StatusDot status={logger?.status === "online" ? "online" : "offline"} />
              Logger {logger?.status === "online" ? "Online" : "Offline"}
            </Chip>
            {logger?.status === "online" ? (
              <span className="text-xs text-muted-foreground">{freshness}</span>
            ) : null}
          </div>

          <button
            type="button"
            onClick={toggle}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            className="grid size-10 place-items-center rounded-xl border border-border/70 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            {theme === "dark" ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
          </button>

          <button
            type="button"
            onClick={() => navigate({ to: "/notifications" })}
            aria-label="Notifications"
            className="relative grid size-10 place-items-center rounded-xl border border-border/70 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            <Bell className="size-[18px]" />
            {unread > 0 && (
              <span className="absolute -right-0.5 -top-0.5 grid size-4 place-items-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </button>

          <a
            href="/profile"
            aria-label="Profile"
            className="grid size-10 place-items-center rounded-xl border border-border/70 bg-muted/40 text-sm font-semibold transition-colors hover:bg-muted"
          >
            {(plant?.ownerName ?? "U").slice(0, 1)}
          </a>
        </div>
      </div>
    </header>
  );
}
