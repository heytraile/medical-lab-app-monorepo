import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { isAdmin, useAuth } from "../lib/auth";
import { Button } from "./ui/button";
import { cn } from "../lib/utils";

type BenchAlignmentBannerProps = {
  className?: string;
  /** Compact copy for workstation release queue header. */
  variant?: "default" | "compact";
};

export function BenchAlignmentBanner({
  className,
  variant = "default",
}: BenchAlignmentBannerProps) {
  const auth = useAuth();
  const qc = useQueryClient();
  const enabled = auth.ready && auth.hasCloudSession;

  const alignmentQ = useQuery({
    queryKey: ["bench-alignment"],
    queryFn: () => api.benchCloudAlignment(),
    enabled,
    refetchInterval: 30_000,
    retry: (count, err) =>
      count < 2 && !(err instanceof ApiError && err.status === 401),
  });

  const reconcileM = useMutation({
    mutationFn: () => api.reconcileBenchCloud(),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["bench-alignment"] });
      void qc.invalidateQueries({ queryKey: ["release-queue"] });
      void qc.invalidateQueries({ queryKey: ["cloud-results"] });
    },
  });

  if (!enabled) return null;
  if (alignmentQ.isLoading || !alignmentQ.data) return null;
  if (alignmentQ.data.aligned) return null;

  const { staleReleasedCount, orphanCloudCount, issues } = alignmentQ.data;
  const issueCount = issues.length;
  const canRepair = isAdmin(auth.role);

  return (
    <div
      className={cn(
        "rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="font-medium">
            {variant === "compact"
              ? "Ready queue and Bench are out of sync"
              : "Cloud release queue drifted from the workbench"}
          </p>
          <p className="text-xs/relaxed opacity-90">
            {variant === "compact" ? (
              <>
                {issueCount} stale cloud row{issueCount === 1 ? "" : "s"} from a
                prior edge database — Ready may show accessions the bench does not.
              </>
            ) : (
              <>
                Found {issueCount} mismatched clinical row
                {issueCount === 1 ? "" : "s"} ({staleReleasedCount} stale
                released, {orphanCloudCount} unlinked). This usually happens
                after reseeding edge SQLite without resetting cloud Postgres.
                Ready to send reads cloud; the bench reads edge.
              </>
            )}
          </p>
        </div>
        {canRepair ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="shrink-0 border-amber-600/40 bg-background/80"
            disabled={reconcileM.isPending}
            onClick={() => reconcileM.mutate()}
          >
            {reconcileM.isPending ? (
              <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden />
            ) : null}
            Repair alignment
          </Button>
        ) : null}
      </div>
      {reconcileM.isSuccess ? (
        <p className="mt-2 text-xs text-emerald-800 dark:text-emerald-200">
          Alignment repaired — refresh Ready and Bench if counts still look off.
        </p>
      ) : null}
      {reconcileM.isError ? (
        <p className="mt-2 text-xs text-lab-danger">
          {reconcileM.error instanceof ApiError
            ? reconcileM.error.message
            : "Could not repair alignment."}
        </p>
      ) : null}
    </div>
  );
}
