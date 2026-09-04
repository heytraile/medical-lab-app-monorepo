/** Zebra 203 DPI — standard for ZD411 and most lab desktop printers. */
export const LABEL_DPI = 203;

export type LabelSizeId = "tube_2x1" | "tube_2x0_5" | "tube_4x2";

export type LabelSizeSpec = {
  id: LabelSizeId;
  /** Human label, e.g. 2×1 in */
  name: string;
  widthInches: number;
  heightInches: number;
  widthDots: number;
  heightDots: number;
  dpi: typeof LABEL_DPI;
  /** Plain-English use case */
  useCase: string;
};

/** Common direct-thermal sizes (203 DPI). Labs usually pick one stock for tube accession. */
export const LABEL_SIZES: Record<LabelSizeId, LabelSizeSpec> = {
  tube_2x1: {
    id: "tube_2x1",
    name: '2" × 1"',
    widthInches: 2,
    heightInches: 1,
    widthDots: 406,
    heightDots: 203,
    dpi: LABEL_DPI,
    useCase: "Standard blood/urine tube label (Drax Hall default)",
  },
  tube_2x0_5: {
    id: "tube_2x0_5",
    name: '2" × 0.5"',
    widthInches: 2,
    heightInches: 0.5,
    widthDots: 406,
    heightDots: 102,
    dpi: LABEL_DPI,
    useCase: "Small cap / narrow tube labels",
  },
  tube_4x2: {
    id: "tube_4x2",
    name: '4" × 2"',
    widthInches: 4,
    heightInches: 2,
    widthDots: 812,
    heightDots: 406,
    dpi: LABEL_DPI,
    useCase: "Large specimen container or bench jar",
  },
};

export const DEFAULT_LABEL_SIZE_ID: LabelSizeId = "tube_2x1";

export const DEFAULT_LABEL_WIDTH_DOTS = LABEL_SIZES[DEFAULT_LABEL_SIZE_ID].widthDots;
export const DEFAULT_LABEL_HEIGHT_DOTS =
  LABEL_SIZES[DEFAULT_LABEL_SIZE_ID].heightDots;

/** Screen scale for WYSIWYG preview (print uses dots). */
export const LABEL_PREVIEW_SCALE = 0.75;

export function labelPreviewWidthPx(
  widthDots: number = DEFAULT_LABEL_WIDTH_DOTS,
): number {
  return Math.round(widthDots * LABEL_PREVIEW_SCALE);
}

export function labelPreviewHeightPx(
  heightDots: number = DEFAULT_LABEL_HEIGHT_DOTS,
): number {
  return Math.round(heightDots * LABEL_PREVIEW_SCALE);
}

export type SpecimenLabelInput = {
  accessionNumber: string;
  patientName: string;
  barcode: string;
  dateOfBirth?: string | null;
  orderedTests?: string[];
  specimenType?: string;
  mrn?: string;
};

export type FormattedSpecimenLabel = {
  size: LabelSizeSpec;
  accessionNumber: string;
  patientName: string;
  dateOfBirth: string;
  metaLine: string;
  /** Lines actually printed (joined for display field). */
  testLines: string[];
  orderedTests: string;
  testsOverflowCount: number;
  barcode: string;
  printedAt: string;
  specimenType: string;
  mrn?: string;
  widthDots: number;
  heightDots: number;
};

type LayoutProfile = {
  testMaxLines: number;
  testMaxCharsPerLine: number;
  accessionMaxChars: number;
  nameMaxChars: number;
  metaMaxChars: number;
  /** ZPL y positions and barcode height */
  accessionY: number;
  nameY: number;
  metaY: number;
  testStartY: number;
  testLineHeight: number;
  barcodeY: number;
  barcodeHeight: number;
  timestampY: number;
  accessionFont: number;
  nameFont: number;
  bodyFont: number;
  timestampFont: number;
};

