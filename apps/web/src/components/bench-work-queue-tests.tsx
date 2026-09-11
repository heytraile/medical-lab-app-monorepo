import { useMemo, type ReactNode } from "react";
import {
  Check,
  FlaskConical,
  Hand,
  Send,
} from "lucide-react";
import type {
  WorkQueueTestItem,
  WorkQueueTestStatus,
} from "../lib/bench-work-queue";
import { analyzerLabel } from "../lib/analyzers";
import { Badge } from "./ui/badge";
import { cn } from "../lib/utils";

const TEST_STATUS_META: Record<
  WorkQueueTestStatus,
  {
    label: string;
    badgeVariant: "default" | "warn" | "muted" | "ok";
    accent: string;
    surface: string;
    Icon: typeof FlaskConical;
  }
> = {
  awaiting_instrument: {
    label: "Awaiting instrument",
    badgeVariant: "default",
    accent: "border-l-sky-500",
    surface: "bg-sky-500/[0.06] dark:bg-sky-500/10",
    Icon: FlaskConical,
  },
  awaiting_manual: {
    label: "Awaiting manual",
    badgeVariant: "warn",
    accent: "border-l-amber-500",
    surface: "bg-amber-500/[0.06] dark:bg-amber-500/10",
    Icon: Hand,
  },
  received: {
    label: "Received",
    badgeVariant: "ok",
    accent: "border-l-emerald-500/70",
    surface: "bg-muted/40",
    Icon: Check,
  },
  send_out: {
    label: "Send-out",
    badgeVariant: "muted",
    accent: "border-l-violet-500/70",
    surface: "bg-violet-500/[0.05] dark:bg-violet-500/10",
    Icon: Send,
  },
};

export function WorkQueueTestStatusBadge({
  status,
}: {
  status: WorkQueueTestStatus;
}) {
  const meta = TEST_STATUS_META[status];
  const Icon = meta.Icon;
  return (
    <Badge
      variant={meta.badgeVariant}
      className="shrink-0 gap-1 whitespace-nowrap text-[10px]"
    >
      <Icon className="size-3" aria-hidden />
      {meta.label}
    </Badge>
  );
}

export function WorkQueueTestCard({
  test,
  trailing,
}: {
  test: WorkQueueTestItem;
  trailing?: ReactNode;
}) {
  const meta = TEST_STATUS_META[test.status];
  const pending = test.status !== "received";

  return (
    <li
      className={cn(
        "overflow-hidden rounded-lg border border-border border-l-[3px] shadow-sm",
        meta.accent,
        meta.surface,
        !pending && "opacity-80",
      )}
    >
      <div className="flex items-start justify-between gap-3 px-3 py-2.5 sm:px-3.5">
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="font-mono text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {test.code}
          </p>
          <p
            className={cn(
              "text-sm font-semibold leading-snug text-foreground",
              !pending && "font-medium text-muted-foreground",
            )}
          >
            {test.name}
          </p>
          {test.analyzerId && test.status === "awaiting_instrument" ? (
            <p className="pt-0.5 text-xs text-muted-foreground">
              Run on{" "}
              <span className="font-medium text-foreground/90">
                {analyzerLabel(test.analyzerId)}
              </span>
            </p>
          ) : null}
        </div>
        <WorkQueueTestStatusBadge status={test.status} />
      </div>
      {trailing ? (
        <div className="border-t border-amber-500/25 bg-amber-500/[0.12] px-3 py-3 sm:px-3.5 dark:bg-amber-500/10">
          {trailing}
        </div>
      ) : null}
    </li>
  );
}

export function WorkQueueTestList({
  tests,
  renderTestActions,
}: {
  tests: WorkQueueTestItem[];
  renderTestActions?: (test: WorkQueueTestItem) => ReactNode;
}) {
  const { pending, received } = useMemo(() => {
    const pendingItems: WorkQueueTestItem[] = [];
    const receivedItems: WorkQueueTestItem[] = [];
    for (const test of tests) {
      if (test.status === "received") {
        receivedItems.push(test);
      } else {
        pendingItems.push(test);
      }
    }
    return { pending: pendingItems, received: receivedItems };
  }, [tests]);

  if (tests.length === 0) return null;

  return (
    <div className="space-y-3">
      {pending.length > 0 ? (
        <section>
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Needs action
            </p>
            <span className="text-[10px] tabular-nums text-muted-foreground">
              {pending.length} test{pending.length === 1 ? "" : "s"}
            </span>
          </div>
          <ul className="grid gap-2">
            {pending.map((test) => (
              <WorkQueueTestCard
                key={test.code}
                test={test}
                trailing={renderTestActions?.(test)}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {received.length > 0 ? (
        <section>
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Already received
            </p>
            <span className="text-[10px] tabular-nums text-muted-foreground">
              {received.length} test{received.length === 1 ? "" : "s"}
            </span>
          </div>
          <ul className="grid gap-2">
            {received.map((test) => (
              <WorkQueueTestCard key={test.code} test={test} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
