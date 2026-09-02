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
};

export type LabelPreviewMode = "draft" | "final";

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
  if (!fields) {
    return (
      <div
        className={cn(
          "flex aspect-[2/1] items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 px-4 text-center text-sm text-muted-foreground",
          className,
        )}
      >
        {EMPTY_COPY[emptyContext]}
      </div>
    );
  }

  const barW = 300;
  const barH = 56;
  const isDraft = mode === "draft";

  return (
    <div className={cn("min-w-0 max-w-full space-y-2", className)}>
      <div
        className={cn(
          "relative w-full max-w-full overflow-hidden rounded-lg border-2 bg-white p-3 text-black shadow-sm dark:bg-zinc-100",
          isDraft ? "border-dashed border-zinc-400" : "border-foreground/80",
        )}
        style={{ aspectRatio: "2 / 1" }}
      >
        <div className="flex h-full min-w-0 flex-col justify-between text-[10px] leading-tight sm:text-xs">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <div className="min-w-0 flex-1 overflow-hidden">
              <p
                className={cn(
                  "truncate font-bold text-sm sm:text-base",
                  isDraft && "text-zinc-500 italic",
                )}
              >
                {fields.accessionNumber}
              </p>
              <p className="truncate font-medium">{fields.patientName}</p>
              <p className="truncate text-[10px] text-zinc-600">
                {fields.dateOfBirth} · {fields.specimenType}
              </p>
              <p className="line-clamp-2 text-[10px] leading-tight text-zinc-600">
                {fields.orderedTests}
              </p>
            </div>
            <div
              className="grid size-11 shrink-0 grid-cols-3 grid-rows-3 gap-px bg-black p-0.5"
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
          <div className="min-w-0 px-1">
            <svg
              viewBox={`0 0 ${barW} ${barH}`}
              className="h-12 w-full max-w-full text-black sm:h-14"
              preserveAspectRatio="xMidYMid meet"
              aria-hidden
            >
              <g
                dangerouslySetInnerHTML={{
                  __html: pseudoBarcodeBars(fields.barcode, barW, barH),
                }}
              />
            </svg>
          </div>
          <p className="text-center font-mono text-[9px] tracking-wider">
            {fields.barcode}
          </p>
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
        ZD411 · 2&quot;×1&quot; · Code 128 + Data Matrix
        {isDraft ? " · draft" : ` · ${fields.barcode}`}
      </p>
    </div>
  );
}
