import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2 } from "lucide-react";
import type { UnidentifiedAcknowledgeReason } from "@drax-lis/contracts";
import { api, ApiError, type UnidentifiedRawMessage } from "../lib/api";
import { analyzerLabel } from "../lib/analyzers";
import { useAuth } from "../lib/auth";
import { formatUnidentifiedAnalytes } from "../lib/unidentified-results";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

function formatReceivedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export function UnidentifiedResultsBanner({
  className,
}: {
  className?: string;
}) {
  const auth = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const listQ = useQuery({
    queryKey: ["unidentified-results"],
    queryFn: () => api.unidentifiedResults(),
    enabled: auth.ready,
    refetchInterval: 15_000,
  });

  const items = listQ.data ?? [];
  const count = items.length;

  const ackM = useMutation({
    mutationFn: (input: {
      id: string;
      reason: UnidentifiedAcknowledgeReason;
    }) => api.acknowledgeUnidentifiedResult(input.id, input.reason),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["unidentified-results"] });
    },
  });

  if (!auth.ready || count === 0) return null;

  return (
    <>
      <div
        className={cn(
          "rounded-md border border-lab-alarm/50 bg-lab-alarm/10 px-3 py-2 text-sm",
          className,
        )}
        role="alert"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="flex items-center gap-1.5 font-medium text-lab-alarm">
              <AlertTriangle className="size-4 shrink-0" aria-hidden />
              {count} result{count === 1 ? "" : "s"} missing specimen ID
            </p>
            <p className="text-xs/relaxed text-foreground/80">
              Re-run on the instrument with the tube label scanned or entered.
              Do not assign a specimen ID in the LIS.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="shrink-0 border-lab-alarm/40"
            onClick={() => setOpen(true)}
          >
            View unidentified
          </Button>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Unidentified instrument results</DialogTitle>
            <DialogDescription>
              These values arrived with no specimen ID. Re-run the sample on the
              instrument when possible. If the sample cannot be re-run, discard
              as not reportable and accession a new draw if the test is still
              needed. There is no way to attach these results to a patient here.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 px-5 py-4">
            {items.map((row) => (
              <UnidentifiedRow
                key={row.id}
                row={row}
                pending={ackM.isPending && ackM.variables?.id === row.id}
                error={
                  ackM.isError && ackM.variables?.id === row.id
                    ? ackM.error instanceof ApiError
                      ? ackM.error.message
                      : "Could not acknowledge."
                    : null
                }
                onAcknowledge={(reason) =>
                  ackM.mutate({ id: row.id, reason })
                }
              />
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function UnidentifiedRow({
  row,
  pending,
  error,
  onAcknowledge,
}: {
  row: UnidentifiedRawMessage;
  pending: boolean;
  error: string | null;
  onAcknowledge: (reason: UnidentifiedAcknowledgeReason) => void;
}) {
  const values = formatUnidentifiedAnalytes(row.items);

  return (
    <div className="rounded-md border border-border bg-muted/30 px-3 py-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium">
          {analyzerLabel(row.analyzerId)}
        </p>
        <p className="text-xs text-muted-foreground">
          {formatReceivedAt(row.receivedAt)}
        </p>
      </div>
      <p className="mt-1 font-mono text-xs text-foreground">{values}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={pending}
          onClick={() => onAcknowledge("rerun_completed")}
        >
          {pending ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : null}
          Re-run completed
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => onAcknowledge("discarded_not_reportable")}
        >
          Discarded — not reportable
        </Button>
      </div>
      {error ? (
        <p className="mt-1.5 text-xs text-lab-danger">{error}</p>
      ) : null}
    </div>
  );
}
