import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Undo2 } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button } from "./ui/button";
import { cn } from "../lib/utils";
import type { BenchGroupSummary } from "./bench-group-row";
import { ConfirmAccessionActionDialog } from "./confirm-accession-action-dialog";

export function RecallFromReleaseButton({
  summary,
  className,
  fullWidth,
}: {
  summary: BenchGroupSummary;
  className?: string;
  fullWidth?: boolean;
}) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recall = useMutation({
    mutationFn: () =>
      api.recallResults({ accessionNumbers: summary.accessionNumbers }),
    onSuccess: async () => {
      setError(null);
      setDialogOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["results"] });
      void queryClient.invalidateQueries({ queryKey: ["cloud-results"] });
      void queryClient.invalidateQueries({ queryKey: ["release-queue"] });
      void queryClient.invalidateQueries({ queryKey: ["syncStatus"] });
      void queryClient.invalidateQueries({
        queryKey: ["patient-report-summary"],
      });
      try {
        await api.drainSync();
        void queryClient.invalidateQueries({ queryKey: ["cloud-results"] });
        void queryClient.invalidateQueries({ queryKey: ["release-queue"] });
        void queryClient.invalidateQueries({ queryKey: ["syncStatus"] });
      } catch {
        // Cron will retry; Sync page has manual drain
      }
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Recall failed");
      }
    },
  });

  if (!auth.accessToken) return null;
  if (summary.allReleased) return null;
  if (!(summary.submittedCount > 0 && summary.pendingCount === 0)) return null;

  return (
    <>
      <div className={cn("flex flex-col gap-1", fullWidth && "w-full")}>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(
            "border-amber-500/40 text-amber-900 hover:bg-amber-500/10 dark:text-amber-200",
            fullWidth && "h-11 w-full",
            className,
          )}
          disabled={recall.isPending}
          onClick={() => setDialogOpen(true)}
        >
          {recall.isPending ? (
            <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden />
          ) : (
            <Undo2 className="mr-1.5 size-3.5" aria-hidden />
          )}
          Recall from release queue
        </Button>
        {error ? <p className="text-xs text-lab-danger">{error}</p> : null}
      </div>

      <ConfirmAccessionActionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="Recall from release queue?"
        description="This removes the patient from the sign-off queue and returns all tests to the bench for another look. You can fix issues and submit again. Nothing is sent to the doctor."
        confirmLabel="Recall to bench"
        pending={recall.isPending}
        onConfirm={() => recall.mutate()}
      />
    </>
  );
}
