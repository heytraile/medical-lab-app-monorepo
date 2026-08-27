import {
  Fragment,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getGroupedRowModel,
  getSortedRowModel,
  type ExpandedState,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { api, type BenchResult } from "../../lib/api";
import { analyzerLabel } from "../../lib/analyzers";
import { useDebouncedValue } from "../../lib/use-debounced-value";
import { BenchPatientPanel } from "../../components/bench-patient-panel";
import { BenchMobileList } from "../../components/bench-mobile-list";
import { Sheet, SheetContent } from "../../components/ui/sheet";
import { useIsDesktop, useIsWide } from "../../lib/use-media-query";
import {
  BenchGroupRow,
  summarizeGroup,
  type BenchGroupSummary,
} from "../../components/bench-group-row";
import {
  AlarmSign,
  FlagChip,
  WorkflowStatusChip,
  flagBarColor,
  flagRowTint,
  flagValueClass,
} from "../../components/result-status";
import { Button } from "../../components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { cn } from "../../lib/utils";

/** Stable group key — unlinked specimens group by accession, not into one bucket. */
function groupKeyFor(row: BenchResult): string {
  return row.patient?.id ?? `acc:${row.accessionNumber}`;
}

/**
 * Leading bar and focus outline for one nested cell, as inset box-shadows.
 *
 * Inset shadows paint inside the border, so both land inboard of the grey
 * gutter rather than at the table edge. Drawing the outline per cell — top and
 * bottom everywhere, sides only on the end cells — is what lets the focus
 * highlight stop at the inset instead of spanning the full row.
 */
function cellShadow({
  barColor,
  focused,
  first,
  last,
}: {
  barColor: string;
  focused: boolean;
  first: boolean;
  last: boolean;
}): CSSProperties | undefined {
  const shadows: string[] = [];
  if (first) shadows.push(`inset 3px 0 0 0 ${barColor}`);
  if (focused) {
    const accent = "var(--color-accent, #0d9488)";
    shadows.push(`inset 0 2px 0 0 ${accent}`, `inset 0 -2px 0 0 ${accent}`);
    if (first) shadows.push(`inset 2px 0 0 0 ${accent}`);
    if (last) shadows.push(`inset -2px 0 0 0 ${accent}`);
  }
  return shadows.length ? { boxShadow: shadows.join(", ") } : undefined;
}

type BenchSearch = {
  analyzer?: string;
  q?: string;
};

export const Route = createFileRoute("/_lab/bench")({
  validateSearch: (search: Record<string, unknown>): BenchSearch => ({
    analyzer:
      typeof search.analyzer === "string" && search.analyzer
        ? search.analyzer
        : undefined,
    q: typeof search.q === "string" && search.q ? search.q : undefined,
  }),
  component: BenchPage,
});

const columnHelper = createColumnHelper<BenchResult>();

/**
 * Must be module-level constants, not inline literals.
 *
 * getGroupedRowModel memoizes on `[state.grouping, preGroupedRowModel]` by
 * reference. A fresh array each render busts that memo, which re-runs grouping
 * every render and triggers TanStack's autoReset — an infinite render loop that
 * also wipes the expanded state.
 */
const GROUPING = ["patientGroup"];
const COLUMN_VISIBILITY = { patientGroup: false };
const NO_RESULTS: BenchResult[] = [];

type TabFilter = "all" | "pending" | "flagged";

function BenchPage() {
  const { analyzer, q } = Route.useSearch();
  const [tab, setTab] = useState<TabFilter>("all");
  const [sorting, setSorting] = useState<SortingState>([
    { id: "observedAt", desc: true },
  ]);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(
    null,
  );
  // Every group starts collapsed and stays that way until the tech opens it;
  // only an active search overrides this (see below).
  const [expanded, setExpanded] = useState<ExpandedState>({});
  // Set by clicking a flag chip; cleared on a timer so the ring fades away.
  const [focusedResultId, setFocusedResultId] = useState<string | null>(null);
  // Typed loosely because the desktop renderer points it at a <tr> and the
  // mobile one at a card element.
  const focusedRowRef = useRef<HTMLElement | null>(null);
  const isDesktop = useIsDesktop();
  const isWide = useIsWide();

  const { data = NO_RESULTS, isLoading, error, isFetching } = useQuery({
    queryKey: ["results"],
    queryFn: () => api.results(),
    refetchInterval: 10_000,
  });

  const debouncedQ = useDebouncedValue(q ?? "", 150);
  const deferredQ = useDeferredValue(debouncedQ.trim().toLowerCase());

  const filtered = useMemo(() => {
    let rows = data;
    if (analyzer) {
      rows = rows.filter((r) => r.analyzerId === analyzer);
    }
    if (deferredQ) {
      rows = rows.filter((r) => {
        const patientHay = r.patient
          ? `${r.patient.displayName} ${r.patient.mrn}`
          : "";
        const hay =
          `${r.accessionNumber} ${r.barcode} ${r.testCode} ${r.value} ${r.flag} ${r.analyzerId} ${patientHay}`.toLowerCase();
        return hay.includes(deferredQ);
      });
    }
    if (tab === "pending") {
      rows = rows.filter(
        (r) => (r.status ?? "pending_review") === "pending_review",
      );
    } else if (tab === "flagged") {
      rows = rows.filter(
        (r) => r.flag && r.flag !== "normal" && r.flag !== "unknown",
      );
    }
    return rows;
  }, [data, analyzer, deferredQ, tab]);

  const groupSummaries = useMemo(() => {
    const byKey = new Map<string, BenchResult[]>();
    for (const r of filtered) {
      const key = groupKeyFor(r);
      const bucket = byKey.get(key);
      if (bucket) bucket.push(r);
      else byKey.set(key, [r]);
    }
    const out = new Map<string, BenchGroupSummary>();
    for (const [key, rows] of byKey) out.set(key, summarizeGroup(key, rows));
    return out;
  }, [filtered]);

  const searching = deferredQ.length > 0;

  // While searching, open everything so a match is never hidden in a collapsed
  // group. Collapse everything again when the query clears.
  useEffect(() => {
    setExpanded(searching ? true : {});
  }, [searching]);

  // The expand and the focus land in one batched render, so the target row is
  // already mounted by the time this runs. scrollIntoView walks up to the
  // scroll pane in _lab.tsx on its own.
  useEffect(() => {
    if (!focusedResultId) return;
    focusedRowRef.current?.scrollIntoView({
      block: "center",
      behavior: "smooth",
    });
    const timer = setTimeout(() => setFocusedResultId(null), 2200);
    return () => clearTimeout(timer);
  }, [focusedResultId]);

  const selectedResults = useMemo(
    () =>
      selectedPatientId
        ? data.filter((r) => r.patient?.id === selectedPatientId)
        : [],
    [data, selectedPatientId],
  );

  const selectedSummary = useMemo(() => {
    if (!selectedPatientId) return null;
    return (
      selectedResults.find((r) => r.patient?.id === selectedPatientId)
        ?.patient ?? null
    );
  }, [selectedPatientId, selectedResults]);

  const columns = useMemo(
    () => [
      // Hidden: drives grouping only. The patient name is rendered once in the
      // group header instead of repeating on every result row.
      columnHelper.accessor(groupKeyFor, {
        id: "patientGroup",
        header: "Patient",
      }),
      columnHelper.accessor("observedAt", {
        header: ({ column }) => (
          <SortHeader label="Observed" column={column} />
        ),
        aggregationFn: "max",
        // One of the three things a tech actually reads, so it sits at body
        // size rather than the muted 12px it used to be.
        cell: (info) => (
          <span className="whitespace-nowrap text-sm font-medium tabular-nums text-foreground/85">
            {new Date(info.getValue()).toLocaleString()}
          </span>
        ),
      }),
      columnHelper.accessor("accessionNumber", {
        header: ({ column }) => (
          <SortHeader label="Accession" column={column} />
        ),
        cell: (info) => (
          <span className="font-mono text-xs tracking-tight">
            {info.getValue()}
          </span>
        ),
      }),
      columnHelper.accessor("analyzerId", {
        header: ({ column }) => (
          <SortHeader label="Analyzer" column={column} />
        ),
        cell: (info) => (
          <span className="text-muted-foreground">
            {analyzerLabel(info.getValue())}
          </span>
        ),
      }),
      columnHelper.accessor("testCode", {
        header: ({ column }) => <SortHeader label="Test" column={column} />,
        cell: (info) => (
          <span className="font-medium">{info.getValue()}</span>
        ),
      }),
      columnHelper.accessor("value", {
        header: ({ column }) => <SortHeader label="Value" column={column} />,
        cell: (info) => (
          <span
            className={cn(
              "text-base font-semibold tabular-nums",
              flagValueClass(info.row.original.flag),
            )}
          >
            {info.getValue()}
          </span>
        ),
      }),
      columnHelper.accessor("units", {
        header: "Units",
        // A value is meaningless without its unit, so the unit tracks the
        // value's prominence rather than fading into the muted column text.
        cell: (info) => (
          <span className="text-sm font-medium text-muted-foreground">
            {info.getValue() ?? "—"}
          </span>
        ),
        enableSorting: false,
      }),
      columnHelper.accessor("flag", {
        header: ({ column }) => <SortHeader label="Flag" column={column} />,
        cell: (info) => (
          <span className="inline-flex items-center gap-1.5">
            <AlarmSign flag={info.getValue()} />
            <FlagChip flag={info.getValue()} />
          </span>
        ),
      }),
      columnHelper.accessor("status", {
        header: ({ column }) => <SortHeader label="Status" column={column} />,
        cell: (info) => (
          <WorkflowStatusChip status={info.getValue() ?? "pending_review"} />
        ),
      }),
    ],
    [],
  );

  const table = useReactTable({
    data: filtered,
    columns,
    state: {
      sorting,
      expanded,
      grouping: GROUPING,
      columnVisibility: COLUMN_VISIBILITY,
    },
    onSortingChange: setSorting,
    onExpandedChange: setExpanded,
    // The 10s refetch replaces `data` wholesale. Without this, TanStack would
    // collapse every group the tech had opened on each poll.
    autoResetExpanded: false,
    getCoreRowModel: getCoreRowModel(),
    getGroupedRowModel: getGroupedRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
  });

  const visibleColumnCount = table.getVisibleLeafColumns().length;
  const allExpanded = table.getIsAllRowsExpanded();

  const title = analyzer ? analyzerLabel(analyzer) : "All machines";
  const split = Boolean(selectedPatientId);

  // Each patient renders as a white block on a grey canvas, so rows need to
  // know where they sit inside their block. The row model is a flat list with
  // group headers interleaved, hence the lookahead and the running counters.
  const modelRows = table.getRowModel().rows;
  const isLastInBlock = modelRows.map((_, i) => {
    const next = modelRows[i + 1];
    return !next || next.getIsGrouped();
  });
  let leafIndex = 0;
  let groupIndex = 0;

  return (
    <div
      className={cn(
        "space-y-5",
        split ? "mx-auto w-full max-w-none" : "mx-auto w-full max-w-6xl",
      )}
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Bench Review
          </p>
          <h2 className="font-display text-2xl font-semibold sm:text-3xl tracking-tight text-foreground">
            {title}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Live results from edge ingest
            {q ? ` · filter “${q}”` : ""}.
            {split ? " Click a patient name to focus; Esc closes." : ""}
          </p>
        </div>
        <span className="text-xs text-muted-foreground">
          {isFetching
            ? "Refreshing…"
            : `${groupSummaries.size} ${
                groupSummaries.size === 1 ? "patient" : "patients"
              } · ${filtered.length} of ${data.length} results`}
        </span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={tab} onValueChange={(v) => setTab(v as TabFilter)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="pending">Pending review</TabsTrigger>
            <TabsTrigger value="flagged">Flagged</TabsTrigger>
          </TabsList>
        </Tabs>
        {groupSummaries.size > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => table.toggleAllRowsExpanded(!allExpanded)}
          >
            {allExpanded ? "Collapse all" : "Expand all"}
          </Button>
        )}
      </div>

      {isLoading && <p className="text-muted-foreground">Loading results…</p>}
      {error && (
        <p className="text-sm text-lab-danger">
          Could not reach edge API. Is <code>edge-engine</code> running on
          :3101?
        </p>
      )}

      <div
        className={cn(
          "gap-4",
          split &&
            "grid grid-cols-1 xl:grid-cols-[minmax(0,1.35fr)_minmax(22rem,0.9fr)]",
        )}
      >
        {!isDesktop ? (
          modelRows.length === 0 ? (
            <p className="rounded-xl border border-border bg-card px-3 py-12 text-center text-muted-foreground">
              No results for this view. Run a simulator or clear filters.
            </p>
          ) : (
            <BenchMobileList
              rows={modelRows}
              groupSummaries={groupSummaries}
              selectedPatientId={selectedPatientId}
              focusedResultId={focusedResultId}
              focusedRef={focusedRowRef}
              onSelectPatient={setSelectedPatientId}
              onToggleGroup={(row) => row.toggleExpanded()}
              onJumpToFlag={(row, summary) => {
                row.toggleExpanded(true);
                const target = row.subRows.find(
                  (sr) => sr.original.flag === summary.worstFlag,
                );
                setFocusedResultId(target?.original.id ?? null);
              }}
            />
          )
        ) : (
        /* Grey canvas: the gaps between patient blocks are this showing through. */
        <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-muted shadow-sm">
          <div className="overflow-x-auto">
            <table
              className={cn(
                "w-full text-left text-sm",
                split ? "min-w-[52rem]" : "min-w-[880px]",
              )}
            >
              <thead className="border-b border-border bg-muted text-xs uppercase tracking-wider text-muted-foreground">
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id}>
                    {hg.headers.map((h) => (
                      <th key={h.id} className="px-3 py-2.5 font-medium">
                        {h.isPlaceholder
                          ? null
                          : flexRender(
                              h.column.columnDef.header,
                              h.getContext(),
                            )}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {modelRows.length === 0 ? (
                  <tr className="bg-card">
                    <td
                      colSpan={visibleColumnCount}
                      className="px-3 py-12 text-center text-muted-foreground"
                    >
                      No results for this view. Run a simulator or clear
                      filters.
                    </td>
                  </tr>
                ) : (
                  modelRows.map((row, i) => {
                    if (row.getIsGrouped()) {
                      const summary = groupSummaries.get(String(row.groupingValue));
                      if (!summary) return null;
                      // Stripes restart per patient so the first test under
                      // every name reads the same way.
                      leafIndex = 0;
                      const blockIndex = groupIndex++;
                      const isOpen = row.getIsExpanded();
                      return (
                        <Fragment key={row.id}>
                          {/* The real gap between patient blocks. */}
                          {blockIndex > 0 && (
                            <tr aria-hidden>
                              <td colSpan={visibleColumnCount} className="h-4 p-0" />
                            </tr>
                          )}
                          <BenchGroupRow
                            summary={summary}
                            colSpan={visibleColumnCount}
                            expanded={isOpen}
                            alternate={blockIndex % 2 === 1}
                            selected={
                              summary.patient?.id != null &&
                              summary.patient.id === selectedPatientId
                            }
                            onToggle={row.getToggleExpandedHandler()}
                            onSelectPatient={setSelectedPatientId}
                            onJumpToFlag={() => {
                              row.toggleExpanded(true);
                              // subRows are already in the table's sort order,
                              // so "first" is the first one the tech will see.
                              const target = row.subRows.find(
                                (sr) => sr.original.flag === summary.worstFlag,
                              );
                              setFocusedResultId(target?.original.id ?? null);
                            }}
                          />
                        </Fragment>
                      );
                    }
                    const striped = leafIndex++ % 2 === 1;
                    const isFocused = row.original.id === focusedResultId;
                    const cells = row.getVisibleCells();
                    // Leaf rows only exist for expanded groups, so every one of
                    // them belongs to an open block and is tinted blue. Order
                    // matters: cn() is twMerge, so a later bg-* wins and the
                    // alarm tint stays on top of the blue.
                    const cellBg = cn(
                      striped
                        ? "bg-sky-100 dark:bg-sky-900/40"
                        : "bg-sky-50 dark:bg-sky-950/60",
                      flagRowTint(row.original.flag),
                      q &&
                        row.original.accessionNumber
                          .toLowerCase()
                          .includes((q ?? "").toLowerCase()) &&
                        "bg-accent/15",
                    );
                    return (
                      // The background lives on the cells, not here: a <tr>
                      // always paints the full table width, which would defeat
                      // the inset. Hover therefore has to reach the cells too.
                      <tr
                        key={row.id}
                        ref={
                          isFocused
                            ? (focusedRowRef as React.Ref<HTMLTableRowElement>)
                            : undefined
                        }
                        className="[&:hover>td]:bg-sky-200 dark:[&:hover>td]:bg-sky-900/70"
                      >
                        {cells.map((cell, ci) => {
                          const isLastCell = ci === cells.length - 1;
                          return (
                            <td
                              key={cell.id}
                              className={cn(
                                "px-3 py-3 align-middle transition-[background-color,box-shadow] duration-300",
                                cellBg,
                                // Hairline between tests; a full rule closes
                                // the block.
                                isLastInBlock[i]
                                  ? "border-b border-border"
                                  : "border-b border-border/40",
                                // The inset gutters. Opaque canvas-coloured
                                // borders that the cell background cannot
                                // paint over.
                                ci === 0 && "border-l-[1.75rem] border-l-muted",
                                isLastCell && "border-r-4 border-r-muted",
                              )}
                              style={cellShadow({
                                barColor: flagBarColor(row.original.flag),
                                focused: isFocused,
                                first: ci === 0,
                                last: isLastCell,
                              })}
                            >
                              {flexRender(
                                cell.column.columnDef.cell,
                                cell.getContext(),
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
        )}

        {/* Docked beside the table only when there is room for both; below lg
            it would otherwise strand the panel under a long list. */}
        {selectedPatientId && isWide && (
          <BenchPatientPanel
            patientId={selectedPatientId}
            summary={selectedSummary}
            results={selectedResults}
            onClose={() => setSelectedPatientId(null)}
          />
        )}
      </div>

      <Sheet
        open={Boolean(selectedPatientId) && !isWide}
        onOpenChange={(open) => !open && setSelectedPatientId(null)}
      >
        <SheetContent side="bottom" label="Patient results" className="p-0">
          {selectedPatientId && (
            <BenchPatientPanel
              patientId={selectedPatientId}
              summary={selectedSummary}
              results={selectedResults}
              onClose={() => setSelectedPatientId(null)}
              embedded
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function SortHeader({
  label,
  column,
}: {
  label: string;
  column: {
    getIsSorted: () => false | "asc" | "desc";
    toggleSorting: (desc?: boolean) => void;
  };
}) {
  const sorted = column.getIsSorted();
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 hover:text-foreground"
      onClick={() => column.toggleSorting(sorted === "asc")}
    >
      {label}
      {sorted === "asc" ? (
        <ArrowUp className="size-3.5" />
      ) : sorted === "desc" ? (
        <ArrowDown className="size-3.5" />
      ) : (
        <ArrowUpDown className="size-3.5 opacity-40" />
      )}
    </button>
  );
}