function layoutProfileFor(size: LabelSizeSpec): LayoutProfile {
  if (size.id === "tube_4x2") {
    return {
      testMaxLines: 4,
      testMaxCharsPerLine: 48,
      accessionMaxChars: 24,
      nameMaxChars: 40,
      metaMaxChars: 44,
      accessionY: 12,
      nameY: 48,
      metaY: 76,
      testStartY: 104,
      testLineHeight: 22,
      barcodeY: 200,
      barcodeHeight: 80,
      timestampY: size.heightDots - 24,
      accessionFont: 36,
      nameFont: 28,
      bodyFont: 20,
      timestampFont: 16,
    };
  }
  if (size.id === "tube_2x0_5") {
    return {
      testMaxLines: 1,
      testMaxCharsPerLine: 32,
      accessionMaxChars: 16,
      nameMaxChars: 22,
      metaMaxChars: 28,
      accessionY: 4,
      nameY: 24,
      metaY: 40,
      testStartY: 54,
      testLineHeight: 14,
      barcodeY: 68,
      barcodeHeight: 28,
      timestampY: size.heightDots - 12,
      accessionFont: 22,
      nameFont: 16,
      bodyFont: 14,
      timestampFont: 12,
    };
  }
  // tube_2x1 — default tube label
  return {
    testMaxLines: 2,
    testMaxCharsPerLine: 38,
    accessionMaxChars: 18,
    nameMaxChars: 28,
    metaMaxChars: 34,
    accessionY: 8,
    nameY: 38,
    metaY: 60,
    testStartY: 78,
    testLineHeight: 16,
    barcodeY: 112,
    barcodeHeight: 52,
    timestampY: size.heightDots - 18,
    accessionFont: 28,
    nameFont: 20,
    bodyFont: 16,
    timestampFont: 14,
  };
}

export function inchesToDots(inches: number, dpi = LABEL_DPI): number {
  return Math.round(inches * dpi);
}

export function resolveLabelSize(options?: {
  sizeId?: string | null;
  widthDots?: number | null;
  heightDots?: number | null;
}): LabelSizeSpec {
  const id = options?.sizeId?.trim();
  if (id && id in LABEL_SIZES) {
    return LABEL_SIZES[id as LabelSizeId];
  }
  const w = options?.widthDots;
  const h = options?.heightDots;
  if (w && h) {
    const match = Object.values(LABEL_SIZES).find(
      (s) => s.widthDots === w && s.heightDots === h,
    );
    if (match) return match;
    return {
      id: "tube_2x1",
      name: `${(w / LABEL_DPI).toFixed(2)}" × ${(h / LABEL_DPI).toFixed(2)}"`,
      widthInches: w / LABEL_DPI,
      heightInches: h / LABEL_DPI,
      widthDots: w,
      heightDots: h,
      dpi: LABEL_DPI,
      useCase: "Custom size via LABEL_WIDTH_DOTS / LABEL_HEIGHT_DOTS",
    };
  }
  return LABEL_SIZES[DEFAULT_LABEL_SIZE_ID];
}

export function sanitizeZplText(value: string, maxLen: number): string {
  return value.replace(/\^/g, " ").replace(/\\/g, " ").trim().slice(0, maxLen);
}

export function truncateWithEllipsis(text: string, maxLen: number): string {
  const t = text.trim();
  if (t.length <= maxLen) return t;
  if (maxLen <= 1) return "…";
  return `${t.slice(0, maxLen - 1)}…`;
}

/** Fit comma-separated test codes onto a fixed number of label lines. */
export function formatTestLines(
  codes: string[],
  maxLines: number,
  maxCharsPerLine: number,
): { lines: string[]; overflowCount: number } {
  const clean = codes.map((c) => c.trim()).filter(Boolean);
  if (!clean.length) {
    return { lines: ["—"], overflowCount: 0 };
  }

  const lines: string[] = [];
  let i = 0;
  while (i < clean.length && lines.length < maxLines) {
    let line = "";
    while (i < clean.length) {
      const next = clean[i]!;
      const candidate = line ? `${line}, ${next}` : next;
      if (candidate.length > maxCharsPerLine) {
        if (!line) {
          lines.push(truncateWithEllipsis(next, maxCharsPerLine));
          i += 1;
        }
        break;
      }
      line = candidate;
      i += 1;
    }
    if (line) lines.push(line);
  }

  const overflowCount = Math.max(0, clean.length - i);
  if (overflowCount > 0 && lines.length > 0) {
    const lastIdx = lines.length - 1;
    const suffix = ` +${overflowCount}`;
    const room = maxCharsPerLine - suffix.length;
    lines[lastIdx] = truncateWithEllipsis(lines[lastIdx]!, Math.max(8, room)) + suffix;
  }

  return { lines, overflowCount };
}

