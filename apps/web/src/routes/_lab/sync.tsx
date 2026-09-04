import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw } from "lucide-react";
import { api, ApiError } from "../../lib/api";
import { Button } from "../../components/ui/button";
import { cn } from "../../lib/utils";

export const Route = createFileRoute("/_lab/sync")({
  component: SyncPage,
});

function formatCount(n: number | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString();
}

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

  const needsAttention =
    (data?.pending ?? 0) > 0 || (data?.failed ?? 0) > 0;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Connectivity
        </p>
        <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
          Connection
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          These numbers count <strong>sync messages</strong> on this lab
          computer (a send queue to the central system). They are{" "}
          <strong>not</strong> a count of patients, tests, or rows in the cloud
          database.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          If work looks stuck after you submit results, try{" "}
          <strong>Send now</strong>.
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
            Send now
          </Button>
          {drainM.isError && (
            <p className="mt-2 text-xs text-lab-danger">
              {drainM.error instanceof ApiError
                ? drainM.error.message
                : "Could not send — try again in a moment."}
            </p>
          )}
        </div>
      </div>

      {isLoading && (
        <p className="text-muted-foreground">Loading connection status…</p>
      )}
      {error && (
        <p className="text-sm text-lab-danger">
          Could not load connection status.
        </p>
      )}

      {data && (
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Needs attention
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div
                className={cn(
                  "rounded-xl border p-5 shadow-sm",
                  needsAttention && (data.pending ?? 0) > 0
                    ? "border-amber-500/40 bg-amber-500/10"
                    : "border-border bg-card",
                )}
              >
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Waiting to send now
                </p>
                <p className="mt-1 text-3xl font-semibold text-foreground sm:text-4xl">
                  {formatCount(data.pending)}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Sync messages not yet accepted by the central system.
                </p>
              </div>
              <div
                className={cn(
                  "rounded-xl border p-5 shadow-sm",
                  (data.failed ?? 0) > 0
                    ? "border-lab-danger/40 bg-lab-danger/10"
                    : "border-border bg-card",
                )}
              >
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Could not send
                </p>
                <p className="mt-1 text-3xl font-semibold text-foreground sm:text-4xl">
                  {formatCount(data.failed)}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Last send attempt failed — try Send now.
                </p>
              </div>
            </div>
          </div>

          {(data.syncing ?? 0) > 0 && (
            <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Sending now
              </p>
              <p className="mt-1 text-xl font-semibold text-foreground">
                {formatCount(data.syncing)}
              </p>
            </div>
          )}

          <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-3">
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                Sent (recent sync messages):{" "}
              </span>
              {formatCount(data.acked)}
              <span className="ml-1">
                — successfully delivered since the last cleanup. Old send-log
                rows are removed automatically; this is not your test or patient
                count.
              </span>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
