import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { LabRoutingPolicy } from "@drax-lis/contracts";
import { api } from "../../lib/api";
import { isAdmin, useAuth } from "../../lib/auth";
import { isCloudMode } from "../../lib/supabase";
import { useCatalog } from "../../lib/use-catalog";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { cn } from "../../lib/utils";

export const Route = createFileRoute("/_lab/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const auth = useAuth();
  const qc = useQueryClient();
  const catalogQ = useCatalog();
  const canEdit = isAdmin(auth.role) && isCloudMode;

  const settingsQ = useQuery({
    queryKey: ["lab-settings"],
    queryFn: () => api.getLabSettings(),
    enabled: canEdit,
  });

  const fallbackPolicy =
    catalogQ.data?.routingPolicy ??
    ({
      consolidated: catalogQ.data?.labelRouting,
      accession: { mode: "granular" as const },
      labels: { mode: "consolidated" as const, splitByCollectionType: true },
    } as LabRoutingPolicy);

  const [accessionMode, setAccessionMode] = useState<"granular" | "consolidated">(
    "granular",
  );
  const [labelsMode, setLabelsMode] = useState<"granular" | "consolidated">(
    "consolidated",
  );
  const [labelsSplit, setLabelsSplit] = useState(true);
  const [accessionSplit, setAccessionSplit] = useState(false);

  const policy = settingsQ.data?.routingPolicy ?? fallbackPolicy;

  useEffect(() => {
    setAccessionMode(policy.accession.mode);
    setLabelsMode(policy.labels.mode);
    setLabelsSplit(
      policy.labels.splitByCollectionType ??
        policy.consolidated.splitByCollectionType,
    );
    setAccessionSplit(
      policy.accession.splitByCollectionType ??
        policy.accession.mode === "consolidated",
    );
  }, [policy]);

  const saveMutation = useMutation({
    mutationFn: () =>
      api.patchLabRoutingSettings({
        accession: {
          mode: accessionMode,
          splitByCollectionType: accessionSplit,
        },
        labels: {
          mode: labelsMode,
          splitByCollectionType: labelsSplit,
        },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["catalog"] });
      void qc.invalidateQueries({ queryKey: ["lab-settings"] });
    },
  });

  if (!isAdmin(auth.role)) {
    return (
      <div className="mx-auto max-w-lg px-4 py-12 text-center">
        <p className="text-sm text-muted-foreground">
          Lab settings are limited to admin accounts.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Lab settings
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Control how specimens group at accession, and how department names
          appear on tube labels. Labels are always printed one per specimen ID.
        </p>
      </div>

      {!canEdit && (
        <p className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          Showing defaults from the local catalog. Sign in to the cloud app to
          save changes.
        </p>
      )}

      <section className="space-y-4 rounded-xl border border-border bg-card p-4 shadow-sm">
        <h2 className="text-sm font-semibold">Accession routing</h2>
        <p className="text-xs text-muted-foreground">
          How many routing labels appear when registering — match the lab form
          with granular categories, or consolidate departments.
        </p>
        <div className="flex flex-wrap gap-2">
          {(["granular", "consolidated"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              disabled={!canEdit}
              onClick={() => setAccessionMode(mode)}
              className={cn(
                "rounded-lg border px-3 py-2 text-sm capitalize transition-colors",
                accessionMode === mode
                  ? "border-primary bg-primary/10 font-medium"
                  : "border-border hover:bg-muted/40",
              )}
            >
              {mode === "granular" ? "Match lab form (granular)" : "Consolidated"}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={accessionSplit}
            disabled={!canEdit || accessionMode !== "consolidated"}
            onChange={(e) => setAccessionSplit(e.target.checked)}
            className="size-4 rounded border-border"
          />
          Split consolidated accession by collection type (blood vs urine)
        </label>
      </section>

      <section className="space-y-4 rounded-xl border border-border bg-card p-4 shadow-sm">
        <h2 className="text-sm font-semibold">Label department text</h2>
        <p className="text-xs text-muted-foreground">
          Routing line on each label (e.g. Chem · Bld · DOB). Does not change
          how many labels print — always one per specimen.
        </p>
        <div className="flex flex-wrap gap-2">
          {(["granular", "consolidated"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              disabled={!canEdit}
              onClick={() => setLabelsMode(mode)}
              className={cn(
                "rounded-lg border px-3 py-2 text-sm transition-colors",
                labelsMode === mode
                  ? "border-primary bg-primary/10 font-medium"
                  : "border-border hover:bg-muted/40",
              )}
            >
              {mode === "granular"
                ? "Full category names"
                : "Short departments (Hema / Chem / Micro B)"}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={labelsSplit}
            disabled={!canEdit || labelsMode !== "consolidated"}
            onChange={(e) => setLabelsSplit(e.target.checked)}
            className="size-4 rounded border-border"
          />
          Include collection type on routing line (Bld / Ur / Stl)
        </label>
      </section>

      <section className="space-y-2 rounded-xl border border-border bg-card p-4 shadow-sm">
        <h2 className="text-sm font-semibold">Consolidated departments</h2>
        <p className="text-xs text-muted-foreground">
          Short names used on labels when label routing is consolidated, and on
          accession when accession routing is consolidated.
        </p>
        <ul className="flex flex-wrap gap-2">
          {policy.consolidated.departments.map((d) => (
            <li key={d.key}>
              <Badge variant="muted">
                {d.label} ({d.labelShort})
              </Badge>
            </li>
          ))}
        </ul>
      </section>

      {canEdit && (
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
        >
          {saveMutation.isPending ? "Saving…" : "Save routing settings"}
        </Button>
      )}

      {saveMutation.isError && (
        <p className="text-sm text-lab-danger">
          {saveMutation.error instanceof Error
            ? saveMutation.error.message
            : "Could not save settings"}
        </p>
      )}
      {saveMutation.isSuccess && (
        <p className="text-sm text-lab-ok">Settings saved.</p>
      )}
    </div>
  );
}
