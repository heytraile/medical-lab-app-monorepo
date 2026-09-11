import { Link } from "@tanstack/react-router";
import { ChevronRight, PanelRightOpen } from "lucide-react";
import type { BenchWorkQueueRow } from "../lib/bench-work-queue";
import type { BenchResult } from "../lib/api";
import { analyzerLabel } from "../lib/analyzers";
import { BenchWorkQueueDetail } from "./bench-work-queue-detail";
import { Button } from "./ui/button";
import { ScrollContainer } from "./ui/scroll-container";
import { SpecimenAccessionStatusChip } from "./result-status";
import { cn } from "../lib/utils";

type Props = {
  rows: BenchWorkQueueRow[];
  /** Desktop docked panel highlight. */
  selectedAccession: string | null;
  /** Touch inline accordion expand. */
  expandedAccession: string | null;
  onSelectRow: (row: BenchWorkQueueRow) => void;
  onToggleExpand: (row: BenchWorkQueueRow) => void;
  onOpenPanel: (row: BenchWorkQueueRow) => void;
  /** When true, row tap selects for docked split; when false, tap toggles inline expand. */
  dockedDetail?: boolean;
  results: BenchResult[];
  isLoading?: boolean;
  analyzerFilter?: string;
  className?: string;
};

function WorkQueueListRow({
  row,
  dockedActive,
  expanded,
  dockedDetail,
  results,
  onSelect,
  onToggleExpand,
  onOpenPanel,
}: {
  row: BenchWorkQueueRow;
  dockedActive: boolean;
  expanded: boolean;
  dockedDetail: boolean;
  results: BenchResult[];
  onSelect: () => void;
  onToggleExpand: () => void;
  onOpenPanel: () => void;
}) {
  const pendingCount = row.tests.length - row.receivedCount;
  const pendingPreview = row.tests
    .filter((t) => t.status !== "received")
    .slice(0, 3)
    .map((t) => t.code);

  const handleRowActivate = () => {
    if (dockedDetail) onSelect();
    else onToggleExpand();
  };

  return (
    <li>
      <div
        className={cn(
          "border-l-2 transition-colors",
          dockedActive || expanded
            ? "border-l-accent bg-accent/10"
            : "border-l-transparent",
        )}
      >
        <div className="flex items-start gap-1">
          {!dockedDetail ? (
            <button
              type="button"
              onClick={onToggleExpand}
              aria-expanded={expanded}
              aria-label={
                expanded
                  ? `Collapse ${row.accessionNumber}`
                  : `Expand ${row.accessionNumber}`
              }
              className="grid size-10 shrink-0 place-items-center rounded-md"
            >
              <ChevronRight
                className={cn(
                  "size-5 transition-transform",
                  expanded && "rotate-90",
                )}
                strokeWidth={2.5}
                aria-hidden
              />
            </button>
          ) : null}

          <button
            type="button"
            onClick={handleRowActivate}
            aria-current={dockedActive ? "true" : undefined}
            aria-expanded={!dockedDetail ? expanded : undefined}
            className={cn(
              "flex min-w-0 flex-1 flex-col items-start gap-1 px-3 py-3 text-left text-sm transition-colors lg:py-2.5",
              !dockedDetail && "pl-0",
              !dockedActive && !expanded && "hover:bg-muted/50",
            )}
          >
            <span className="flex w-full items-start justify-between gap-2">
              <span
                className={cn(
                  "font-mono text-sm font-bold tracking-tight",
                  dockedActive || expanded ? "text-accent" : "text-foreground",
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

          {!dockedDetail ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mr-2 mt-2 h-8 shrink-0 gap-1 px-2 text-xs text-muted-foreground"
              onClick={(e) => {
                e.stopPropagation();
                onOpenPanel();
              }}
              aria-label={`Open full view for ${row.accessionNumber}`}
            >
              <PanelRightOpen className="size-4" aria-hidden />
              <span className="sr-only sm:not-sr-only">Full view</span>
            </Button>
          ) : null}
        </div>

        {!dockedDetail && expanded ? (
          <BenchWorkQueueDetail
            row={row}
            results={results}
            variant="inline"
          />
        ) : null}
      </div>
    </li>
  );
}

export function BenchWorkQueue({
  rows,
  selectedAccession,
  expandedAccession,
  onSelectRow,
  onToggleExpand,
  onOpenPanel,
  dockedDetail = false,
  results,
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
            dockedActive={
              selectedAccession?.toUpperCase() ===
              row.accessionNumber.toUpperCase()
            }
            expanded={
              expandedAccession?.toUpperCase() ===
              row.accessionNumber.toUpperCase()
            }
            dockedDetail={dockedDetail}
            results={results}
            onSelect={() => onSelectRow(row)}
            onToggleExpand={() => onToggleExpand(row)}
            onOpenPanel={() => onOpenPanel(row)}
          />
        ))}
      </ul>
    </ScrollContainer>
  );
}
