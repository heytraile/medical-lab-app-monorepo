import { Link } from "@tanstack/react-router";
import type { BenchWorkQueueRow } from "../lib/bench-work-queue";
import { analyzerLabel } from "../lib/analyzers";
import { Button } from "./ui/button";
import { ScrollContainer } from "./ui/scroll-container";
import { SpecimenAccessionStatusChip } from "./result-status";
import { cn } from "../lib/utils";

type Props = {
  rows: BenchWorkQueueRow[];
  selectedAccession: string | null;
  onSelectRow: (row: BenchWorkQueueRow) => void;
  isLoading?: boolean;
  analyzerFilter?: string;
  className?: string;
};

function WorkQueueListRow({
  row,
  active,
  onSelect,
}: {
  row: BenchWorkQueueRow;
  active: boolean;
  onSelect: () => void;
}) {
  const pendingCount = row.tests.length - row.receivedCount;
  const pendingPreview = row.tests
    .filter((t) => t.status !== "received")
    .slice(0, 3)
    .map((t) => t.code);

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? "true" : undefined}
        className={cn(
          "flex w-full flex-col items-start gap-1 border-l-2 px-3 py-3 text-left text-sm transition-colors lg:py-2.5",
          active
            ? "border-l-accent bg-accent/10"
            : "border-l-transparent hover:bg-muted/50",
        )}
      >
        <span className="flex w-full items-start justify-between gap-2">
          <span
            className={cn(
              "font-mono text-sm font-bold tracking-tight",
              active ? "text-accent" : "text-foreground",
            )}
          >
            {row.accessionNumber}
          </span>
          <SpecimenAccessionStatusChip
            status={row.status}
            className="shrink-0 text-[10px]"
          />
        </span>
        <span className="w-full truncate font-medium text-foreground">
          {row.patientDisplayName}
          {row.patientMrn ? (
            <span className="font-normal text-muted-foreground">
              {" "}
              · {row.patientMrn}
            </span>
          ) : null}
        </span>
        <span className="text-xs tabular-nums text-muted-foreground">
          {pendingCount > 0
            ? `${pendingCount} pending · ${row.receivedCount} received`
            : `${row.receivedCount}/${row.tests.length} received`}
          {row.tubes.length > 0
            ? ` · ${row.tubes.length} tube${row.tubes.length === 1 ? "" : "s"}`
            : ""}
        </span>
        {pendingPreview.length > 0 ? (
          <span className="line-clamp-1 text-xs text-muted-foreground">
            {pendingPreview.join(", ")}
            {pendingCount > pendingPreview.length
              ? ` +${pendingCount - pendingPreview.length}`
              : ""}
          </span>
        ) : null}
      </button>
    </li>
  );
}

export function BenchWorkQueue({
  rows,
  selectedAccession,
  onSelectRow,
  isLoading,
  analyzerFilter,
  className,
}: Props) {
  if (isLoading) {
    return (
      <div
        className={cn(
          "rounded-xl border border-border bg-card px-4 py-12 text-center text-sm text-muted-foreground",
          className,
        )}
      >
        Loading work queue…
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div
        className={cn(
          "space-y-3 rounded-xl border border-border bg-card px-4 py-12 text-center",
          className,
        )}
      >
        <p className="font-medium text-foreground">No accessions awaiting run</p>
        <p className="mx-auto max-w-md text-sm text-muted-foreground">
          {analyzerFilter
            ? `Nothing pending for ${analyzerLabel(analyzerFilter)} with incomplete instrument work.`
            : "Registered accessions appear here until expected instrument and manual results are received."}
        </p>
        <Button type="button" variant="outline" size="sm" asChild>
          <Link to="/orders">Open Test lookup</Link>
        </Button>
      </div>
    );
  }

  return (
    <ScrollContainer
      className={cn(
        "min-h-0 flex-1 basis-0 rounded-xl border border-border bg-card",
        className,
      )}
    >
      <ul className="divide-y divide-border">
        {rows.map((row) => (
          <WorkQueueListRow
            key={row.session.key}
            row={row}
            active={
              selectedAccession?.toUpperCase() ===
              row.accessionNumber.toUpperCase()
            }
            onSelect={() => onSelectRow(row)}
          />
        ))}
      </ul>
    </ScrollContainer>
  );
}
