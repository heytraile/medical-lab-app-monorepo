import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { api, type BenchResult } from "../../lib/api";

export const Route = createFileRoute("/_lab/bench")({
  component: BenchPage,
});

const columnHelper = createColumnHelper<BenchResult>();

const columns = [
  columnHelper.accessor("observedAt", {
    header: "Observed",
    cell: (info) => new Date(info.getValue()).toLocaleString(),
  }),
  columnHelper.accessor("accessionNumber", { header: "Accession" }),
  columnHelper.accessor("analyzerId", { header: "Analyzer" }),
  columnHelper.accessor("testCode", { header: "Test" }),
  columnHelper.accessor("value", { header: "Value" }),
  columnHelper.accessor("units", {
    header: "Units",
    cell: (info) => info.getValue() ?? "—",
  }),
  columnHelper.accessor("flag", { header: "Flag" }),
];

function BenchPage() {
  const { data = [], isLoading, error, isFetching } = useQuery({
    queryKey: ["results"],
    queryFn: () => api.results(),
    refetchInterval: 10_000,
  });

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-lab-navy">Live Bench Review</h2>
          <p className="text-sm text-slate-600">
            Results from local edge ingest. WebSocket invalidates this table when
            analyzers report.
          </p>
        </div>
        <span className="text-xs text-slate-500">
          {isFetching ? "Refreshing…" : `${data.length} rows`}
        </span>
      </div>

      {isLoading && <p className="text-slate-500">Loading results…</p>}
      {error && (
        <p className="text-lab-danger text-sm">
          Could not reach edge API. Is <code>edge-engine</code> running on :3101?
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => (
                  <th key={h.id} className="px-3 py-2 font-medium">
                    {flexRender(h.column.columnDef.header, h.getContext())}
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
                  className="px-3 py-8 text-center text-slate-400"
                >
                  No results yet. Run a simulator or POST to /ingest.
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-3 py-2">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
