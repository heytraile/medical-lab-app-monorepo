import { useDeferredValue, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { api, type BenchPatientSummary, type BenchResult } from "../../lib/api";
import { analyzerLabel } from "../../lib/analyzers";
import { useDebouncedValue } from "../../lib/use-debounced-value";
import { BenchPatientPanel } from "../../components/bench-patient-panel";
import {
  FlagChip,
  WorkflowStatusChip,
  flagRowClass,
  flagValueClass,
  isAlarmFlag,
} from "../../components/result-status";
import { Badge } from "../../components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { cn } from "../../lib/utils";

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

  const { data = [], isLoading, error, isFetching } = useQuery({
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
      columnHelper.accessor("observedAt", {
        header: ({ column }) => (
          <SortHeader label="Observed" column={column} />
        ),
        cell: (info) => (
          <span className="whitespace-nowrap text-xs text-muted-foreground">
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
      columnHelper.accessor((row) => row.patient?.displayName ?? "", {
        id: "patient",
        header: ({ column }) => (
          <SortHeader label="Patient" column={column} />
        ),
        cell: (info) => (
          <PatientCell
            patient={info.row.original.patient}
            selected={
              info.row.original.patient?.id === selectedPatientId
            }
            onSelect={(id) => setSelectedPatientId(id)}
          />
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
          <span className={flagValueClass(info.row.original.flag)}>
            {info.getValue()}
          </span>
        ),
      }),
      columnHelper.accessor("units", {
        header: "Units",
        cell: (info) => (
          <span className="text-muted-foreground">
            {info.getValue() ?? "—"}
          </span>
        ),
        enableSorting: false,
      }),
      columnHelper.accessor("flag", {
        header: ({ column }) => <SortHeader label="Flag" column={column} />,
        cell: (info) => <FlagChip flag={info.getValue()} />,
      }),
      columnHelper.accessor("status", {
        header: ({ column }) => <SortHeader label="Status" column={column} />,
        cell: (info) => (
          <WorkflowStatusChip
            status={info.getValue() ?? "pending_review"}
            onAlarm={isAlarmFlag(info.row.original.flag)}
          />
        ),
      }),
    ],
    [selectedPatientId],
  );

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const title = analyzer ? analyzerLabel(analyzer) : "All machines";
  const split = Boolean(selectedPatientId);

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
          <h2 className="font-display text-3xl font-semibold tracking-tight text-foreground">
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
            : `${filtered.length} of ${data.length} rows`}
        </span>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabFilter)}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="pending">Pending review</TabsTrigger>
          <TabsTrigger value="flagged">Flagged</TabsTrigger>
        </TabsList>
      </Tabs>

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
        <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table
              className={cn(
                "w-full text-left text-sm",
                split ? "min-w-[52rem]" : "min-w-[880px]",
              )}
            >
              <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
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
                {table.getRowModel().rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={columns.length}
                      className="px-3 py-12 text-center text-muted-foreground"
                    >
                      No results for this view. Run a simulator or clear
                      filters.
                    </td>
                  </tr>
                ) : (
                  table.getRowModel().rows.map((row) => {
                    const isSelected =
                      row.original.patient?.id === selectedPatientId;
                    return (
                      <tr
                        key={row.id}
                        className={cn(
                          "border-t border-border/60 transition-colors",
                          !isAlarmFlag(row.original.flag) && "hover:bg-muted/35",
                          flagRowClass(row.original.flag),
                          isSelected &&
                            !isAlarmFlag(row.original.flag) &&
                            "bg-accent/10 ring-1 ring-inset ring-accent/20",
                          isSelected &&
                            isAlarmFlag(row.original.flag) &&
                            "ring-2 ring-inset ring-white/50",
                          q &&
                            row.original.accessionNumber
                              .toLowerCase()
                              .includes((q ?? "").toLowerCase()) &&
                            !isSelected &&
                            !isAlarmFlag(row.original.flag) &&
                            "bg-accent/5",
                        )}
                      >
                        {row.getVisibleCells().map((cell) => (
                          <td
                            key={cell.id}
                            className="px-3 py-2.5 align-middle"
                          >
                            {flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext(),
                            )}
                          </td>
                        ))}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {selectedPatientId && (
          <BenchPatientPanel
            patientId={selectedPatientId}
            summary={selectedSummary}
            results={selectedResults}
            onClose={() => setSelectedPatientId(null)}
          />
        )}
      </div>
    </div>
  );
}

function PatientCell({
  patient,
  selected,
  onSelect,
}: {
  patient: BenchPatientSummary | null | undefined;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  if (!patient) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <div className="min-w-0 max-w-[14rem]">
      <button
        type="button"
        className={cn(
          "block max-w-full truncate text-left font-medium underline-offset-2 hover:underline",
          selected ? "text-accent" : "text-foreground",
        )}
        onClick={() => onSelect(patient.id)}
      >
        {patient.displayName}
      </button>
      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
        <span className="font-mono text-[11px] tracking-tight text-muted-foreground">
          {patient.mrn}
        </span>
        {patient.identityOrigin === "local_provisional" && (
          <Badge variant="warn" className="px-1 py-0 text-[10px]">
            Provisional
          </Badge>
        )}
        {patient.status === "quarantined" && (
          <Badge variant="danger" className="px-1 py-0 text-[10px]">
            Quarantined
          </Badge>
        )}
      </div>
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
