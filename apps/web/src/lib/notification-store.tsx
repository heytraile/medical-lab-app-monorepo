import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { io, type Socket } from "socket.io-client";
import {
  BenchEventSchema,
  type BenchEvent,
  type BenchIngestItem,
} from "@drax-lis/contracts";
import { getWsBaseUrl } from "./api";
import { analyzerLabel } from "./analyzers";

export type NotificationSeverity = "critical" | "alarm" | "info";
export type NotificationType = "result" | "specimen";

export type AppNotification = {
  id: string;
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  body: string;
  at: string;
  read: boolean;
  accessionNumber?: string;
  analyzerId?: string;
  testCode?: string;
  flag?: string;
};

const STORAGE_KEY = "lis-notifications";
const MAX_ITEMS = 100;

type NotificationState = {
  notifications: AppNotification[];
  unreadCount: number;
  markRead: (id: string) => void;
  markAllRead: () => void;
  clearAll: () => void;
  /** Critical toasts surfaced for auto-dismiss UI */
  pendingToasts: AppNotification[];
  dismissToast: (id: string) => void;
};

const NotificationContext = createContext<NotificationState | null>(null);

function loadStored(): AppNotification[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AppNotification[];
    return Array.isArray(parsed) ? parsed.slice(0, MAX_ITEMS) : [];
  } catch {
    return [];
  }
}

function persist(items: AppNotification[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
}

function severityFromFlag(flag: string): NotificationSeverity {
  if (flag === "critical_high" || flag === "critical_low") return "critical";
  if (flag === "high") return "alarm";
  return "info";
}

function flagLabel(flag: string): string {
  return flag.replaceAll("_", " ");
}

function formatResultBody(item: BenchIngestItem): string {
  const units = item.units ? ` ${item.units}` : "";
  return `${item.testCode} ${item.value}${units} · ${flagLabel(item.flag)}`;
}

function notificationsFromIngest(event: Extract<BenchEvent, { type: "results.ingested" }>): AppNotification[] {
  const analyzer = analyzerLabel(String(event.analyzerId));
  const patient = event.patientDisplayName;
  const prefix = patient ? `${patient} · ` : "";

  return event.items.map((item) => {
    const severity = severityFromFlag(String(item.flag));
    const kindLabel = item.kind === "escalated" ? "Escalated" : "New result";
    return {
      id: `${event.at}-${item.id}-${item.kind}`,
      type: "result" as const,
      severity,
      title: `${kindLabel} · ${analyzer}`,
      body: `${prefix}${event.accessionNumber} — ${formatResultBody(item)}`,
      at: event.at,
      read: false,
      accessionNumber: event.accessionNumber,
      analyzerId: String(event.analyzerId),
      testCode: item.testCode,
      flag: String(item.flag),
    };
  });
}

function notificationFromSpecimen(
  event: Extract<BenchEvent, { type: "specimen.registered" }>,
): AppNotification {
  const patient = event.patientName ? `${event.patientName} · ` : "";
  return {
    id: `${event.at}-specimen-${event.accessionNumber}`,
    type: "specimen",
    severity: "info",
    title: "Specimen registered",
    body: `${patient}${event.accessionNumber}`,
    at: event.at,
    read: false,
    accessionNumber: event.accessionNumber,
  };
}

function pushFromBenchEvent(
  prev: AppNotification[],
  event: BenchEvent,
): { items: AppNotification[]; toasts: AppNotification[] } {
  let incoming: AppNotification[] = [];
  if (event.type === "results.ingested") {
    incoming = notificationsFromIngest(event);
  } else if (event.type === "specimen.registered") {
    incoming = [notificationFromSpecimen(event)];
  }

  if (!incoming.length) return { items: prev, toasts: [] };

  const existingIds = new Set(prev.map((n) => n.id));
  const novel = incoming.filter((n) => !existingIds.has(n.id));
  if (!novel.length) return { items: prev, toasts: [] };

  const merged = [...novel, ...prev].slice(0, MAX_ITEMS);
  const toasts = novel.filter((n) => n.severity === "critical");
  return { items: merged, toasts };
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [notifications, setNotifications] = useState<AppNotification[]>(() =>
    loadStored(),
  );
  const [pendingToasts, setPendingToasts] = useState<AppNotification[]>([]);

  useEffect(() => {
    persist(notifications);
  }, [notifications]);

  const handleBenchEvent = useCallback(
    (payload: unknown) => {
      const parsed = BenchEventSchema.safeParse(payload);
      if (parsed.success) {
        setNotifications((prev) => {
          const { items, toasts } = pushFromBenchEvent(prev, parsed.data);
          if (toasts.length) {
            setPendingToasts((t) => [...toasts, ...t].slice(0, 3));
          }
          return items;
        });
      }

      void queryClient.invalidateQueries({ queryKey: ["results"] });
      void queryClient.invalidateQueries({ queryKey: ["specimens"] });
      void queryClient.invalidateQueries({ queryKey: ["syncStatus"] });
      void queryClient.invalidateQueries({ queryKey: ["analyzers-status"] });
    },
    [queryClient],
  );

  useEffect(() => {
    let socket: Socket | null = io(`${getWsBaseUrl()}/bench`, {
      transports: ["websocket", "polling"],
    });
    socket.on("bench.event", handleBenchEvent);
    return () => {
      socket?.off("bench.event", handleBenchEvent);
      socket?.disconnect();
      socket = null;
    };
  }, [handleBenchEvent]);

  const markRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
    setPendingToasts([]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setPendingToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications],
  );

  const value: NotificationState = {
    notifications,
    unreadCount,
    markRead,
    markAllRead,
    clearAll,
    pendingToasts,
    dismissToast,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error("useNotifications must be used within NotificationProvider");
  }
  return ctx;
}
