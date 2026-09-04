import {
  DEFAULT_LABEL_HEIGHT_DOTS,
  DEFAULT_LABEL_WIDTH_DOTS,
  labelPreviewHeightPx,
  labelPreviewWidthPx,
} from "@drax-lis/contracts";
import { cn } from "../lib/utils";

export type LabelPreviewFields = {
  accessionNumber: string;
  patientName: string;
  barcode: string;
  dateOfBirth: string;
  orderedTests: string;
  specimenType: string;
  mrn?: string;
  printedAt: string;
  widthDots?: number;
  heightDots?: number;
  sizeId?: string;
  sizeName?: string;
  testLines?: string[];
  testsOverflowCount?: number;
};

export type LabelPreviewMode = "draft" | "final";

export {
  DEFAULT_LABEL_WIDTH_DOTS,
  DEFAULT_LABEL_HEIGHT_DOTS,
  labelPreviewWidthPx,
  labelPreviewHeightPx,
};

/** Lightweight Code 128-ish bar pattern for visual preview (not for scanning). */
function pseudoBarcodeBars(data: string, width: number, height: number): string {
  const bars: number[] = [];
  for (let i = 0; i < data.length; i++) {
    const c = data.charCodeAt(i);
    bars.push(1, c % 2 === 0 ? 2 : 1, c % 3 === 0 ? 1 : 3, 1);
  }
  const total = bars.reduce((a, b) => a + b, 0) || 1;
  const unit = width / total;
  let x = 0;
  return bars
    .map((w, i) => {
      const rw = w * unit;
      const rect =
        i % 2 === 0
          ? `<rect x="${x}" y="0" width="${rw}" height="${height}" fill="currentColor"/>`
          : "";
      x += rw;
      return rect;
    })
    .join("");
}

type Props = {
  fields: LabelPreviewFields | null | undefined;
  className?: string;
  mode?: LabelPreviewMode;
  emptyContext?: "register" | "labels";
  printStatus?: { ok: boolean; error?: string } | null;
};

const EMPTY_COPY = {
  register: "Choose a patient to preview the tube label",
  labels: "Scan or select an accession to preview the label",
} as const;

export function LabelPreview({
  fields,
  className,
  mode = "final",
  emptyContext = "register",
  printStatus,
}: Props) {
  const emptyWidth = labelPreviewWidthPx();
  const emptyHeight = labelPreviewHeightPx();

  if (!fields) {
    return (
      <div
        className={cn("mx-auto w-full space-y-2", className)}
        style={{ maxWidth: emptyWidth }}
      >
        <div
          className="flex w-full items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 px-4 text-center text-sm text-muted-foreground"
          style={{ height: emptyHeight }}
        >
          {EMPTY_COPY[emptyContext]}
        </div>
      </div>
    );
  }

  const widthDots = fields.widthDots ?? DEFAULT_LABEL_WIDTH_DOTS;
  const heightDots = fields.heightDots ?? DEFAULT_LABEL_HEIGHT_DOTS;
  const previewWidthPx = labelPreviewWidthPx(widthDots);
  const testLines =
    fields.testLines && fields.testLines.length > 0
      ? fields.testLines
      : fields.orderedTests.split(/\s+/).filter(Boolean);
  const barW = 300;
  const barH = 56;
  const isDraft = mode === "draft";
  const sizeLabel = fields.sizeName ?? '2" × 1"';

  return (
    <div
      className={cn("mx-auto w-full min-w-0 space-y-2", className)}
      style={{ maxWidth: previewWidthPx }}
    >
      <div
        className={cn(
          "relative flex w-full min-w-0 flex-col overflow-hidden rounded-lg border-2 bg-white p-2.5 text-black shadow-sm dark:bg-zinc-100 sm:p-3",
          isDraft ? "border-dashed border-zinc-400" : "border-foreground/80",
        )}
        style={{ aspectRatio: `${widthDots} / ${heightDots}` }}
      >
        <div className="flex min-h-0 flex-1 flex-col gap-0.5 text-[10px] leading-tight sm:text-xs">
          <div className="flex min-w-0 shrink-0 items-start justify-between gap-1.5">
            <div className="min-w-0 flex-1 overflow-hidden">
              <p
                className={cn(
                  "truncate font-bold text-sm leading-tight sm:text-base",
                  isDraft && "text-zinc-500 italic",
                )}
              >
                {fields.accessionNumber}
              </p>
              <p className="truncate font-medium leading-tight">
                {fields.patientName}
              </p>
              <p className="truncate text-[10px] leading-tight text-zinc-600">
                {fields.dateOfBirth} · {fields.specimenType}
              </p>
            </div>
            <div
              className="grid size-9 shrink-0 grid-cols-3 grid-rows-3 gap-px bg-black p-0.5 sm:size-11"
              title="Data Matrix (2D)"
            >
              {Array.from({ length: 9 }).map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    "bg-white",
                    (i + fields.barcode.length) % 3 !== 0 && "bg-black",
                  )}
                />
              ))}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            {testLines.map((line, i) => (
              <p
                key={i}
                className="truncate text-[9px] leading-tight text-zinc-600 sm:text-[10px]"
              >
                {line}
              </p>
            ))}
          </div>
          <div className="mt-auto shrink-0 px-0.5 pt-0.5">
            <svg
              viewBox={`0 0 ${barW} ${barH}`}
              className="block h-8 w-full text-black sm:h-10"
              preserveAspectRatio="xMidYMid meet"
              aria-hidden
            >
              <g
                dangerouslySetInnerHTML={{
                  __html: pseudoBarcodeBars(fields.barcode, barW, barH),
                }}
              />
            </svg>
            <p className="truncate text-center font-mono text-[8px] tracking-wide sm:text-[9px]">
              {fields.barcode}
            </p>
          </div>
        </div>
      </div>
      {printStatus && (
        <p
          className={cn(
            "text-xs",
            printStatus.ok ? "text-lab-ok" : "text-lab-danger",
          )}
        >
          {printStatus.ok
            ? "Label sent to printer"
            : `Print failed: ${printStatus.error ?? "unknown error"}`}
        </p>
      )}
      <p className="break-words text-[10px] text-muted-foreground">
        ZD411 · {sizeLabel} fixed label
        {fields.testsOverflowCount
          ? ` · ${fields.testsOverflowCount} more test(s) not on label`
          : ""}
        {isDraft ? " · draft" : ` · ${fields.barcode}`}
      </p>
    </div>
  );
}
