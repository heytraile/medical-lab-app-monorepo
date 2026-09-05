import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button } from "./ui/button";

type Props = {
  className?: string;
  variant?: "authorization" | "ready";
};

export function ReleaseQueueEmptyState({
  className,
  variant = "authorization",
}: Props) {
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
    enabled: auth.ready && auth.hasCloudSession,
    refetchInterval: 10_000,
    retry: (count, err) =>
      count < 2 && !(err instanceof ApiError && err.status === 401),
  });

  const refreshM = useMutation({
    mutationFn: () => api.drainSync(),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["syncStatus"] });
      void qc.invalidateQueries({ queryKey: ["cloud-results"] });
      void qc.invalidateQueries({ queryKey: ["release-queue"] });
    },
  });

  const waitingToSend = syncQ.data?.pending ?? 0;
  const sendFailed = syncQ.data?.failed ?? 0;
  const notYetSubmitted = pendingReviewQ.data?.length ?? 0;
  const isReadyTab = variant === "ready";

  return (
    <div
      className={
        className ??
        "rounded-xl border border-border bg-card px-4 py-8 text-center shadow-sm"
      }
    >
      <p className="text-sm font-medium text-foreground">
        {isReadyTab
          ? "No reports waiting to be sent"
          : "Nothing waiting for your sign-off"}
      </p>
      <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
        {isReadyTab ? (
          <>
            After you release results on the Authorization tab, they appear here
            so you can print, download, or email reports. Remove them from this
            list when you are done sending.
          </>
        ) : (
          <>
            When a tech finishes reviewing results on the Bench and submits them
            for release, they will show up here for you to sign off.
          </>
        )}
      </p>

      {!isReadyTab && (waitingToSend > 0 || notYetSubmitted > 0 || sendFailed > 0) && (
        <ul className="mx-auto mt-4 max-w-md space-y-2 text-left text-sm text-muted-foreground">
          {waitingToSend > 0 && (
            <li>
              <span className="font-medium text-foreground">
                Still sending to the lab:
              </span>{" "}
              {waitingToSend} item{waitingToSend === 1 ? "" : "s"} — try{" "}
              <strong className="font-medium text-foreground">Refresh now</strong>{" "}
              below or open{" "}
              <Link to="/sync" className="text-accent underline-offset-2 hover:underline">
                Connection
              </Link>
              .
            </li>
          )}
          {notYetSubmitted > 0 && (
            <li>
              <span className="font-medium text-foreground">
                On the Bench but not submitted yet:
              </span>{" "}
              {notYetSubmitted} result{notYetSubmitted === 1 ? "" : "s"}
            </li>
          )}
          {sendFailed > 0 && (
            <li className="text-lab-danger">
              <span className="font-medium">Could not send:</span> {sendFailed}{" "}
              — ask your administrator if this keeps happening.
            </li>
          )}
        </ul>
      )}

      {isReadyTab && (
        <p className="mx-auto mt-4 max-w-lg text-xs text-muted-foreground">
          Removing someone from this list does not undo the release — it only
          clears your send list. They still appear as Released on the Bench.
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        {!isReadyTab ? (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={refreshM.isPending}
              onClick={() => refreshM.mutate()}
            >
              {refreshM.isPending ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden />
              ) : (
                <RefreshCw className="mr-1.5 size-3.5" aria-hidden />
              )}
              Refresh now
            </Button>
            <Button type="button" variant="ghost" size="sm" asChild>
              <Link to="/bench">Go to Bench</Link>
            </Button>
          </>
        ) : (
          <Button type="button" variant="ghost" size="sm" asChild>
            <Link to="/release">Authorization queue</Link>
          </Button>
        )}
      </div>

      {refreshM.isError && (
        <p className="mt-3 text-xs text-lab-danger">
          {refreshM.error instanceof ApiError
            ? refreshM.error.message
            : "Refresh failed — try again in a moment."}
        </p>
      )}
    </div>
  );
}
