import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, RefreshCw, Send } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button } from "./ui/button";
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

  const submit = useMutation({
    mutationFn: () =>
      api.submitResults({
        accessionNumbers: summary.accessionNumbers,
      }),
    onSuccess: async () => {
      setError(null);
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
          onClick={() => submit.mutate()}
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
        onClick={() => submit.mutate()}
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
    </div>
  );
}
