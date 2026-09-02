import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { io, type Socket } from "socket.io-client";
import {
  BenchEventSchema,
  type BenchEvent,
  type BenchIngestItem,
} from "@drax-lis/contracts";
import { api, getWsBaseUrl, type ReviewRequest } from "./api";
import { analyzerLabel } from "./analyzers";
import { canAuthorize, useAuth } from "./auth";

export type NotificationSeverity = "critical" | "alarm" | "info";
export type NotificationType = "result" | "specimen" | "review";

/**
 * `local` items come from the analyzer socket and live in localStorage.
 * `review` items are rows on the server, so their read state is the
 * acknowledgement and must not be faked client-side.
 */
export type NotificationSource = "local" | "review";

export type AppNotification = {
  id: string;
  type: NotificationType;
  source: NotificationSource;
  severity: NotificationSeverity;
  title: string;
  body: string;
  at: string;
  read: boolean;
  accessionNumber?: string;
  analyzerId?: string;
  testCode?: string;
  flag?: string;
  reviewRequestId?: string;
  canAcknowledge?: boolean;
};

const STORAGE_KEY = "lis-notifications";
const MAX_ITEMS = 100;

type NotificationState = {
  notifications: AppNotification[];
  unreadCount: number;
  /** Unread items that warrant the escalated, pulsing bell. */
  criticalCount: number;
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
      source: "local" as const,
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
    source: "local",
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

function notificationFromReviewRequest(
  row: ReviewRequest,
  canAcknowledge: boolean,
): AppNotification {
  const patient = row.patientDisplayName ?? row.accessionNumbers.join(", ");
  const flag = row.worstFlag ?? "";
  const who = row.requestedByEmail ? ` · from ${row.requestedByEmail}` : "";
  const detail = row.note
    ? `“${row.note}”`
    : `${row.resultCount} result${row.resultCount === 1 ? "" : "s"} awaiting sign-off`;

  return {
    id: `review-${row.id}`,
    type: "review",
    source: "review",
    severity: severityFromFlag(flag),
    title: `Review requested${flag && flag !== "normal" ? ` · ${flagLabel(flag)}` : ""}`,
    body: `${patient} — ${detail}${who}`,
    at: row.requestedAt,
    read: Boolean(row.acknowledgedAt),
    accessionNumber: row.accessionNumbers[0],
    flag: flag || undefined,
    reviewRequestId: row.id,
    canAcknowledge,
  };
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const auth = useAuth();
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

  // Review requests are cross-user, so they cannot come from localStorage.
  // Polled rather than pushed: the cloud API has no socket, and the release
  // queue already polls on the same cadence.
  const canAcknowledge = canAuthorize(auth.role);
  const { data: reviewRequests } = useQuery({
    queryKey: ["review-requests"],
    queryFn: () => api.listReviewRequests(),
    enabled: Boolean(auth.accessToken),
    refetchInterval: 15_000,
  });

  const acknowledge = useMutation({
    mutationFn: (id: string) => api.acknowledgeReviewRequest(id),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["review-requests"] });
    },
  });

  const reviewNotifications = useMemo(
    () =>
      (reviewRequests ?? []).map((row) =>
        notificationFromReviewRequest(row, canAcknowledge),
      ),
    [reviewRequests, canAcknowledge],
  );

  const merged = useMemo(
    () =>
      [...reviewNotifications, ...notifications].sort((a, b) =>
        b.at.localeCompare(a.at),
      ),
    [reviewNotifications, notifications],
  );

  const markRead = useCallback(
    (id: string) => {
      const item = merged.find((n) => n.id === id);
      // A review request's read state is the server-side acknowledgement, so
      // only a reviewer can clear it, and only through the API.
      if (item?.source === "review") {
        if (item.reviewRequestId && item.canAcknowledge && !item.read) {
          acknowledge.mutate(item.reviewRequestId);
        }
        return;
      }
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
      );
    },
    [merged, acknowledge],
  );

  const markAllRead = useCallback(() => {
    // Local feed only. Bulk-clearing review requests would sign off work the
    // authorizer has not looked at, so each one needs its own acknowledgement.
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const clearAll = useCallback(() => {
    // Only the local feed is clearable: a review request is a work item, not a
    // message, and hiding it would lose the sign-off.
    setNotifications([]);
    setPendingToasts([]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setPendingToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // A tech cannot acknowledge, so their own pending request would otherwise
  // leave the bell pulsing with no way to clear it — alarm fatigue by design.
  // It still appears in the list, just not as an unread demand for action.
  const actionable = useCallback(
    (n: AppNotification) =>
      !n.read && (n.source !== "review" || Boolean(n.canAcknowledge)),
    [],
  );

  const unreadCount = useMemo(
    () => merged.filter(actionable).length,
    [merged, actionable],
  );

  const criticalCount = useMemo(
    () =>
      merged.filter(
        (n) =>
          actionable(n) &&
          (n.severity === "critical" || n.severity === "alarm"),
      ).length,
    [merged, actionable],
  );

  const value: NotificationState = {
    notifications: merged,
    unreadCount,
    criticalCount,
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
