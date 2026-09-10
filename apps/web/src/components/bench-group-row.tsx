import type { MouseEvent } from "react";
import { ChevronRight } from "lucide-react";
import {
  missingManualResultRequirements,
  type MissingExpectedResult,
} from "@drax-lis/catalog";
import type { BenchResult, SpecimenRow } from "../lib/api";
import { groupSpecimensIntoSessions } from "../lib/accession-sessions";
import { Badge } from "./ui/badge";
import {
  AlarmSign,
  FlagChip,
  WorkflowStatusChip,
  flagLabel,
  isAlarmFlag,
  worstFlag,
} from "./result-status";
import { cn } from "../lib/utils";
import { usePatientNameOrder } from "../lib/patient-name-order";
import { summarizeResultStatuses } from "../lib/result-workflow";
import { NotifyAuthorizerButton } from "./notify-authorizer-button";
import { RecallFromReleaseButton } from "./recall-from-release-button";
import { SubmitForReleaseButton } from "./submit-for-release-button";

export type BenchGroupSummary = {
  /** Stable group key: patient id, or `acc:<accession>` when unlinked. */
  key: string;
  patient: BenchResult["patient"];
  /** Shown instead of a name when no patient is linked to the specimen. */
  fallbackLabel: string;
  testCount: number;
  accessionCount: number;
  pendingCount: number;
  submittedCount: number;
  releasedCount: number;
  allReleased: boolean;
  worstFlag: string | undefined;
  latestObservedAt: string | undefined;
  hasAlarm: boolean;
  /** Payload for a review request: the identifiers the cloud API can store. */
  accessionNumbers: string[];
  testCodes: string[];
  missingExpectedByAccession: Record<string, MissingExpectedResult[]>;
  missingExpectedCount: number;
};

/** Roll a group's leaf results into the counts a collapsed header must show. */
export function summarizeGroup(
  key: string,
  results: BenchResult[],
  specimens: SpecimenRow[] = [],
  completenessResults: BenchResult[] = results,
): BenchGroupSummary {
  const worst = worstFlag(
    results.map((r) => ({
      flag: r.flag,
      value: r.value,
      referenceLow: r.referenceLow,
      referenceHigh: r.referenceHigh,
    })),
  );
  const accessions = new Set(results.map((r) => r.accessionNumber));
  let latest: string | undefined;
  for (const r of results) {
    if (!latest || r.observedAt > latest) latest = r.observedAt;
  }
  const missingExpectedByAccession: Record<string, MissingExpectedResult[]> = {};
  for (const accessionNumber of accessions) {
    const tubesForAccession = specimens.filter(
      (row) => row.accessionNumber === accessionNumber,
    );
    const session = groupSpecimensIntoSessions(tubesForAccession)[0];
    if (!session) continue;
    const orderedCodes = session.orderedTests.map((test) => test.code);
    const missing = missingManualResultRequirements(
      orderedCodes,
      completenessResults.filter(
        (result) => result.accessionNumber === accessionNumber,
      ),
    );
    if (missing.length > 0) {
      missingExpectedByAccession[accessionNumber] = missing;
    }
  }
  const missingExpectedCount = Object.values(
    missingExpectedByAccession,
  ).reduce((total, rows) => total + rows.length, 0);
  const workflow = summarizeResultStatuses(results);
  return {
    key,
    patient: results.find((r) => r.patient)?.patient ?? null,
    fallbackLabel: results[0]?.accessionNumber ?? "Unknown specimen",
    testCount: results.length,
    accessionCount: accessions.size,
    ...workflow,
    worstFlag: worst,
    latestObservedAt: latest,
    hasAlarm: isAlarmFlag(worst),
    accessionNumbers: [...accessions].sort(),
    testCodes: [...new Set(results.map((r) => r.testCode))].sort(),
    missingExpectedByAccession,
    missingExpectedCount,
  };
}

function SummaryPlaceholder() {
  return (
    <span
      className="text-sm text-muted-foreground/50"
      aria-hidden
      title="Expand for test-level details"
    >
      —
    </span>
  );
}

