import type { ReactNode } from "react";
import type { LabelPreviewFields } from "../../lib/api";
import {
  LabelPreview,
  type LabelPreviewMode,
} from "../label-preview";
import { cn } from "../../lib/utils";

export type LabelPreviewPanelPhase =
  | "idle"
  | "draft"
  | "registered"
  | "lookup";

type Props = {
  phase: LabelPreviewPanelPhase;
  fields: LabelPreviewFields | null | undefined;
  /** Register: choose patient; Labels: scan accession */
  emptyContext?: "register" | "labels";
  loading?: boolean;
  /** @deprecated use previewWarning */
  previewError?: boolean;
  previewWarning?: string;
  printStatus?: { ok: boolean; error?: string } | null;
  accessionNumber?: string | null;
  className?: string;
  actions?: ReactNode;
};

function headerForPhase(
  phase: LabelPreviewPanelPhase,
  accessionNumber?: string | null,
): string {
  switch (phase) {
    case "registered":
    case "lookup":
      return accessionNumber
        ? `Registered · ${accessionNumber}`
        : "Registered label";
    case "draft":
      return "Draft label";
    default:
      return "Label preview";
  }
}

function modeForPhase(phase: LabelPreviewPanelPhase): LabelPreviewMode {
  return phase === "draft" ? "draft" : "final";
}

export function LabelPreviewPanel({
  phase,
  fields,
  emptyContext = "register",
  loading,
  previewError,
  previewWarning,
  printStatus,
  accessionNumber,
  className,
  actions,
}: Props) {
  const warning =
    previewWarning ??
    (previewError && fields
      ? "Could not load the label preview — showing a draft."
      : undefined);

  return (
    <div
      className={cn(
        "min-w-0 max-w-full space-y-3 overflow-hidden rounded-xl border border-border bg-card p-4 shadow-sm lg:sticky lg:top-4 lg:self-start",
        className,
      )}
    >
      <div>
        <p className="text-sm font-medium">
          {headerForPhase(phase, accessionNumber)}
        </p>
        {phase === "draft" && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            Accession numbers assigned when you accession
          </p>
        )}
      </div>

      <LabelPreview
        fields={fields}
        mode={fields ? modeForPhase(phase) : undefined}
        emptyContext={emptyContext}
        printStatus={printStatus}
      />

      {loading && (
        <p className="text-xs text-muted-foreground">Updating preview…</p>
      )}
      {warning && fields && (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          {warning}
        </p>
      )}

      {actions && (
        <div className="space-y-2 border-t border-border pt-3">{actions}</div>
      )}
    </div>
  );
}
