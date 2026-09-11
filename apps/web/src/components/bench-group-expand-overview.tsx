import { useMemo } from "react";
import type { BenchResult, SpecimenRow } from "../lib/api";
import {
  buildGroupPendingOverview,
  groupPendingManualByTest,
} from "../lib/bench-group-pending-overview";
import type { BenchGroupSummary } from "./bench-group-row";
import { WorkQueueTestList } from "./bench-work-queue-tests";
import { WorkQueueManualActions } from "./work-queue-manual-actions";
import { cn } from "../lib/utils";

type Props = {
  summary: BenchGroupSummary;
  results: BenchResult[];
  specimens: SpecimenRow[];
  className?: string;
};

export function BenchGroupExpandOverview({
  summary,
  results,
  specimens,
  className,
}: Props) {
  const accessionOverviews = useMemo(
    () =>
      buildGroupPendingOverview({
        accessionNumbers: summary.accessionNumbers,
        specimens,
        results,
      }),
    [summary.accessionNumbers, specimens, results],
  );

  if (accessionOverviews.length === 0) return null;

  return (
    <div className={cn("space-y-4", className)}>
      {accessionOverviews.map((row) => {
        const pendingManualByTest = groupPendingManualByTest(
          row.manualComponents,
        );
        return (
          <section key={row.accessionNumber}>
            {summary.accessionCount > 1 ? (
              <p className="mb-2 font-mono text-xs font-semibold tracking-tight text-foreground">
                {row.accessionNumber}
              </p>
            ) : null}
            <WorkQueueTestList
              tests={row.pendingTests}
              renderTestActions={(test) => (
                <WorkQueueManualActions
                  accessionNumber={row.accessionNumber}
                  test={test}
                  manualAccess={row.manualAccess}
                  pendingManualByTest={pendingManualByTest}
                />
              )}
            />
          </section>
        );
      })}
    </div>
  );
}
