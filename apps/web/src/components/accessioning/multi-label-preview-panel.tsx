import { useState, type ReactNode } from "react";
import { LayoutGrid } from "lucide-react";
import type { LabelPreviewFields } from "../../lib/api";
import {
  LabelPreview,
  type LabelPreviewMode,
} from "../label-preview";
import {
  LabelPreviewPanel,
  type LabelPreviewPanelPhase,
} from "./label-preview-panel";
import { Badge } from "../ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { ScrollContainer } from "../ui/scroll-container";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";

export type LabelPreviewItem = {
  id: string;
  specimenType: string;
  fields: LabelPreviewFields | null | undefined;
  accessionNumber?: string | null;
  printStatus?: { ok: boolean; error?: string } | null;
  testCount?: number;
};

type Props = {
  phase: LabelPreviewPanelPhase;
  labels: LabelPreviewItem[];
  emptyContext?: "register" | "labels";
  loading?: boolean;
  previewWarning?: string;
  className?: string;
  actions?: ReactNode;
};

function specimenTypeLabel(type: string): string {
  if (!type) return "Specimen";
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function headerForPhase(
  phase: LabelPreviewPanelPhase,
  count: number,
  primaryAccession?: string | null,
): string {
  const tubeLabel = `${count} tube${count === 1 ? "" : "s"}`;
  switch (phase) {
    case "registered":
      return primaryAccession && count === 1
        ? `Registered · ${primaryAccession}`
        : `Registered · ${tubeLabel}`;
    case "draft":
      return count === 1 ? "Draft label" : `Draft labels · ${tubeLabel}`;
    default:
      return count === 1 ? "Label preview" : `Label previews · ${tubeLabel}`;
  }
}

function modeForPhase(phase: LabelPreviewPanelPhase): LabelPreviewMode {
  return phase === "draft" ? "draft" : "final";
}

function gridColsClass(count: number): string {
  if (count <= 1) return "grid-cols-1";
  if (count === 2) return "grid-cols-1 sm:grid-cols-2";
  if (count === 3) return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";
  return "grid-cols-1 sm:grid-cols-2";
}

function LabelCard({
  item,
  phase,
  emptyContext,
  compact,
}: {
  item: LabelPreviewItem;
  phase: LabelPreviewPanelPhase;
  emptyContext: "register" | "labels";
  compact?: boolean;
}) {
  return (
    <div className={cn("min-w-0 space-y-2", compact && "rounded-lg border border-border/60 bg-muted/10 p-2")}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="muted" className="text-[10px] capitalize">
          {specimenTypeLabel(item.specimenType)}
        </Badge>
        {item.testCount != null && item.testCount > 0 && (
          <span className="text-[10px] text-muted-foreground">
            {item.testCount} test{item.testCount === 1 ? "" : "s"}
          </span>
        )}
        {item.accessionNumber && (
          <span className="font-mono text-[10px] text-muted-foreground">
            {item.accessionNumber}
          </span>
        )}
      </div>
      <LabelPreview
        fields={item.fields}
        mode={item.fields ? modeForPhase(phase) : undefined}
        emptyContext={emptyContext}
        printStatus={item.printStatus}
      />
      {item.printStatus && !item.printStatus.ok && (
        <p className="text-xs text-lab-danger">{item.printStatus.error}</p>
      )}
    </div>
  );
}

export function MultiLabelPreviewPanel({
  phase,
  labels,
  emptyContext = "register",
  loading,
  previewWarning,
  className,
  actions,
}: Props) {
  const [gridOpen, setGridOpen] = useState(false);
  const count = labels.length;
  const primaryAccession = labels[0]?.accessionNumber;

  if (count <= 1) {
    const single = labels[0];
    return (
      <LabelPreviewPanel
        className={className}
        phase={phase}
        fields={single?.fields}
        emptyContext={emptyContext}
        loading={loading}
        previewWarning={previewWarning}
        printStatus={single?.printStatus}
        accessionNumber={single?.accessionNumber ?? primaryAccession}
        actions={actions}
      />
    );
  }

  return (
    <>
      <div
        className={cn(
          "flex min-h-0 min-w-0 max-w-full flex-col gap-3 overflow-hidden rounded-xl border border-border bg-card p-4 shadow-sm",
          className,
        )}
      >
        <div className="shrink-0">
          <p className="text-sm font-medium">
            {headerForPhase(phase, count, primaryAccession)}
          </p>
          {phase === "draft" && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Accession numbers assigned when you accession
            </p>
          )}
        </div>

        <div className="min-h-0 min-w-0 overflow-hidden rounded-lg border border-border bg-muted/10">
          <ScrollContainer className="h-52 min-h-0 max-h-52 lg:h-60 lg:max-h-60">
            <div className="min-w-0 space-y-3 p-2">
              {labels.map((item) => (
                <LabelCard
                  key={item.id}
                  item={item}
                  phase={phase}
                  emptyContext={emptyContext}
                  compact
                />
              ))}
            </div>
          </ScrollContainer>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            Scroll to see all {count} labels
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 gap-1 px-2 text-xs text-muted-foreground"
            onClick={() => setGridOpen(true)}
          >
            <LayoutGrid className="size-3.5" aria-hidden />
            Grid view
          </Button>
        </div>

        {loading && (
          <p className="shrink-0 text-xs text-muted-foreground">Updating previews…</p>
        )}
        {previewWarning && labels.some((l) => l.fields) && (
          <p className="shrink-0 text-xs text-amber-700 dark:text-amber-300">
            {previewWarning}
          </p>
        )}

        {actions && (
          <div className="shrink-0 space-y-2 border-t border-border pt-3">{actions}</div>
        )}
      </div>

      <Dialog open={gridOpen} onOpenChange={setGridOpen}>
        <DialogContent className="max-w-4xl p-0">
          <DialogHeader>
            <DialogTitle>
              {phase === "registered" ? "Registered labels" : "Label previews"}
            </DialogTitle>
            <DialogDescription>
              {count} tube{count === 1 ? "" : "s"} —{" "}
              {labels.map((l) => specimenTypeLabel(l.specimenType)).join(", ")}
            </DialogDescription>
          </DialogHeader>
          <div className="px-5 pb-5">
            <div className={cn("grid items-start gap-4", gridColsClass(count))}>
              {labels.map((item) => (
                <LabelCard
                  key={item.id}
                  item={item}
                  phase={phase}
                  emptyContext={emptyContext}
                />
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
