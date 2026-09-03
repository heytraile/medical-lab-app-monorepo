import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button } from "./ui/button";

type Props = {
  className?: string;
};

/**
 * When the release queue is empty, explain the two-step workflow and show
 * where results might be stuck (edge bench vs sync outbox vs cloud pending_review).
 */
export function ReleaseQueueEmptyState({ className }: Props) {
  const auth = useAuth();
  const qc = useQueryClient();

  const syncQ = useQuery({
    queryKey: ["syncStatus"],
    queryFn: () => api.syncStatus(),
    refetchInterval: 5_000,
  });

  const pendingReviewQ = useQuery({
    queryKey: ["cloud-results", "pending_review"],
    queryFn: () => api.cloudResults("pending_review"),
    enabled: auth.ready && Boolean(auth.accessToken),
    refetchInterval: 10_000,
    retry: (count, err) =>
      count < 2 && !(err instanceof ApiError && err.status === 401),
  });

  const drainM = useMutation({
    mutationFn: () => api.drainSync(),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["syncStatus"] });
      void qc.invalidateQueries({ queryKey: ["cloud-results"] });
      void qc.invalidateQueries({ queryKey: ["release-queue"] });
    },
  });

  const syncPending = syncQ.data?.pending ?? 0;
  const syncFailed = syncQ.data?.failed ?? 0;
  const cloudPendingReview = pendingReviewQ.data?.length ?? 0;

  return (
    <div
      className={
        className ??
        "rounded-xl border border-border bg-card px-4 py-8 text-center shadow-sm"
      }
    >
      <p className="text-sm font-medium text-foreground">
        No results awaiting authorization
      </p>
      <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
        Bench techs must click{" "}
        <strong className="font-medium text-foreground">Submit for release</strong>{" "}
        on the Bench after reviewing results. That moves them from{" "}
        <code className="text-xs">pending_review</code> to{" "}
        <code className="text-xs">pending_authorization</code> here.
      </p>

      <ul className="mx-auto mt-4 max-w-md space-y-2 text-left text-sm text-muted-foreground">
        <li>
          <span className="font-medium text-foreground">Edge outbox pending:</span>{" "}
          {syncQ.isLoading ? "…" : syncPending}
          {syncPending > 0 && (
            <span className="block text-xs">
              Events waiting to reach cloud — open{" "}
              <Link to="/sync" className="text-accent underline-offset-2 hover:underline">
                Sync
              </Link>{" "}
              and drain.
            </span>
          )}
        </li>
        <li>
          <span className="font-medium text-foreground">
            Cloud pending_review (not submitted):
          </span>{" "}
          {pendingReviewQ.isLoading ? "…" : cloudPendingReview}
          {cloudPendingReview > 0 && (
            <span className="block text-xs">
              Synced to cloud but not submitted from Bench yet.
            </span>
          )}
        </li>
        {syncFailed > 0 && (
          <li className="text-lab-danger">
            <span className="font-medium">Sync failed:</span> {syncFailed} — check
            edge logs and cloud API.
          </li>
        )}
      </ul>

      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
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
          Drain sync now
        </Button>
        <Button type="button" variant="ghost" size="sm" asChild>
          <Link to="/bench">Go to Bench</Link>
        </Button>
        <Button type="button" variant="ghost" size="sm" asChild>
          <Link to="/sync">Sync status</Link>
        </Button>
      </div>

      {drainM.isError && (
        <p className="mt-3 text-xs text-lab-danger">
          {drainM.error instanceof ApiError
            ? drainM.error.message
            : "Drain failed"}
        </p>
      )}
    </div>
  );
}
