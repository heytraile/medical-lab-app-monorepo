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
    {
      key: "pending",
      label: "Pending",
      className: "border-amber-500/30 bg-amber-500/10",
    },
    {
      key: "syncing",
      label: "Syncing",
      className: "border-sky-500/30 bg-sky-500/10",
    },
    {
      key: "acked",
      label: "Acked (cloud)",
      className: "border-emerald-500/30 bg-emerald-500/10",
    },
    {
      key: "failed",
      label: "Failed",
      className: "border-lab-danger/30 bg-lab-danger/10",
    },
  ] as const;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Connectivity
        </p>
        <h2 className="font-display text-2xl font-semibold sm:text-3xl tracking-tight">
          Store-and-Forward Sync
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Edge outbox queue. Offline events stay <strong>pending</strong> and
          drain when the cloud API is reachable.
        </p>
      </div>

      {isLoading && <p className="text-muted-foreground">Loading sync status…</p>}
      {error && (
        <p className="text-sm text-lab-danger">Could not load sync status.</p>
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {cards.map((c) => (
          <div
            key={c.key}
            className={`rounded-xl border p-4 shadow-sm ${c.className}`}
          >
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {c.label}
            </p>
            <p className="mt-1 text-2xl font-semibold sm:text-3xl text-foreground">
              {data?.[c.key] ?? "—"}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