export function formatSpecimenLabel(
  input: SpecimenLabelInput,
  size: LabelSizeSpec = LABEL_SIZES[DEFAULT_LABEL_SIZE_ID],
  printedAt = new Date().toISOString(),
): FormattedSpecimenLabel {
  const profile = layoutProfileFor(size);
  const dob = input.dateOfBirth?.trim() || "DOB —";
  const tube = input.specimenType?.trim() || "blood";
  const metaRaw = `${dob} · ${tube}`;
  const { lines: testLines, overflowCount } = formatTestLines(
    input.orderedTests ?? [],
    profile.testMaxLines,
    profile.testMaxCharsPerLine,
  );

  return {
    size,
    accessionNumber: truncateWithEllipsis(
      sanitizeZplText(input.accessionNumber, 200),
      profile.accessionMaxChars,
    ),
    patientName: truncateWithEllipsis(
      sanitizeZplText(input.patientName, 200),
      profile.nameMaxChars,
    ),
    dateOfBirth: dob,
    metaLine: sanitizeZplText(metaRaw, profile.metaMaxChars),
    testLines,
    orderedTests: testLines.join(" "),
    testsOverflowCount: overflowCount,
    barcode: sanitizeZplText(input.barcode, 48),
    printedAt,
    specimenType: tube,
    mrn: input.mrn,
    widthDots: size.widthDots,
    heightDots: size.heightDots,
  };
}

export function buildSpecimenLabelZpl(formatted: FormattedSpecimenLabel): string {
  const profile = layoutProfileFor(formatted.size);
  const pw = formatted.widthDots;
  const ll = formatted.heightDots;
  const ts = formatted.printedAt.slice(0, 19).replace("T", " ");

  const testBlocks = formatted.testLines
    .map(
      (line, idx) =>
        `^FO8,${profile.testStartY + idx * profile.testLineHeight}^A0N,${profile.bodyFont},${profile.bodyFont}^FD${line}^FS`,
    )
    .join("\n");

  return `^XA
^PW${pw}
^LL${ll}
^LH0,0
^FO8,${profile.accessionY}^A0N,${profile.accessionFont},${profile.accessionFont}^FD${formatted.accessionNumber}^FS
^FO8,${profile.nameY}^A0N,${profile.nameFont},${profile.nameFont}^FD${formatted.patientName}^FS
^FO8,${profile.metaY}^A0N,${profile.bodyFont},${profile.bodyFont}^FD${formatted.metaLine}^FS
${testBlocks}
^FO${pw - 72},${profile.accessionY}^BXN,4,200,,,,_,1^FD${formatted.barcode}^FS
^FO8,${profile.barcodeY}^BY2,2,${profile.barcodeHeight}^BCN,${profile.barcodeHeight},Y,N,N^FD${formatted.barcode}^FS
^FO8,${profile.timestampY}^A0N,${profile.timestampFont},${profile.timestampFont}^FD${ts}^FS
^XZ
`;
}

export function buildSpecimenLabelDocument(
  input: SpecimenLabelInput,
  size: LabelSizeSpec = LABEL_SIZES[DEFAULT_LABEL_SIZE_ID],
): { formatted: FormattedSpecimenLabel; zpl: string } {
  const formatted = formatSpecimenLabel(input, size);
  const zpl = buildSpecimenLabelZpl(formatted);
  return { formatted, zpl };
}

/** Map formatted label → preview/API fields (single source for print + UI). */
export function formattedToPreviewFields(formatted: FormattedSpecimenLabel) {
  return {
    accessionNumber: formatted.accessionNumber,
    patientName: formatted.patientName,
    barcode: formatted.barcode,
    dateOfBirth: formatted.dateOfBirth,
    orderedTests: formatted.orderedTests,
    specimenType: formatted.specimenType,
    mrn: formatted.mrn,
    printedAt: formatted.printedAt,
    widthDots: formatted.widthDots,
    heightDots: formatted.heightDots,
    sizeId: formatted.size.id,
    sizeName: formatted.size.name,
    testLines: formatted.testLines,
    testsOverflowCount: formatted.testsOverflowCount,
  };
}
