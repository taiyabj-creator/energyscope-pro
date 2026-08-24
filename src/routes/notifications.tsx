import { createFileRoute } from "@tanstack/react-router";
import { BellRing, CalendarCheck, CheckCheck, WifiOff, X } from "lucide-react";
import { Panel, PanelHeading, Skeleton } from "@/components/ui/primitives";
import {
  useDismissNotification,
  useMarkNotificationsRead,
  useNotifications,
} from "@/hooks/useSolarData";
import type { NotificationItem } from "@/types/solar";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/notifications")({
  head: () => ({ meta: [{ title: "Notifications — UTL Solar Dashboard" }] }),
  component: NotificationsPage,
});

const KIND_ICONS = {
  daily_summary: CalendarCheck,
  inverter_offline: WifiOff,
  inverter_online: BellRing,
} as const;

function kindIcon(kind: string) {
  return (
    (KIND_ICONS as Record<string, (typeof KIND_ICONS)[keyof typeof KIND_ICONS]>)[kind] ?? BellRing
  );
}

function NotificationRow({
  item,
  onOpen,
  onDismiss,
}: {
  item: NotificationItem;
  onOpen: (item: NotificationItem) => void;
  onDismiss: (id: string) => void;
}) {
  const Icon = kindIcon(item.kind);

  return (
    <li
      className={cn(
        "group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/40",
        item.unread && "bg-primary/5",
      )}
    >
      <span
        className={cn(
          "mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg",
          item.kind === "inverter_offline"
            ? "bg-destructive/12 text-destructive"
            : "bg-primary/12 text-primary",
          item.unread && "ring-1 ring-primary/30",
        )}
      >
        <Icon className="size-4" />
      </span>

      <div className="min-w-0 flex-1">
        <button type="button" onClick={() => onOpen(item)} className="w-full text-left">
          <p className="flex items-center gap-2 text-[13px] font-medium">
            {item.title}
            {item.unread && (
              <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-label="Unread" />
            )}
          </p>
          <p className="mt-0.5 whitespace-pre-line text-xs text-muted-foreground">{item.detail}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">{item.time}</p>
        </button>
      </div>

      <button
        type="button"
        onClick={() => onDismiss(item.id)}
        aria-label="Dismiss notification"
        className="grid size-7 shrink-0 place-items-center rounded-lg text-muted-foreground opacity-0 transition-opacity hover:bg-muted/60 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
      >
        <X className="size-3.5" />
      </button>
    </li>
  );
}

function NotificationsPage() {
  const { data: notifications, isLoading, isError } = useNotifications();
  const markRead = useMarkNotificationsRead();
  const dismiss = useDismissNotification();

  const items = notifications ?? [];
  const unreadCount = items.filter((n) => n.unread).length;

  function openItem(item: NotificationItem) {
    if (item.unread) markRead.mutate([item.id]);
    if (item.url && item.url.startsWith("/")) {
      window.location.assign(item.url);
    }
  }

  return (
    <div className="space-y-6">
      <Panel>
        <PanelHeading
          title="Notifications"
          subtitle={
            unreadCount > 0
              ? `${unreadCount} unread · history kept for 7 days`
              : "History kept for 7 days"
          }
          action={
            unreadCount > 0 ? (
              <button
                type="button"
                onClick={() => markRead.mutate(undefined)}
                disabled={markRead.isPending}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground disabled:opacity-50"
              >
                <CheckCheck className="size-3.5" />
                Mark all read
              </button>
            ) : undefined
          }
        />

        {isLoading ? (
          <div className="space-y-3 p-4">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : isError ? (
          <p className="px-4 py-10 text-center text-sm text-destructive">
            Could not load notifications. Please try again.
          </p>
        ) : items.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            No notifications yet 🎉
          </p>
        ) : (
          <ul className="divide-y divide-border/60">
            {items.map((item) => (
              <NotificationRow
                key={item.id}
                item={item}
                onOpen={openItem}
                onDismiss={(id) => dismiss.mutate(id)}
              />
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
