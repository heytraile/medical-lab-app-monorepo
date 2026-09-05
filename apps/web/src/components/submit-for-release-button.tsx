import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Loader2, RefreshCw, Send } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { cn } from "../lib/utils";
import type { BenchGroupSummary } from "./bench-group-row";

export function SubmitForReleaseButton({
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
  const [error, setError] = useState<string | null>(null);
  const [warningOpen, setWarningOpen] = useState(false);

  const submit = useMutation<unknown, Error, boolean>({
    mutationFn: (acknowledgeMissingManual) =>
      api.submitResults({
        accessionNumbers: summary.accessionNumbers,
        acknowledgeMissingManual,
      }),
    onSuccess: async () => {
      setError(null);
      setWarningOpen(false);
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
        setError("Submit failed");
      }
    },
  });

  function requestSubmit() {
    if (summary.missingExpectedCount > 0) {
      setWarningOpen(true);
      return;
    }
    submit.mutate(false);
  }

  const warningDialog = (
    <Dialog open={warningOpen} onOpenChange={setWarningOpen}>
      <DialogContent
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Manual results are still missing</DialogTitle>
          <DialogDescription>
            This order is not complete. Enter the expected observations, or
            explicitly submit it for the authorizer to review.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 px-5 pb-5">
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-900 dark:text-amber-100">
              <AlertTriangle className="size-4" aria-hidden />
              {summary.missingExpectedCount} expected manual{" "}
              {summary.missingExpectedCount === 1 ? "result" : "results"}
            </div>
            <ul className="space-y-2 text-sm">
              {Object.entries(summary.missingExpectedByAccession).flatMap(
                ([accessionNumber, rows]) =>
                  rows.map((row) => (
                    <li
                      key={`${accessionNumber}-${row.orderedTestCode}-${row.componentCode}`}
                    >
                      <span className="font-mono text-xs">
                        {accessionNumber}
                      </span>
                      {" · "}
                      <strong>{row.orderedTestCode}</strong>
                      {row.componentName !== "Manual result"
                        ? ` — ${row.componentName}`
                        : ""}
                      {row.confirmationStatus === "provisional"
                        ? " (provisional mapping)"
                        : ""}
                    </li>
                  )),
              )}
            </ul>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={submit.isPending}
              onClick={() => setWarningOpen(false)}
            >
              Go back and enter results
            </Button>
            <Button
              type="button"
              disabled={submit.isPending}
              onClick={() => submit.mutate(true)}
            >
              {submit.isPending ? "Submitting…" : "Submit anyway"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );

  if (!auth.accessToken) {
    return (
      <Button
        type="button"
        variant="default"
        size="sm"
        disabled
        className={cn(fullWidth && "h-11 w-full", className)}
        title="Sign in to submit results for sign-off"
      >
        <Send className="mr-1.5 size-3.5" aria-hidden />
        Submit for release
      </Button>
    );
  }

  if (summary.allReleased) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border border-lab-ok/40 bg-lab-ok/10 px-2 py-1 text-xs font-medium text-lab-ok",
          fullWidth && "h-11 w-full justify-center text-sm",
          className,
        )}
      >
        <Check className="size-3.5" aria-hidden />
        Released
      </span>
    );
  }

  if (summary.pendingCount === 0 && summary.submittedCount > 0) {
    return (
      <div className={cn("flex flex-col gap-1", fullWidth && "w-full")}>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border border-lab-ok/40 bg-lab-ok/10 px-2 py-1 text-xs font-medium text-lab-ok",
            fullWidth && "h-11 w-full justify-center text-sm",
            className,
          )}
        >
          <Check className="size-3.5" aria-hidden />
          Submitted on bench — waiting for sign-off queue
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(fullWidth && "h-11 w-full", className)}
          disabled={submit.isPending}
          onClick={() => submit.mutate(summary.missingExpectedCount > 0)}
        >
          {submit.isPending ? (
            <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="mr-1.5 size-3.5" aria-hidden />
          )}
          Send to sign-off queue
        </Button>
        {error ? (
          <p className="text-xs text-lab-danger">{error}</p>
        ) : null}
        {warningDialog}
      </div>
    );
  }

  if (summary.pendingCount === 0) {
    return null;
  }

  return (
    <div className={cn("flex flex-col gap-1", fullWidth && "w-full")}>
      <Button
        type="button"
        variant="default"
        size="sm"
        className={cn(fullWidth && "h-11 w-full", className)}
        disabled={submit.isPending}
        onClick={requestSubmit}
      >
        {submit.isPending ? (
          <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden />
        ) : (
          <Send className="mr-1.5 size-3.5" aria-hidden />
        )}
        Submit for release
      </Button>
      {error ? (
        <p className="text-xs text-lab-danger">{error}</p>
      ) : null}
      {warningDialog}
    </div>
  );
}
