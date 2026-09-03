import { pdf } from "@react-pdf/renderer";
import type {
  PatientReportPayload,
  ReportPageSize,
} from "@drax-lis/contracts";
import { PatientReportDocument } from "./patient-report-document";
import { reportFilename } from "./format-reference-range";

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function downloadPatientReportPdf(
  payload: PatientReportPayload,
  pageSize: ReportPageSize,
): Promise<void> {
  const doc = (
    <PatientReportDocument payload={payload} pageSize={pageSize} />
  );
  const blob = await pdf(doc).toBlob();
  triggerDownload(blob, reportFilename(payload.patient.mrn, "pdf"));
}

export function downloadPatientReportJson(
  payload: PatientReportPayload,
): void {
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  triggerDownload(blob, reportFilename(payload.patient.mrn, "json"));
}

export class PatientReportExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PatientReportExportError";
  }
}

export function assertReportHasResults(payload: PatientReportPayload): void {
  if (payload.summary.resultCount === 0) {
    throw new PatientReportExportError(
      "No released results for this patient yet. Release results on the Release screen first.",
    );
  }
}
