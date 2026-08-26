import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";

export const Route = createFileRoute("/_lab/sync")({
  component: SyncPage,
});

function SyncPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["syncStatus"],
    queryFn: () => api.syncStatus(),
    refetchInterval: 5_000,
  });

  const cards = [
    { key: "pending", label: "Pending", color: "border-amber-300 bg-amber-50" },
    { key: "syncing", label: "Syncing", color: "border-sky-300 bg-sky-50" },
    { key: "acked", label: "Acked (cloud)", color: "border-green-300 bg-green-50" },
    { key: "failed", label: "Failed", color: "border-red-300 bg-red-50" },
  ] as const;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold text-lab-navy">Store-and-Forward Sync</h2>
        <p className="text-sm text-slate-600">
          Edge outbox queue. While the internet is down, events stay{" "}
          <strong>pending</strong> and drain automatically when the cloud API is
          reachable again.
        </p>
      </div>

      {isLoading && <p className="text-slate-500">Loading sync status…</p>}
      {error && (
        <p className="text-lab-danger text-sm">Could not load sync status.</p>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div
            key={c.key}
            className={`rounded-lg border p-4 shadow-sm ${c.color}`}
          >
            <p className="text-xs uppercase tracking-wide text-slate-600">
              {c.label}
            </p>
            <p className="text-3xl font-semibold text-lab-navy mt-1">
              {data?.[c.key] ?? "—"}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