export function BenchGroupRow({
  summary,
  expanded,
  alternate,
  compact = false,
  selected,
  onToggle,
  onSelectPatient,
  onJumpToFlag,
}: {
  summary: BenchGroupSummary;
  expanded: boolean;
  /** Every other patient sits a shade lighter, on top of the block gaps. */
  alternate: boolean;
  /** Tablet landscape: tighter cells, fewer columns. */
  compact?: boolean;
  selected: boolean;
  onToggle: () => void;
  onSelectPatient: (id: string) => void;
  /** Opens the block and scrolls to its first worst-flagged result. */
  onJumpToFlag: () => void;
}) {
  const { formatName } = usePatientNameOrder();
  const { patient } = summary;
  const alarm = summary.hasAlarm;

  function stopRowSelect(e: MouseEvent) {
    e.stopPropagation();
  }

  function openPatient() {
    if (patient) onSelectPatient(patient.id);
  }

  const accessionLabel =
    summary.accessionCount === 1
      ? summary.accessionNumbers[0]
      : `${summary.accessionCount} accessions`;

  const singleAccession = summary.accessionCount === 1;
  const workflowStatus = singleAccession
    ? summary.allReleased
      ? "released"
      : summary.submittedCount > 0 && summary.pendingCount === 0
        ? "pending_authorization"
        : null
    : null;

  const cellClass = compact
    ? "px-2 py-2 align-middle"
    : "px-3 py-3.5 align-middle";

  const observedLabel = summary.latestObservedAt
    ? compact
      ? new Date(summary.latestObservedAt).toLocaleString(undefined, {
          month: "numeric",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })
      : new Date(summary.latestObservedAt).toLocaleString()
    : "—";

  const collapsedNamePillBg = alternate
    ? "bg-white shadow-sm ring-1 ring-black/5 dark:bg-card dark:shadow-none dark:ring-border/50"
    : "bg-muted";

  return (
    <tr
      data-row-kind="summary"
      onClick={patient ? openPatient : undefined}
      onKeyDown={
        patient
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                openPatient();
              }
            }
          : undefined
      }
      tabIndex={patient ? 0 : undefined}
      role={patient ? "button" : undefined}
      aria-label={
        patient
          ? `Open ${formatName(patient)} in patient panel`
          : undefined
      }
      className={cn(
        "border-y border-border transition-colors",
        expanded
          ? "border-b-2 bg-sky-200 hover:bg-sky-300 dark:bg-sky-900/50 dark:hover:bg-sky-900/65"
          : cn(
              "hover:bg-lab-ok/10 dark:hover:bg-lab-ok/20",
              alternate ? "bg-background" : "bg-card",
            ),
        alarm && "border-l-[3px] border-l-lab-alarm",
        patient && "cursor-pointer",
        selected && "ring-1 ring-inset ring-accent/25",
      )}
    >
      {/* Patient */}
      <td
        className={cn(
          cellClass,
          compact ? "w-[26%] align-top" : "min-w-[18rem] w-[22%] align-top",
        )}
      >
        <div className="flex items-start gap-x-1.5">
          <button
            type="button"
            onClick={(e) => {
              stopRowSelect(e);
              onToggle();
            }}
            aria-expanded={expanded}
            aria-label={
              expanded
                ? `Collapse ${patient?.displayName ?? summary.fallbackLabel}`
                : `Expand ${patient?.displayName ?? summary.fallbackLabel}`
            }
            className="-my-1 shrink-0 rounded p-1 transition-colors hover:bg-muted"
          >
            <ChevronRight
              className={cn(
                "size-5 transition-transform",
                expanded && "rotate-90",
              )}
              strokeWidth={2.5}
              aria-hidden
            />
          </button>

          <div className="min-w-0 space-y-1">
            <div className="flex items-start gap-1.5">
              <AlarmSign flag={summary.worstFlag} />
              {patient ? (
                <span
                  className={cn(
                    "rounded-md px-2 py-1 text-left font-bold leading-snug tracking-tight whitespace-nowrap",
                    compact ? "text-sm" : "text-base",
                    expanded
                      ? "bg-white/75 dark:bg-sky-950/70 dark:text-foreground"
                      : collapsedNamePillBg,
                    selected && "text-accent",
                  )}
                >
                  {formatName(patient)}
                </span>
              ) : (
                <span
                  className={cn(
                    "rounded-md px-2 py-1 font-mono text-sm font-bold leading-snug tracking-tight whitespace-nowrap",
                    expanded
                      ? "bg-white/75 dark:bg-sky-950/70 dark:text-foreground"
                      : collapsedNamePillBg,
                  )}
                  title={summary.fallbackLabel}
                >
                  {summary.fallbackLabel}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 pl-0.5">
              {patient ? (
                <span className="font-mono text-[11px] tracking-tight text-muted-foreground">
                  {patient.mrn}
                </span>
              ) : (
                <Badge variant="muted" className="px-1 py-0 text-[10px]">
                  No patient linked
                </Badge>
              )}
              {patient?.identityOrigin === "local_provisional" && (
                <Badge variant="warn" className="px-1 py-0 text-[10px]">
                  Provisional
                </Badge>
              )}
              {patient?.status === "quarantined" && (
                <Badge variant="danger" className="px-1 py-0 text-[10px]">
                  Quarantined
                </Badge>
              )}
              {summary.missingExpectedCount > 0 && !summary.allReleased && (
                <Badge variant="warn" className="px-1 py-0 text-xs">
                  {summary.missingExpectedCount} manual pending
                </Badge>
              )}
              {summary.allReleased && summary.missingExpectedCount > 0 && (
                <Badge variant="warn" className="px-1 py-0 text-xs">
                  Released incomplete
                </Badge>
              )}
            </div>
          </div>
        </div>
      </td>

      {/* Observed */}
      <td className={cellClass}>
        <span className="whitespace-nowrap text-xs font-medium tabular-nums text-foreground/85 sm:text-sm">
          {observedLabel}
        </span>
      </td>

      {/* Accession */}
      <td className={cellClass}>
        <span
          className={cn(
            "text-xs tracking-tight",
            summary.accessionCount === 1
              ? "font-mono"
              : "text-muted-foreground",
          )}
        >
          {accessionLabel}
        </span>
      </td>

      {!compact ? (
        <td className={cellClass}>
          <SummaryPlaceholder />
        </td>
      ) : null}

      {/* Test */}
      <td className={cellClass}>
        <span className="text-sm text-muted-foreground">
          {summary.testCount} {summary.testCount === 1 ? "test" : "tests"}
          {summary.pendingCount > 0 && ` · ${summary.pendingCount} pending`}
        </span>
      </td>

      {/* Value */}
      <td className={cellClass}>
        <SummaryPlaceholder />
      </td>

      {!compact ? (
        <td className={cellClass}>
          <SummaryPlaceholder />
        </td>
      ) : null}

      {/* Flag */}
      <td className={cellClass}>
        {summary.worstFlag && summary.worstFlag !== "normal" ? (
          <button
            type="button"
            onClick={(e) => {
              stopRowSelect(e);
              onJumpToFlag();
            }}
            aria-label={`Show first ${flagLabel(summary.worstFlag)} result for ${
              patient?.displayName ?? summary.fallbackLabel
            }`}
            className="rounded-md transition hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <FlagChip flag={summary.worstFlag} />
          </button>
        ) : (
          <SummaryPlaceholder />
        )}
      </td>

      {/* Status + actions */}
      <td className={cn(cellClass, compact ? "min-w-0" : "min-w-[10rem]")}>
        <div
          className={cn(
            "flex flex-col",
            compact ? "min-w-0 gap-1" : "min-w-[9rem] gap-1.5",
          )}
          onClick={stopRowSelect}
          onKeyDown={(e) => e.stopPropagation()}
          role="presentation"
        >
          {workflowStatus ? (
            <WorkflowStatusChip status={workflowStatus} />
          ) : !singleAccession ? (
            <Badge variant="muted">Manage per accession</Badge>
          ) : null}
          <div className="flex flex-wrap items-center gap-1.5">
            {singleAccession ? (
              <>
                <SubmitForReleaseButton summary={summary} />
                <RecallFromReleaseButton summary={summary} />
              </>
            ) : null}
            <NotifyAuthorizerButton summary={summary} />
          </div>
        </div>
      </td>
    </tr>
  );
}
