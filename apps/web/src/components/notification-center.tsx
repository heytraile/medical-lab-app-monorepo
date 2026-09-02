import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  Bell,
  BellRing,
  Check,
  CheckCheck,
  Trash2,
  X,
} from "lucide-react";
import {
  useNotifications,
  type AppNotification,
} from "../lib/notification-store";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./ui/popover";
import { ScrollArea } from "./ui/scroll-area";

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return new Date(iso).toLocaleDateString();
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function severityRowClass(severity: AppNotification["severity"]): string {
  switch (severity) {
    case "critical":
      return "border-l-4 border-l-lab-alarm bg-lab-alarm/10";
    case "alarm":
      return "border-l-4 border-l-lab-danger bg-lab-danger/10";
    default:
      return "border-l-4 border-l-transparent hover:bg-muted/50";
  }
}

function NotificationRow({
  item,
  onOpen,
  onAcknowledge,
}: {
  item: AppNotification;
  onOpen: (item: AppNotification) => void;
  onAcknowledge?: (item: AppNotification) => void;
}) {
  // A review request carries its own action, so the row cannot be a single
  // button — a nested button is invalid markup and unreachable by keyboard.
  const showAck = Boolean(
    onAcknowledge && item.source === "review" && item.canAcknowledge && !item.read,
  );

  return (
    <div
      className={cn(
        "border-b border-border/60 transition-colors",
        severityRowClass(item.severity),
        !item.read && "bg-muted/30",
      )}
    >
      <button
        type="button"
        onClick={() => onOpen(item)}
        className="w-full px-3 py-2.5 text-left"
      >
        <div className="flex items-start justify-between gap-2">
          <p
            className={cn(
              "text-sm font-medium leading-snug",
              item.severity === "critical" && "text-lab-alarm",
              item.severity === "alarm" && "text-lab-danger",
            )}
          >
            {!item.read && (
              <span className="mr-1.5 inline-block size-1.5 rounded-full bg-accent align-middle" />
            )}
            {item.title}
          </p>
          <span className="shrink-0 text-[10px] text-muted-foreground">
            {relativeTime(item.at)}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
          {item.body}
        </p>
      </button>

      {showAck && (
        <div className="px-3 pb-2.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => onAcknowledge?.(item)}
          >
            <Check className="mr-1 size-3.5" aria-hidden />
            Acknowledge
          </Button>
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  items,
  onOpen,
  onAcknowledge,
}: {
  title: string;
  items: AppNotification[];
  onOpen: (item: AppNotification) => void;
  onAcknowledge?: (item: AppNotification) => void;
}) {
  if (!items.length) return null;
  return (
    <div>
      <p className="sticky top-0 z-10 bg-card px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      {items.map((item) => (
        <NotificationRow
          key={item.id}
          item={item}
          onOpen={onOpen}
          onAcknowledge={onAcknowledge}
        />
      ))}
    </div>
  );
}

export function NotificationCenter() {
  const navigate = useNavigate();
  const {
    notifications,
    unreadCount,
    criticalCount,
    markRead,
    markAllRead,
    clearAll,
  } = useNotifications();

  const escalated = criticalCount > 0;

  function openNotification(item: AppNotification) {
    // Opening a review request to look at it is not the same as signing it
    // off, so only the explicit Acknowledge button clears one.
    if (item.source !== "review") markRead(item.id);
    if (item.accessionNumber) {
      void navigate({
        to: "/bench",
        search: {
          analyzer: item.analyzerId,
          q: item.accessionNumber,
        },
      });
    } else {
      void navigate({ to: "/bench" });
    }
  }

  // Open review requests pin to the top: they are work items waiting on a
  // person, not a feed entry that scrolls away.
  const openReviews = notifications.filter(
    (n) => n.source === "review" && !n.read,
  );
  const feed = notifications.filter((n) => !openReviews.includes(n));
  const unreadCritical = feed.filter(
    (n) => !n.read && n.severity === "critical",
  );
  const rest = feed.filter((n) => !(!n.read && n.severity === "critical"));
  const today = rest.filter((n) => isToday(n.at));
  const earlier = rest.filter((n) => !isToday(n.at));

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          // The pulse alone is not a signal a screen reader can convey.
          aria-label={[
            "Notifications",
            unreadCount ? `${unreadCount} unread` : null,
            criticalCount ? `${criticalCount} needing urgent attention` : null,
          ]
            .filter(Boolean)
            .join(", ")}
        >
          {escalated && (
            <span
              className="pointer-events-none absolute inset-1 animate-alarm-ring rounded-full bg-lab-alarm/40"
              aria-hidden
            />
          )}
          {escalated ? (
            <BellRing
              className="relative size-5 animate-alarm-shake text-lab-alarm"
              strokeWidth={2.5}
            />
          ) : (
            <Bell className="size-5" />
          )}
          {unreadCount > 0 && (
            <span
              className={cn(
                "absolute -right-0.5 -top-0.5 flex min-w-[1.125rem] items-center justify-center rounded-full px-1 text-[10px] font-bold text-white",
                escalated
                  ? "bg-lab-alarm ring-2 ring-card"
                  : "bg-lab-alarm",
              )}
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
          <div>
            <p className="text-sm font-semibold">Notifications</p>
            {unreadCount > 0 && (
              <p className="text-xs text-muted-foreground">
                {unreadCount} unread
              </p>
            )}
          </div>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs"
              onClick={markAllRead}
              disabled={unreadCount === 0}
            >
              <CheckCheck className="mr-1 size-3.5" />
              Read all
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs"
              onClick={clearAll}
              disabled={notifications.length === 0}
            >
              <Trash2 className="mr-1 size-3.5" />
              Clear
            </Button>
          </div>
        </div>
        <ScrollArea className="max-h-[min(24rem,60vh)]">
          {notifications.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              No notifications yet — results will appear here as analyzers
              report.
            </p>
          ) : (
            <>
              <Section
                title="Review requests"
                items={openReviews}
                onOpen={openNotification}
                onAcknowledge={(item) => markRead(item.id)}
              />
              <Section
                title="Critical"
                items={unreadCritical}
                onOpen={openNotification}
              />
              <Section title="Today" items={today} onOpen={openNotification} />
              <Section
                title="Earlier"
                items={earlier}
                onOpen={openNotification}
              />
            </>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

export function NotificationToastStack() {
  const navigate = useNavigate();
  const { pendingToasts, dismissToast, markRead } = useNotifications();

  useEffect(() => {
    if (!pendingToasts.length) return;
    const timers = pendingToasts.map((t) =>
      window.setTimeout(() => dismissToast(t.id), 8000),
    );
    return () => timers.forEach(clearTimeout);
  }, [pendingToasts, dismissToast]);

  if (!pendingToasts.length) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2">
      {pendingToasts.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto overflow-hidden rounded-lg border border-lab-alarm bg-lab-alarm text-white shadow-lg shadow-lab-alarm/40"
        >
          <div className="flex items-start gap-2 px-3 py-2.5">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <button
              type="button"
              className="min-w-0 flex-1 text-left"
              onClick={() => {
                markRead(toast.id);
                dismissToast(toast.id);
                void navigate({
                  to: "/bench",
                  search: {
                    analyzer: toast.analyzerId,
                    q: toast.accessionNumber,
                  },
                });
              }}
            >
              <p className="text-sm font-bold">{toast.title}</p>
              <p className="mt-0.5 text-xs text-white/90">{toast.body}</p>
            </button>
            <button
              type="button"
              className="shrink-0 rounded p-0.5 hover:bg-white/15"
              aria-label="Dismiss"
              onClick={() => dismissToast(toast.id)}
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
