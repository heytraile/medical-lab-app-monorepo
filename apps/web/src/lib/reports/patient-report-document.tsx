import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import type {
  PatientReportPayload,
  ReportPageSize,
} from "@drax-lis/contracts";
import {
  flagLabel,
  formatDob,
  formatReferenceRange,
  formatReportDate,
} from "./format-reference-range";

const ACCENT = "#0d9488";
const MUTED = "#64748b";
const BORDER = "#e2e8f0";
const FLAG_HIGH = "#b45309";
const FLAG_LOW = "#2563eb";
const FLAG_CRIT = "#b91c1c";

const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 52,
    paddingHorizontal: 40,
    fontFamily: "Helvetica",
    fontSize: 9,
    color: "#0f172a",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  logoBox: {
    width: 72,
    height: 72,
    borderWidth: 1,
    borderColor: BORDER,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f8fafc",
  },
  logoImage: {
    width: 72,
    height: 72,
    objectFit: "contain",
  },
  logoPlaceholderText: {
    fontSize: 8,
    color: MUTED,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  labBlock: {
    flex: 1,
    marginLeft: 16,
    alignItems: "flex-end",
  },
  labName: {
    fontFamily: "Helvetica-Bold",
    fontSize: 14,
    color: ACCENT,
    marginBottom: 4,
    textAlign: "right",
  },
  contactLine: {
    fontSize: 8,
    color: MUTED,
    textAlign: "right",
    marginBottom: 2,
  },
  rule: {
    height: 2,
    backgroundColor: ACCENT,
    marginBottom: 16,
  },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 12,
  },
  reportTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 18,
    letterSpacing: 0.5,
  },
  generated: {
    fontSize: 8,
    color: MUTED,
    textAlign: "right",
  },
  patientCard: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 4,
    padding: 12,
    marginBottom: 18,
    backgroundColor: "#f8fafc",
  },
  patientName: {
    fontFamily: "Helvetica-Bold",
    fontSize: 13,
    marginBottom: 6,
  },
  patientMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  metaItem: {
    marginRight: 16,
  },
  metaLabel: {
    fontSize: 7,
    color: MUTED,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  metaValue: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
  },
  accessionBlock: {
    marginBottom: 16,
  },
  accessionHeader: {
    backgroundColor: ACCENT,
    color: "#ffffff",
    paddingVertical: 6,
    paddingHorizontal: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 0,
  },
  accessionTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
  },
  accessionMeta: {
    fontSize: 8,
    color: "#ecfdf5",
  },
  orderedLine: {
    fontSize: 8,
    color: MUTED,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#ffffff",
  },
  table: {
    borderWidth: 1,
    borderColor: BORDER,
    borderTopWidth: 0,
  },
  tableHead: {
    flexDirection: "row",
    backgroundColor: "#f1f5f9",
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    paddingVertical: 5,
    paddingHorizontal: 8,
    alignItems: "center",
  },
  colTest: { width: "32%" },
  colResult: { width: "14%", fontFamily: "Helvetica-Bold" },
  colUnits: { width: "14%", color: MUTED },
  colRef: { width: "22%", color: MUTED, fontSize: 8 },
  colFlag: { width: "10%", textAlign: "center" },
  colObserved: { width: "18%", fontSize: 7, color: MUTED },
  headText: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    color: MUTED,
  },
  emptyState: {
    padding: 24,
    textAlign: "center",
    color: MUTED,
    fontSize: 11,
  },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 40,
    right: 40,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  footerDisclaimer: {
    fontSize: 7,
    color: MUTED,
    maxWidth: "75%",
    lineHeight: 1.4,
  },
  footerPage: {
    fontSize: 8,
    color: MUTED,
  },
  releasedNote: {
    fontSize: 7,
    color: ACCENT,
    marginTop: 4,
    fontFamily: "Helvetica-Bold",
  },
});

function FlagCell({ flag }: { flag: string }) {
  let color = MUTED;
  if (flag === "high") color = FLAG_HIGH;
  if (flag === "low") color = FLAG_LOW;
  if (flag.startsWith("critical")) color = FLAG_CRIT;
  return (
    <Text style={[styles.colFlag, { color, fontFamily: "Helvetica-Bold" }]}>
      {flagLabel(flag)}
    </Text>
  );
}

