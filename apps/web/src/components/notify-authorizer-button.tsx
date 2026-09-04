import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, Check, Loader2 } from "lucide-react";
import {
  NotifyAuthorizerFormSchema,
  type NotifyAuthorizerFormValues,
} from "@drax-lis/contracts";
import { api, type ReviewRequest } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { cn } from "../lib/utils";
import { flagLabel } from "./result-status";
import type { BenchGroupSummary } from "./bench-group-row";
import {
  FormCharCount,
  FormErrorSummary,
  FormField,
} from "./forms/form-field";

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

  const signedIn = Boolean(auth.accessToken);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<NotifyAuthorizerFormValues>({
    resolver: zodResolver(NotifyAuthorizerFormSchema),
    defaultValues: { note: "" },
    mode: "onBlur",
    reValidateMode: "onChange",
  });

  const note = watch("note");

  // Shares the cache with the notification store's poll, so no extra traffic.
  const { data: requests } = useQuery({
    queryKey: ["review-requests"],
    queryFn: () => api.listReviewRequests(),
    enabled: signedIn,
    refetchInterval: 15_000,
  });

  const existing = findOpenRequest(requests, summary.accessionNumbers);

  const create = useMutation({
    mutationFn: (values: NotifyAuthorizerFormValues) => {
      const parsed = NotifyAuthorizerFormSchema.parse(values);
      return api.createReviewRequest({
        accessionNumbers: summary.accessionNumbers,
        patientDisplayName:
          summary.patient?.displayName ?? summary.fallbackLabel,
        patientMrn: summary.patient?.mrn,
        worstFlag: summary.worstFlag as never,
        testCodes: summary.testCodes,
        resultCount: summary.testCount,
        note: parsed.note || undefined,
      });
    },
    onSuccess: () => {
      setOpen(false);
      reset({ note: "" });
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
        title={`Sign-off requested ${new Date(existing.requestedAt).toLocaleString()} — waiting for review`}
      >
        <Check className="size-3.5" aria-hidden />
        Sign-off requested
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
        title="Sign in to request sign-off"
      >
        <BellRing className="mr-1.5 size-3.5" aria-hidden />
        Notify
      </Button>
    );
  }

  const patientLabel = summary.patient?.displayName ?? summary.fallbackLabel;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset({ note: "" });
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(fullWidth && "h-11 w-full", className)}
          aria-label={`Request sign-off for ${patientLabel}`}
        >
          <BellRing className="mr-1.5 size-3.5" aria-hidden />
          Notify
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-3">
        <p className="text-sm font-semibold">Request sign-off</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Alerts everyone who can sign off on results, in the app and by email.
        </p>

        <dl className="mt-3 space-y-1 rounded-lg bg-muted/60 p-2 text-xs">
          <div className="flex gap-2">
            <dt className="w-20 shrink-0 text-muted-foreground">Patient</dt>
            <dd className="min-w-0 font-medium">{patientLabel}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-20 shrink-0 text-muted-foreground">Sample ID</dt>
            <dd className="min-w-0 break-words font-mono">
              {summary.accessionNumbers.join(", ")}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-20 shrink-0 text-muted-foreground">Results</dt>
            <dd>
              {summary.testCount}
              {summary.worstFlag && summary.worstFlag !== "normal"
                ? ` · ${flagLabel(summary.worstFlag).toLowerCase()} result`
                : ""}
            </dd>
          </div>
        </dl>

        <form
          className="mt-3 space-y-3"
          noValidate
          onSubmit={handleSubmit((values) => create.mutate(values))}
        >
          <FormField
            label="Note (optional)"
            htmlFor="notify-note"
            error={errors.note}
          >
            <Input
              id="notify-note"
              placeholder="e.g. repeat confirms the critical potassium"
              maxLength={500}
              aria-invalid={Boolean(errors.note)}
              {...register("note")}
            />
            <FormCharCount value={note} max={500} />
          </FormField>

          <FormErrorSummary
            message={
              create.isError
                ? "Could not send the alert. Try again in a moment."
                : null
            }
          />

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={create.isPending || isSubmitting}
            >
              {create.isPending && (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden />
              )}
              Send alert
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
