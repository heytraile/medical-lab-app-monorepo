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

/** Format a per-tube specimen ID tied to the parent accession number. */
export function formatSpecimenNumber(
  accessionNumber: string,
  sequence: number,
): string {
  return `${accessionNumber}-${String(sequence).padStart(2, "0")}`;
}

export function formatPatientNameWithMrn(
  name: string,
  mrn?: string | null,
): string {
  const m = mrn?.trim();
  if (!m) return name.trim();
  let n = name.trim();
  if (!n) return m;
  if (n.toUpperCase() === m.toUpperCase()) return m;
  const suffix = ` · ${m}`;
  const suffixLower = suffix.toLowerCase();
  while (n.toLowerCase().endsWith(suffixLower)) {
    n = n.slice(0, -suffix.length).trimEnd();
  }
  return `${n} · ${m}`;
}

export type SpecimenLabelInput = {
  accessionNumber: string;
  /** Per-tube specimen ID (printed and encoded in barcode). */
  specimenNumber?: string;
  patientName: string;
  barcode: string;
  dateOfBirth?: string | null;
  orderedTests?: string[];
  specimenType?: string;
  /** Lab routing department shown on the label (e.g. Blood Chemistry). */
  departmentLabel?: string;
  mrn?: string;
};

export type FormattedSpecimenLabel = {
  size: LabelSizeSpec;
  accessionNumber: string;
  specimenNumber: string;
  patientName: string;
  dateOfBirth: string;
  /** Department · DOB — routing + identity check. */
  routingLine: string;
  testLines: string[];
  orderedTests: string;
  testsOverflowCount: number;
  barcode: string;
  printedAt: string;
  specimenType: string;
  departmentLabel?: string;
  mrn?: string;
  widthDots: number;
  heightDots: number;
};

type LayoutProfile = {
  marginX: number;
  textWidth: number;
  accessionY: number;
  specimenY: number;
  nameY: number;
  nameMaxLines: number;
  nameLineSpacing: number;
  routingY: number;
  barcodeY: number;
  barcodeHeight: number;
  accessionFont: number;
  specimenFont: number;
  nameFont: number;
  routingFont: number;
};

function layoutProfileFor(size: LabelSizeSpec): LayoutProfile {
  if (size.id === "tube_4x2") {
    return {
      marginX: 12,
      textWidth: size.widthDots - 24,
      accessionY: 16,
      specimenY: 52,
      nameY: 88,
      nameMaxLines: 2,
      nameLineSpacing: 6,
      routingY: 148,
      barcodeY: 188,
      barcodeHeight: 72,
      accessionFont: 36,
      specimenFont: 28,
      nameFont: 26,
      routingFont: 22,
    };
  }
  if (size.id === "tube_2x0_5") {
    return {
      marginX: 6,
      textWidth: size.widthDots - 12,
      accessionY: 2,
      specimenY: 16,
      nameY: 30,
      nameMaxLines: 2,
      nameLineSpacing: 2,
      routingY: 52,
      barcodeY: 66,
      barcodeHeight: 28,
      accessionFont: 16,
      specimenFont: 13,
      nameFont: 12,
      routingFont: 11,
    };
  }
  // tube_2x1 — default tube label (406 × 203 dots)
  return {
    marginX: 8,
    textWidth: size.widthDots - 16,
    accessionY: 4,
    specimenY: 24,
    nameY: 40,
    nameMaxLines: 2,
    nameLineSpacing: 4,
    routingY: 72,
    barcodeY: 88,
    barcodeHeight: 40,
    accessionFont: 18,
    specimenFont: 14,
    nameFont: 13,
    routingFont: 12,
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

export function sanitizeZplText(value: string): string {
  return value.replace(/\^/g, " ").replace(/\\/g, " ").replace(/\r?\n/g, " ").trim();
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
          lines.push(next.slice(0, maxCharsPerLine));
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
  return { lines, overflowCount };
}

function formatRoutingLine(
  departmentLabel: string,
  dateOfBirth: string,
): string {
  const dept = departmentLabel.trim() || "General";
  const dob = dateOfBirth.trim();
  if (!dob || dob === "DOB —") return dept;
  return `${dept} · ${dob}`;
}

export function formatSpecimenLabel(
  input: SpecimenLabelInput,
  size: LabelSizeSpec = LABEL_SIZES[DEFAULT_LABEL_SIZE_ID],
  printedAt = new Date().toISOString(),
): FormattedSpecimenLabel {
  const dob = input.dateOfBirth?.trim() || "DOB —";
  const dept = input.departmentLabel?.trim() || "General";
  const specimenNumber =
    input.specimenNumber?.trim() || input.barcode.trim() || input.accessionNumber;
  const patientLine = formatPatientNameWithMrn(input.patientName, input.mrn);

  return {
    size,
    accessionNumber: sanitizeZplText(input.accessionNumber),
    specimenNumber: sanitizeZplText(specimenNumber),
    patientName: sanitizeZplText(patientLine),
    dateOfBirth: dob,
    routingLine: sanitizeZplText(formatRoutingLine(dept, dob)),
    testLines: [],
    orderedTests: "",
    testsOverflowCount: 0,
    barcode: sanitizeZplText(input.barcode),
    printedAt,
    specimenType: input.specimenType?.trim() || "blood",
    departmentLabel: sanitizeZplText(dept),
    mrn: input.mrn,
    widthDots: size.widthDots,
    heightDots: size.heightDots,
  };
}

export function buildSpecimenLabelZpl(formatted: FormattedSpecimenLabel): string {
  const profile = layoutProfileFor(formatted.size);
  const pw = formatted.widthDots;
  const ll = formatted.heightDots;
  const x = profile.marginX;
  const w = profile.textWidth;

  return `^XA
^PW${pw}
^LL${ll}
^LH0,0
^FO${x},${profile.accessionY}^A0N,${profile.accessionFont},${profile.accessionFont}^FD${formatted.accessionNumber}^FS
^FO${x},${profile.specimenY}^A0N,${profile.specimenFont},${profile.specimenFont}^FD${formatted.specimenNumber}^FS
^FO${x},${profile.nameY}^A0N,${profile.nameFont},${profile.nameFont}^FB${w},${profile.nameMaxLines},${profile.nameLineSpacing},L,0^FD${formatted.patientName}^FS
^FO${x},${profile.routingY}^A0N,${profile.routingFont},${profile.routingFont}^FB${w},1,0,L,0^FD${formatted.routingLine}^FS
^FO${x},${profile.barcodeY}^BY1.5,2,${profile.barcodeHeight}^BCN,${profile.barcodeHeight},Y,N,N^FD${formatted.barcode}^FS
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
    specimenNumber: formatted.specimenNumber,
    patientName: formatted.patientName,
    barcode: formatted.barcode,
    dateOfBirth: formatted.dateOfBirth,
    orderedTests: formatted.orderedTests,
    specimenType: formatted.specimenType,
    departmentLabel: formatted.departmentLabel,
    routingLine: formatted.routingLine,
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
