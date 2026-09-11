import { Link } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { Copy, ExternalLink, X } from "lucide-react";
import {
  missingManualResultRequirements,
  normalizeCode,
  type MissingExpectedResult,
} from "@drax-lis/catalog";
import type { BenchWorkQueueRow, WorkQueueTestItem } from "../lib/bench-work-queue";
import type { BenchResult } from "../lib/api";
import { toCompletenessResultsForAccession } from "../lib/bench-work-queue";
import { manualAccessionAccess } from "../lib/manual-results";
import { WorkQueueTestList } from "./bench-work-queue-tests";
import { ManualResultEntryButton } from "./manual-result-entry";
import { SpecimenAccessionStatusChip } from "./result-status";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { ScrollContainer } from "./ui/scroll-container";
import { SheetCloseButton } from "./ui/sheet";
import { cn } from "../lib/utils";

type Props = {
  row: BenchWorkQueueRow | null;
  results: BenchResult[];
  onClose?: () => void;
  embedded?: boolean;
  className?: string;
};

function CopyAccessionButton({ accessionNumber }: { accessionNumber: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-7 gap-1 px-2 text-xs"
      onClick={() => {
        void navigator.clipboard.writeText(accessionNumber).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      <Copy className="size-3.5" aria-hidden />
      {copied ? "Copied" : "Copy accession"}
    </Button>
  );
}

function ManualAccessBadge({
  access,
}: {
  access: "submitted" | "released";
}) {
  return (
    <Badge variant={access === "released" ? "muted" : "warn"}>
      {access === "released"
        ? "Not resulted before release"
        : "Locked while awaiting authorization"}
    </Badge>
  );
}

function groupPendingManualByTest(
  items: MissingExpectedResult[],
): Map<string, MissingExpectedResult[]> {
  const map = new Map<string, MissingExpectedResult[]>();
  for (const item of items) {
    const key = normalizeCode(item.orderedTestCode);
    const bucket = map.get(key);
    if (bucket) bucket.push(item);
    else map.set(key, [item]);
  }
  return map;
}

export function BenchWorkQueueDetail({
  row,
  results,
  onClose,
  embedded,
  className,
}: Props) {
  const accessionResults = useMemo(
    () =>
      row
        ? results.filter((r) => r.accessionNumber === row.accessionNumber)
        : [],
    [results, row],
  );

  const pendingManual = useMemo(() => {
    if (!row) return [];
    const orderedCodes = row.tests.map((t) => t.code);
    return missingManualResultRequirements(
      orderedCodes,
      toCompletenessResultsForAccession(results, row.accessionNumber),
    );
  }, [row, results]);

  const manualAccess = useMemo(
    () => manualAccessionAccess(accessionResults),
    [accessionResults],
  );

  const pendingManualByTest = useMemo(
    () => groupPendingManualByTest(pendingManual),
    [pendingManual],
  );

  const renderTestActions = useCallback(
    (test: WorkQueueTestItem) => {
      if (!row) return null;

      const components =
        pendingManualByTest.get(normalizeCode(test.code)) ?? [];
      if (components.length === 0) return null;

      const showHybridHint =
        test.status === "awaiting_instrument" &&
        components.some((item) => item.workflow === "hybrid");

      if (manualAccess !== "editable") {
        return (
          <div className="space-y-1.5">
            {showHybridHint ? (
              <p className="text-xs text-muted-foreground">
                Manual component available
              </p>
            ) : null}
            <ManualAccessBadge access={manualAccess} />
          </div>
        );
      }

      return (
        <div className="space-y-2">
          {showHybridHint ? (
            <p className="text-xs font-medium text-amber-900 dark:text-amber-200">
              Manual entry available — instrument result not required first
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            {components.map((item) => (
              <ManualResultEntryButton
                key={`${item.orderedTestCode}-${item.componentCode}`}
                accessionNumber={row.accessionNumber}
                testCode={item.orderedTestCode}
                testName={item.orderedTestName}
                resultComponentCode={item.componentCode}
                resultComponentName={item.componentName}
                siblingManualCount={components.length}
              />
            ))}
          </div>
        </div>
      );
    },
    [row, pendingManualByTest, manualAccess],
  );

  if (!row) {
    return (
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center",
          className,
        )}
      >
        <p className="font-medium text-foreground">Select an accession</p>
        <p className="mt-1 max-w-xs text-sm text-muted-foreground">
          Choose an accession from the list to see tubes and pending tests.
        </p>
      </div>
    );
  }

  const pendingCount = row.tests.length - row.receivedCount;

  return (
    <div
      className={cn(
        "flex min-h-0 min-w-0 flex-col overflow-hidden bg-card",
        embedded
          ? "h-full min-h-0 flex-1 rounded-none border-0 shadow-none"
          : "rounded-xl border border-border shadow-sm",
        className,
      )}
    >
      <div
        className={cn(
          "shrink-0 border-b border-border",
          embedded ? "px-4 pb-3 pt-2 sm:px-5" : "px-4 py-3 sm:px-5",
        )}
      >
        {embedded ? (
          <div
            className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted-foreground/35"
            aria-hidden
          />
        ) : null}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="font-mono text-base font-bold tracking-tight text-foreground">
              {row.accessionNumber}
            </p>
            <p className="truncate text-sm text-foreground">
              {row.patientDisplayName}
              {row.patientMrn ? (
                <span className="text-muted-foreground">
                  {" "}
                  · {row.patientMrn}
                </span>
              ) : null}
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              <SpecimenAccessionStatusChip
                status={row.status}
                className="text-[10px]"
              />
              <span className="text-xs tabular-nums text-muted-foreground">
                {pendingCount > 0
                  ? `${pendingCount} pending · ${row.receivedCount} received`
                  : `${row.receivedCount}/${row.tests.length} received`}
              </span>
            </div>
          </div>
          {embedded ? (
            <SheetCloseButton className="-mr-1 -mt-1 shrink-0" />
          ) : onClose ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 shrink-0"
              onClick={onClose}
              aria-label="Close detail"
            >
              <X className="size-4" aria-hidden />
            </Button>
          ) : null}
        </div>
      </div>

      <ScrollContainer className="min-h-0 flex-1 px-4 py-4 sm:px-5">
        <div className="space-y-5">
          {row.tubes.length > 0 ? (
            <section>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Tubes ({row.tubes.length})
              </p>
              <ul className="flex flex-wrap gap-2">
                {row.tubes.map((tube) => (
                  <li
                    key={tube.specimenId}
                    className="rounded-lg border border-border bg-muted/30 px-2.5 py-1.5"
                  >
                    <span className="block font-mono text-xs font-medium text-foreground">
                      {tube.specimenId}
                    </span>
                    <span className="block text-[11px] text-muted-foreground">
                      {tube.departmentLabel}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section>
            <WorkQueueTestList
              tests={row.tests}
              renderTestActions={renderTestActions}
            />
          </section>

          <p className="text-xs text-muted-foreground">
            Registered {new Date(row.registeredAt).toLocaleString()}
            {row.collectedByName ? ` · Collector: ${row.collectedByName}` : ""}
          </p>
        </div>
      </ScrollContainer>

      <div className="flex shrink-0 flex-wrap gap-2 border-t border-border bg-muted/20 px-4 py-2.5 sm:px-5">
        <CopyAccessionButton accessionNumber={row.accessionNumber} />
        <Button type="button" variant="outline" size="sm" className="h-7 text-xs" asChild>
          <Link to="/labels" search={{ accession: row.accessionNumber }}>
            Reprint labels
          </Link>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 gap-1 text-xs"
          asChild
        >
          <Link to="/orders" search={{ accession: row.accessionNumber }}>
            Test lookup
            <ExternalLink className="size-3" aria-hidden />
          </Link>
        </Button>
      </div>
    </div>
  );
}