function LabHeader({ payload }: { payload: PatientReportPayload }) {
  const { lab } = payload;
  return (
    <>
      <View style={styles.header}>
        {lab.logoUrl ? (
          <Image src={lab.logoUrl} style={styles.logoImage} />
        ) : (
          <View style={styles.logoBox}>
            <Text style={styles.logoPlaceholderText}>Logo</Text>
          </View>
        )}
        <View style={styles.labBlock}>
          <Text style={styles.labName}>{lab.name}</Text>
          {lab.addressLines.map((line) => (
            <Text key={line} style={styles.contactLine}>
              {line}
            </Text>
          ))}
          {lab.phone ? (
            <Text style={styles.contactLine}>Tel: {lab.phone}</Text>
          ) : null}
          {lab.email ? (
            <Text style={styles.contactLine}>{lab.email}</Text>
          ) : null}
          {lab.website ? (
            <Text style={styles.contactLine}>{lab.website}</Text>
          ) : null}
        </View>
      </View>
      <View style={styles.rule} />
    </>
  );
}

function PatientSection({ payload }: { payload: PatientReportPayload }) {
  const { patient, generatedAt } = payload;
  return (
    <>
      <View style={styles.titleRow}>
        <Text style={styles.reportTitle}>Laboratory Report</Text>
        <View>
          <Text style={styles.generated}>
            Generated {formatReportDate(generatedAt)}
          </Text>
          <Text style={styles.releasedNote}>Released results only</Text>
        </View>
      </View>
      <View style={styles.patientCard}>
        <Text style={styles.patientName}>{patient.displayName}</Text>
        <View style={styles.patientMeta}>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>MRN</Text>
            <Text style={styles.metaValue}>{patient.mrn}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Date of birth</Text>
            <Text style={styles.metaValue}>{formatDob(patient.dateOfBirth)}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Sex</Text>
            <Text style={styles.metaValue}>{patient.sex ?? "—"}</Text>
          </View>
        </View>
      </View>
    </>
  );
}

function AccessionSection({
  accession,
}: {
  accession: PatientReportPayload["accessions"][number];
}) {
  const ordered =
    accession.orderedTests.length > 0
      ? accession.orderedTests.map((t) => t.name ?? t.code).join(", ")
      : null;

  return (
    <View style={styles.accessionBlock} wrap={false}>
      <View style={styles.accessionHeader}>
        <Text style={styles.accessionTitle}>
          Accession {accession.accessionNumber}
        </Text>
        <Text style={styles.accessionMeta}>
          {accession.specimenType ?? "Specimen"} ·{" "}
          {accession.registeredAt
            ? formatReportDate(accession.registeredAt)
            : "—"}
        </Text>
      </View>
      {ordered ? (
        <Text style={styles.orderedLine}>Ordered: {ordered}</Text>
      ) : null}
      <View style={styles.table}>
        <View style={styles.tableHead}>
          <Text style={[styles.colTest, styles.headText]}>Test</Text>
          <Text style={[styles.colResult, styles.headText]}>Result</Text>
          <Text style={[styles.colUnits, styles.headText]}>Units</Text>
          <Text style={[styles.colRef, styles.headText]}>Reference</Text>
          <Text style={[styles.colFlag, styles.headText]}>Flag</Text>
          <Text style={[styles.colObserved, styles.headText]}>Observed</Text>
        </View>
        {accession.results.map((r) => (
          <View key={`${r.testCode}-${r.observedAt}`} style={styles.tableRow}>
            <Text style={styles.colTest}>{r.testName ?? r.testCode}</Text>
            <Text style={styles.colResult}>{r.value}</Text>
            <Text style={styles.colUnits}>{r.units ?? "—"}</Text>
            <Text style={styles.colRef}>
              {formatReferenceRange(r.referenceLow, r.referenceHigh)}
            </Text>
            <FlagCell flag={r.flag} />
            <Text style={styles.colObserved}>
              {formatReportDate(r.observedAt)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function PageFooter({ disclaimer }: { disclaimer?: string | null }) {
  return (
    <View style={styles.footer} fixed>
      <Text style={styles.footerDisclaimer}>{disclaimer ?? ""}</Text>
      <Text
        style={styles.footerPage}
        render={({ pageNumber, totalPages }) =>
          `Page ${pageNumber} of ${totalPages}`
        }
      />
    </View>
  );
}

export function PatientReportDocument({
  payload,
  pageSize,
}: {
  payload: PatientReportPayload;
  pageSize: ReportPageSize;
}) {
  const pdfPageSize = pageSize === "legal" ? "LEGAL" : "LETTER";

  return (
    <Document
      title={`Lab Report — ${payload.patient.displayName}`}
      author={payload.lab.name}
    >
      <Page size={pdfPageSize} style={styles.page}>
        <LabHeader payload={payload} />
        <PatientSection payload={payload} />

        {payload.accessions.length === 0 ? (
          <Text style={styles.emptyState}>
            No released results on file for this patient.
          </Text>
        ) : (
          payload.accessions.map((acc) => (
            <AccessionSection key={acc.accessionNumber} accession={acc} />
          ))
        )}

        <PageFooter disclaimer={payload.lab.disclaimer} />
      </Page>
    </Document>
  );
}
