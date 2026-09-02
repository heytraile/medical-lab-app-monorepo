import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, Check, Loader2 } from "lucide-react";
import { api, type ReviewRequest } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button } from "./ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { cn } from "../lib/utils";
import type { BenchGroupSummary } from "./bench-group-row";

/** True when an open request already covers every accession in this group. */
function findOpenRequest(
  requests: ReviewRequest[] | undefined,
  accessionNumbers: string[],
): ReviewRequest | undefined {
  return requests?.find(
    (r) =>
      !r.acknowledgedAt &&
      accessionNumbers.every((a) => r.accessionNumbers.includes(a)),
  );
}

export function NotifyAuthorizerButton({
  summary,
  className,
  fullWidth,
}: {
  summary: BenchGroupSummary;
  className?: string;
  /** Phone cards give this a full-width, thumb-sized target. */
  fullWidth?: boolean;
}) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");

  const signedIn = Boolean(auth.accessToken);

  // Shares the cache with the notification store's poll, so no extra traffic.
  const { data: requests } = useQuery({
    queryKey: ["review-requests"],
    queryFn: () => api.listReviewRequests(),
    enabled: signedIn,
    refetchInterval: 15_000,
  });

  const existing = findOpenRequest(requests, summary.accessionNumbers);

  const create = useMutation({
    mutationFn: () =>
      api.createReviewRequest({
        accessionNumbers: summary.accessionNumbers,
        patientDisplayName:
          summary.patient?.displayName ?? summary.fallbackLabel,
        patientMrn: summary.patient?.mrn,
        worstFlag: summary.worstFlag as never,
        testCodes: summary.testCodes,
        resultCount: summary.testCount,
        note: note.trim() || undefined,
      }),
    onSuccess: () => {
      setOpen(false);
      setNote("");
      void queryClient.invalidateQueries({ queryKey: ["review-requests"] });
    },
  });

  if (existing) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border border-lab-ok/40 bg-lab-ok/10 px-2 py-1 text-xs font-medium text-lab-ok",
          fullWidth && "h-11 w-full justify-center text-sm",
          className,
        )}
        title={`Authorizer notified ${new Date(existing.requestedAt).toLocaleString()} — waiting for sign-off`}
      >
        <Check className="size-3.5" aria-hidden />
        Authorizer notified
      </span>
    );
  }

  if (!signedIn) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled
        className={cn(fullWidth && "h-11 w-full", className)}
        title="Sign in to notify an authorizer"
      >
        <BellRing className="mr-1.5 size-3.5" aria-hidden />
        Notify
      </Button>
    );
  }

  const patientLabel = summary.patient?.displayName ?? summary.fallbackLabel;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(fullWidth && "h-11 w-full", className)}
          aria-label={`Notify an authorizer about ${patientLabel}`}
        >
          <BellRing className="mr-1.5 size-3.5" aria-hidden />
          Notify
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-3">
        <p className="text-sm font-semibold">Notify an authorizer</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Goes to every authorizer and admin, in-app and by email.
        </p>

        <dl className="mt-3 space-y-1 rounded-lg bg-muted/60 p-2 text-xs">
          <div className="flex gap-2">
            <dt className="w-20 shrink-0 text-muted-foreground">Patient</dt>
            <dd className="min-w-0 font-medium">{patientLabel}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-20 shrink-0 text-muted-foreground">Accession</dt>
            <dd className="min-w-0 break-words font-mono">
              {summary.accessionNumbers.join(", ")}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-20 shrink-0 text-muted-foreground">Results</dt>
            <dd>
              {summary.testCount}
              {summary.worstFlag && summary.worstFlag !== "normal"
                ? ` · worst flag ${summary.worstFlag.replaceAll("_", " ")}`
                : ""}
            </dd>
          </div>
        </dl>

        <label className="mt-3 block text-xs font-medium" htmlFor="notify-note">
          Note (optional)
        </label>
        <input
          id="notify-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          placeholder="e.g. repeat confirms the critical potassium"
          className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />

        {create.isError && (
          <p className="mt-2 text-xs text-lab-danger">
            Could not send. Is the cloud API running on :3102?
          </p>
        )}

        <div className="mt-3 flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => create.mutate()}
            disabled={create.isPending}
          >
            {create.isPending && (
              <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden />
            )}
            Send alert
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
