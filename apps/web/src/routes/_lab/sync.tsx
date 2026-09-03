import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw } from "lucide-react";
import { api, ApiError } from "../../lib/api";
import { Button } from "../../components/ui/button";

export const Route = createFileRoute("/_lab/sync")({
  component: SyncPage,
});

function SyncPage() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["syncStatus"],
    queryFn: () => api.syncStatus(),
    refetchInterval: 5_000,
  });

  const drainM = useMutation({
    mutationFn: () => api.drainSync(),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["syncStatus"] });
      void qc.invalidateQueries({ queryKey: ["cloud-results"] });
      void qc.invalidateQueries({ queryKey: ["release-queue"] });
    },
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
          drain when the cloud API is reachable. After bench submit, use{" "}
          <strong>Drain now</strong> if the release queue is still empty.
        </p>
        <div className="mt-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={drainM.isPending}
            onClick={() => drainM.mutate()}
          >
            {drainM.isPending ? (
              <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="mr-1.5 size-3.5" aria-hidden />
            )}
            Drain now
          </Button>
          {drainM.isError && (
            <p className="mt-2 text-xs text-lab-danger">
              {drainM.error instanceof ApiError
                ? drainM.error.message
                : "Drain failed"}
            </p>
          )}
        </div>
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
