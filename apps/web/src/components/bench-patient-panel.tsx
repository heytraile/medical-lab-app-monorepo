import { useEffect, useMemo, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import {
  getCatalogDisplayName,
  getTestResultRequirement,
  missingManualResultRequirements,
} from "@drax-lis/catalog";
import {
  api,
  type BenchPatientSummary,
  type BenchResult,
} from "../lib/api";
import { orderedTestsForPatient } from "../lib/ordered-tests";
import { analyzerLabel } from "../lib/analyzers";
import {
  AlarmSign,
  FlagChip,
  WorkflowStatusChip,
  flagBarColor,
  flagValueClass,
} from "./result-status";
import { ScrollContainer } from "./ui/scroll-container";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { PatientReportExportMenu } from "./patient-report-export-menu";
import { SubmitForReleaseButton } from "./submit-for-release-button";
import { RecallFromReleaseButton } from "./recall-from-release-button";
import { summarizeGroup } from "./bench-group-row";
import { ManualResultEntryButton } from "./manual-result-entry";
import { cn } from "../lib/utils";
import {
  canEditManualResult,
  manualAccessionAccess,
} from "../lib/manual-results";
import { usePatientNameOrder } from "../lib/patient-name-order";
import {
  actorName,
  formatAttributionTime,
} from "../lib/result-attribution";

function Field({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 gap-x-2 gap-y-0.5 py-1.5 text-sm sm:grid-cols-[6.5rem_1fr]">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-foreground">{value}</dd>
    </div>
  );
}

function originLabel(origin: string | undefined) {
  if (origin === "local_provisional") return "Registered here";
  if (origin === "upstream") return "Main registry";
  return origin ?? "—";
}

function fulfillmentBadgeLabel(code: string): string | null {
  const workflow = getTestResultRequirement(code).workflow;
  if (workflow === "manual_only") return "Manual";
  if (workflow === "send_out") return "Send-out";
  if (workflow === "hybrid") return "Hybrid";
  return null;
}

function ManualAttribution({ result }: { result: BenchResult }) {
  if (result.analyzerId !== "manual") return null;
  return (
    <div className="text-xs text-muted-foreground">
      <p>
        Entered by {actorName(result.manualEnteredBySnapshot)} ·{" "}
        {formatAttributionTime(result.manualEnteredAt)}
      </p>
      {result.manualLastEditedAt ? (
        <p>
          Last edited by {actorName(result.manualLastEditedBySnapshot)} ·{" "}
          {formatAttributionTime(result.manualLastEditedAt)}
        </p>
      ) : null}
    </div>
  );
}

export function BenchPatientPanel({
  patientId,
  summary,
  results,
  onClose,
  embedded = false,
  className,
}: {
  patientId: string;
  summary: BenchPatientSummary | null;
  results: BenchResult[];
  onClose: () => void;
  /** Inside a sheet, which supplies its own frame, height and Escape handling. */
  embedded?: boolean;
  className?: string;
}) {
  const { formatName } = usePatientNameOrder();
  const detailQ = useQuery({
    queryKey: ["patient", patientId],
    queryFn: () => api.patient(patientId),
  });

  const specimensQ = useQuery({
    queryKey: ["specimens"],
    queryFn: () => api.specimens(),
  });

  const orderedByAccession = orderedTestsForPatient(
    specimensQ.data ?? [],
    patientId,
  );

  const p = detailQ.data;
  const nameSource = p ?? summary;
  const displayName = nameSource
    ? formatName({
        displayName: nameSource.displayName,
        firstName: nameSource.firstName,
        lastName: nameSource.lastName,
      })
    : "Patient";
  const mrn = p?.mrn ?? summary?.mrn ?? "—";

  useEffect(() => {
    if (embedded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, embedded]);

  const sorted = [...results].sort(
    (a, b) =>
      new Date(b.observedAt).getTime() - new Date(a.observedAt).getTime(),
  );

  const accessionSummaryByNumber = useMemo(() => {
    const accessionNumbers = new Set([
      ...orderedByAccession.map((row) => row.accessionNumber),
      ...results.map((result) => result.accessionNumber),
    ]);
    return new Map(
      [...accessionNumbers].map((number) => {
        const accessionResults = results.filter(
          (result) => result.accessionNumber === number,
        );
        return [
          number,
          summarizeGroup(
            `acc:${number}`,
            accessionResults,
            specimensQ.data ?? [],
            accessionResults,
          ),
        ];
      }),
    );
  }, [orderedByAccession, results, specimensQ.data]);
  const editableAccessionNumbers = useMemo(
    () =>
      new Set(
        [...new Set(results.map((result) => result.accessionNumber))].filter(
          (accessionNumber) =>
            manualAccessionAccess(
              results.filter(
                (result) => result.accessionNumber === accessionNumber,
              ),
            ) === "editable",
        ),
      ),
    [results],
  );

  const pendingManualByAccession = useMemo(() => {
    return orderedByAccession
      .map((row) => {
        const orderedCodes = row.tests.map((t) => t.code);
        const pending = missingManualResultRequirements(
          orderedCodes,
          results.filter(
            (result) => result.accessionNumber === row.accessionNumber,
          ),
        );
        return {
          accessionNumber: row.accessionNumber,
          pending,
          access: manualAccessionAccess(
            results.filter(
              (result) => result.accessionNumber === row.accessionNumber,
            ),
          ),
        };
      })
      .filter((row) => row.pending.length > 0);
  }, [orderedByAccession, results]);

  return (
    <aside
      className={cn(
        "flex min-h-0 flex-col overflow-hidden bg-card",
        embedded
          ? "h-full flex-1"
          : "h-full max-h-[calc(100svh-7rem)] rounded-xl border border-border shadow-sm",
        className,
      )}
    >
      <div className="flex shrink-0 items-start justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Patient focus
          </p>
          <h3 className="font-display text-lg font-semibold leading-snug tracking-tight whitespace-normal">
            {displayName}
          </h3>
          <p className="mt-0.5 font-mono text-xs tracking-tight text-muted-foreground">
            {mrn}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={onClose}
            aria-label="Close patient panel"
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>

      <div className="shrink-0 border-b border-border px-4 py-3">
        {detailQ.isLoading && !summary && (
          <p className="text-sm text-muted-foreground">Loading identity…</p>
        )}
        {detailQ.isError && !summary && (
          <p className="text-sm text-lab-danger">Could not load patient.</p>
        )}
        <dl className="divide-y divide-border/60">
            <Field
              label="Date of birth"
              value={p?.dateOfBirth ?? summary?.dateOfBirth ?? "—"}
            />
            <Field label="Sex" value={p?.sex ?? summary?.sex ?? "—"} />
            <Field
              label="Status"
              value={
                <Badge
                  variant={
                    (p?.status ?? summary?.status) === "quarantined"
                      ? "danger"
                      : "muted"
                  }
                >
                  {p?.status ?? summary?.status ?? "—"}
                </Badge>
              }
            />
            <Field
              label="Identity"
              value={
                <span className="inline-flex flex-wrap items-center gap-1.5">
                  {originLabel(p?.identityOrigin ?? summary?.identityOrigin)}
                  {(p?.identityOrigin ?? summary?.identityOrigin) ===
                    "local_provisional" && (
                    <Badge variant="warn" className="px-1 py-0 text-[10px]">
                      Provisional
                    </Badge>
                  )}
                  {p?.requiresIdentityConfirmation && (
                    <Badge variant="warn" className="px-1 py-0 text-[10px]">
                      Suspect
                    </Badge>
                  )}
                </span>
              }
            />
          </dl>

          {p && p.siblings.length > 0 && (
            <div className="mt-3 rounded-lg border border-amber-500/25 bg-amber-500/5 px-2.5 py-2">
              <p className="text-[10px] font-medium uppercase tracking-wider text-amber-900 dark:text-amber-200">
                Suspect siblings
              </p>
              <ul className="mt-1.5 space-y-1">
                {p.siblings.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-baseline justify-between gap-2 text-xs"
                  >
                    <span>{s.displayName}</span>
                    <span className="font-mono text-muted-foreground">
                      {s.mrn}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

      </div>

        {orderedByAccession.length > 0 && (
          <div className="shrink-0 border-b border-border px-4 py-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Ordered tests
            </p>
            <ul className="space-y-3">
              {orderedByAccession.map((row) => {
                const accessionSummary = accessionSummaryByNumber.get(
                  row.accessionNumber,
                );
                return (
                <li key={row.accessionNumber}>
                  <Link
                    to="/orders"
                    search={{ accession: row.accessionNumber }}
                    className="font-mono text-sm text-primary hover:underline"
                  >
                    {row.accessionNumber}
                  </Link>
                  <ul className="mt-1 space-y-0.5 text-sm text-muted-foreground">
                    {row.tests.map((t) => {
                      const badge = fulfillmentBadgeLabel(t.code);
                      return (
                      <li key={`${row.accessionNumber}-${t.code}`}>
                        <span className="font-mono text-xs">{t.code}</span>{" "}
                        {t.name ?? t.code}
                        {badge ? (
                          <Badge variant="muted" className="ml-1.5 px-1 py-0 text-[10px]">
                            {badge}
                          </Badge>
                        ) : null}
                      </li>
                    );
                    })}
                  </ul>
                  {accessionSummary ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {accessionSummary.allReleased &&
                      accessionSummary.missingExpectedCount > 0 ? (
                        <Badge variant="warn">Released incomplete</Badge>
                      ) : (
                        <SubmitForReleaseButton summary={accessionSummary} />
                      )}
                      <RecallFromReleaseButton summary={accessionSummary} />
                      <PatientReportExportMenu
                        patientId={patientId}
                        patientLabel={displayName}
                        accessionNumber={row.accessionNumber}
                        releaseEligible={accessionSummary.allReleased}
                        variant="outline"
                        size="sm"
                      />
                    </div>
                  ) : null}
                </li>
                );
              })}
            </ul>
          </div>
        )}

        {pendingManualByAccession.length > 0 && (
          <div className="shrink-0 border-b border-border px-4 py-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Awaiting manual result
            </p>
            <ul className="space-y-3">
              {pendingManualByAccession.map((row) => (
                <li key={row.accessionNumber}>
                  <Link
                    to="/orders"
                    search={{ accession: row.accessionNumber }}
                    className="font-mono text-sm text-primary hover:underline"
                  >
                    {row.accessionNumber}
                  </Link>
                  <ul className="mt-1.5 space-y-2">
                    {row.pending.map((t) => (
                      <li
                        key={`${row.accessionNumber}-${t.orderedTestCode}-${t.componentCode}`}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-500/25 bg-amber-500/5 px-2 py-1.5"
                      >
                        <div className="min-w-0 text-sm">
                          <span className="font-mono text-xs">
                            {t.orderedTestCode}
                          </span>{" "}
                          <span className="text-foreground">
                            {t.orderedTestName}
                            {t.componentName !== "Manual result"
                              ? ` — ${t.componentName}`
                              : ""}
                          </span>
                          <Badge
                            variant="warn"
                            className="ml-1.5 px-1 py-0 text-[10px]"
                          >
                            {t.workflow === "send_out"
                              ? "Send-out"
                              : t.workflow === "hybrid"
                                ? "Hybrid · manual"
                                : "Manual"}
                          </Badge>
                        </div>
                        {row.access === "editable" ? (
                          <ManualResultEntryButton
                            accessionNumber={row.accessionNumber}
                            testCode={t.orderedTestCode}
                            testName={t.orderedTestName}
                            resultComponentCode={t.componentCode}
                            resultComponentName={t.componentName}
                          />
                        ) : (
                          <Badge
                            variant={row.access === "released" ? "muted" : "warn"}
                          >
                            {row.access === "released"
                              ? "Not resulted before release"
                              : "Locked while awaiting authorization"}
                          </Badge>
                        )}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </div>
        )}

      <ScrollContainer className="min-h-0 flex-1">
        <div className="px-4 py-3">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              All results
            </p>
            <span className="text-[11px] text-muted-foreground">
              {sorted.length} test{sorted.length === 1 ? "" : "s"}
            </span>
          </div>

          {sorted.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No results for this patient in the current load.
            </p>
          ) : (
            <ul className="space-y-2">
              {sorted.map((r) => {
                const ctx = {
                  value: r.value,
                  referenceLow: r.referenceLow,
                  referenceHigh: r.referenceHigh,
                };
                return (
                  <li
                    key={r.id}
                    className="rounded-lg border border-border p-2.5"
                    style={{
                      boxShadow: `inset 3px 0 0 0 ${flagBarColor(r.flag, ctx)}`,
                    }}
                  >
                    <div className="flex items-baseline justify-between gap-2 pl-1">
                      <span className="min-w-0 break-words text-base font-medium">
                        {r.testCode}
                      </span>
                      <span className="shrink-0 text-lg font-semibold tabular-nums">
                        <span className={flagValueClass(r.flag, ctx)}>
                          {r.value}
                        </span>
                        {r.units ? (
                          <span className="ml-1 text-sm font-medium text-muted-foreground">
                            {r.units}
                          </span>
                        ) : null}
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-1">
                      <AlarmSign flag={r.flag} ctx={ctx} />
                      <FlagChip
                        flag={r.flag}
                        value={r.value}
                        referenceLow={r.referenceLow}
                        referenceHigh={r.referenceHigh}
                      />
                      <WorkflowStatusChip
                        status={r.status ?? "pending_review"}
                      />
                    </div>
                    <p className="mt-1.5 pl-1 text-sm leading-snug text-muted-foreground">
                      <span className="font-mono text-xs tracking-tight text-foreground/80">
                        {r.accessionNumber}
                      </span>
                      <span aria-hidden="true"> · </span>
                      {analyzerLabel(r.analyzerId)}
                      <span aria-hidden="true"> · </span>
                      <span className="font-medium tabular-nums text-foreground/85">
                        {new Date(r.observedAt).toLocaleString()}
                      </span>
                    </p>
                    <div className="mt-1 pl-1">
                      <ManualAttribution result={r} />
                    </div>
                    {canEditManualResult(r) &&
                    editableAccessionNumbers.has(r.accessionNumber) ? (
                      <div className="mt-2 pl-1">
                        <ManualResultEntryButton
                          accessionNumber={r.accessionNumber}
                          testCode={r.orderedTestCode ?? r.testCode}
                          testName={r.testName ?? r.testCode}
                          resultComponentCode={
                            r.resultComponentCode ?? undefined
                          }
                          resultId={r.id}
                          existingResult={{
                            value: r.value,
                            units: r.units,
                            flag: r.flag,
                            referenceLow: r.referenceLow,
                            referenceHigh: r.referenceHigh,
                          }}
                        />
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}

          <p className="mt-2 text-[11px] text-muted-foreground">
            Showing every loaded result for this patient (all tabs / filters).
          </p>
        </div>
      </ScrollContainer>
    </aside>
  );
}
