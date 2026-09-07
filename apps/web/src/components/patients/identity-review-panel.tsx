import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type IdentityReviewItem } from "../../lib/api";
import { useAuth, isAdmin } from "../../lib/auth";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { cn } from "../../lib/utils";

export function IdentityReviewPanel({
  onOpenPatient,
}: {
  onOpenPatient: (patientId: string) => void;
}) {
  const auth = useAuth();
  const admin = isAdmin(auth.role);
  const qc = useQueryClient();
  const reviewsQ = useQuery({
    queryKey: ["identity-reviews", "pending"],
    queryFn: () => api.identityReviews("pending"),
  });
  const [mergeItem, setMergeItem] = useState<IdentityReviewItem | null>(null);

  const resolveM = useMutation({
    mutationFn: (id: string) => api.resolveIdentityReviewDistinct(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["identity-reviews"] });
      await qc.invalidateQueries({ queryKey: ["patients"] });
    },
  });

  const items = reviewsQ.data?.items ?? [];

  if (reviewsQ.isLoading) {
    return (
      <p className="rounded-xl border border-border bg-card px-3 py-12 text-center text-muted-foreground">
        Loading identity review queue…
      </p>
    );
  }

  if (reviewsQ.isError) {
    return (
      <p className="text-sm text-lab-danger">
        Could not load identity review queue. Please try again.
      </p>
    );
  }

  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-border bg-card px-3 py-12 text-center text-muted-foreground">
        No possible-duplicate flags waiting. When Accession checks “Flag as
        possible duplicate,” pairs appear here for admin review.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {!admin ? (
        <p className="text-xs text-muted-foreground">
          Viewing only — merge and resolve require an admin account.
        </p>
      ) : null}
      <ul className="space-y-3">
        {items.map((item) => (
          <li
            key={item.id}
            className="rounded-xl border border-border bg-card p-3.5 shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Possible duplicate
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Flagged{" "}
                  <span className="tabular-nums text-foreground/85">
                    {new Date(item.flaggedAt).toLocaleString()}
                  </span>
                  {item.flaggedFromAccessionNumber ? (
                    <>
                      {" "}
                      · accession{" "}
                      <Link
                        to="/orders"
                        search={{ accession: item.flaggedFromAccessionNumber }}
                        className="font-mono text-xs text-primary hover:underline"
                      >
                        {item.flaggedFromAccessionNumber}
                      </Link>
                    </>
                  ) : null}
                </p>
              </div>
              <Badge variant="warn">Pending review</Badge>
            </div>

            <ul className="mt-3 space-y-2">
              {item.patients.map((p) => (
                <li
                  key={p.id}
                  className={cn(
                    "flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 px-2.5 py-2",
                    item.preferredSurvivorPatientId === p.id &&
                      "border-accent/40 bg-accent/5",
                  )}
                >
                  <div className="min-w-0">
                    <p className="font-medium">{p.displayName}</p>
                    <p className="text-xs text-muted-foreground">
                      <span className="font-mono">{p.mrn}</span> ·{" "}
                      {p.dateOfBirth ?? "—"} · {p.sex ?? "—"} · {p.status}
                      {item.preferredSurvivorPatientId === p.id ? (
                        <span className="text-accent"> · preferred</span>
                      ) : null}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => onOpenPatient(p.id)}
                  >
                    Open
                  </Button>
                </li>
              ))}
            </ul>

            {admin ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setMergeItem(item)}
                >
                  Merge charts…
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={resolveM.isPending}
                  onClick={() => resolveM.mutate(item.id)}
                >
                  Mark as different people
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      {mergeItem ? (
        <MergeChartsDialog
          item={mergeItem}
          open
          onOpenChange={(open) => {
            if (!open) setMergeItem(null);
          }}
          onMerged={async () => {
            setMergeItem(null);
            await qc.invalidateQueries({ queryKey: ["identity-reviews"] });
            await qc.invalidateQueries({ queryKey: ["patients"] });
          }}
        />
      ) : null}
    </div>
  );
}

function MergeChartsDialog({
  item,
  open,
  onOpenChange,
  onMerged,
}: {
  item: IdentityReviewItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMerged: () => void | Promise<void>;
}) {
  const preferred =
    item.patients.find((p) => p.id === item.preferredSurvivorPatientId) ??
    item.patients[0]!;
  const [survivorId, setSurvivorId] = useState(preferred.id);
  const [reason, setReason] = useState("");

  const survivor = item.patients.find((p) => p.id === survivorId);
  const losers = item.patients.filter((p) => p.id !== survivorId);

  const mergeM = useMutation({
    mutationFn: async () => {
      if (!survivor || losers.length !== 1) {
        throw new Error("Pick one survivor chart; merge is pairwise");
      }
      return api.mergePatients({
        survivorPatientId: survivor.id,
        loserPatientId: losers[0]!.id,
        reviewItemId: item.id,
        reason: reason.trim() || undefined,
      });
    },
    onSuccess: async () => {
      await onMerged();
      onOpenChange(false);
    },
  });

  const canMerge = Boolean(survivor) && losers.length === 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0">
        <DialogHeader>
          <DialogTitle>Merge charts</DialogTitle>
          <DialogDescription>
            Specimens move to the survivor MRN. The other chart is quarantined
            (not deleted). Historical label snapshots stay as recorded.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 px-5 py-4">
          <p className="text-sm font-medium">Keep this chart (survivor)</p>
          <ul className="space-y-2">
            {item.patients.map((p) => (
              <li key={p.id}>
                <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border px-3 py-2 text-sm">
                  <input
                    type="radio"
                    name="survivor"
                    className="mt-1"
                    checked={survivorId === p.id}
                    onChange={() => setSurvivorId(p.id)}
                  />
                  <span>
                    <span className="font-medium">{p.displayName}</span>{" "}
                    <span className="font-mono text-xs text-muted-foreground">
                      ({p.mrn})
                    </span>
                    {item.preferredSurvivorPatientId === p.id ? (
                      <Badge variant="muted" className="ml-1.5 text-[10px]">
                        Used at accession
                      </Badge>
                    ) : null}
                  </span>
                </label>
              </li>
            ))}
          </ul>

          {losers.length === 1 && survivor ? (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm">
              <span className="font-medium">{losers[0]!.displayName}</span> (
              <span className="font-mono text-xs">{losers[0]!.mrn}</span>) will
              be quarantined; specimens move under{" "}
              <span className="font-mono text-xs">{survivor.mrn}</span>.
            </p>
          ) : (
            <p className="text-sm text-lab-danger">
              This queue item has {item.patients.length} charts. Merge is
              pairwise — resolve extras after the first merge, or mark distinct.
            </p>
          )}

          <label className="block text-sm">
            <span className="text-muted-foreground">Reason (optional)</span>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              placeholder="e.g. same person, duplicate upstream MRNs"
              maxLength={500}
            />
          </label>

          {mergeM.isError ? (
            <p className="text-sm text-lab-danger">
              {mergeM.error instanceof Error
                ? mergeM.error.message
                : "Merge failed"}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!canMerge || mergeM.isPending}
              onClick={() => mergeM.mutate()}
            >
              {mergeM.isPending ? "Merging…" : "Confirm merge"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function useIdentityReviewPendingCount() {
  const q = useQuery({
    queryKey: ["identity-reviews", "pending"],
    queryFn: () => api.identityReviews("pending"),
    refetchInterval: 30_000,
  });
  return useMemo(() => q.data?.pendingCount ?? 0, [q.data?.pendingCount]);
}
