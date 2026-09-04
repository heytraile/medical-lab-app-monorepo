import type { MouseEvent } from "react";
import { ChevronRight } from "lucide-react";
import type { BenchResult } from "../lib/api";
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
};

/** Roll a group's leaf results into the counts a collapsed header must show. */
export function summarizeGroup(
  key: string,
  results: BenchResult[],
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
  return {
    key,
    patient: results.find((r) => r.patient)?.patient ?? null,
    fallbackLabel: results[0]?.accessionNumber ?? "Unknown specimen",
    testCount: results.length,
    accessionCount: accessions.size,
    pendingCount: results.filter(
      (r) => (r.status ?? "pending_review") === "pending_review",
    ).length,
    submittedCount: results.filter(
      (r) => r.status === "pending_authorization",
    ).length,
    releasedCount: results.filter((r) => r.status === "released").length,
    allReleased:
      results.length > 0 &&
      results.every((r) => r.status === "released"),
    worstFlag: worst,
    latestObservedAt: latest,
    hasAlarm: isAlarmFlag(worst),
    accessionNumbers: [...accessions].sort(),
    testCodes: [...new Set(results.map((r) => r.testCode))].sort(),
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
  selected,
  onToggle,
  onSelectPatient,
  onJumpToFlag,
}: {
  summary: BenchGroupSummary;
  expanded: boolean;
  /** Every other patient sits a shade lighter, on top of the block gaps. */
  alternate: boolean;
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

  const workflowStatus = summary.allReleased
    ? "released"
    : summary.submittedCount > 0 && summary.pendingCount === 0
      ? "pending_authorization"
      : null;

  const cellClass = "px-3 py-3.5 align-middle";

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
      <td className={cn(cellClass, "min-w-[18rem] w-[22%] align-top")}>
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
                    "rounded-md px-2 py-1 text-left text-base font-bold leading-snug tracking-tight whitespace-nowrap",
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
            </div>
          </div>
        </div>
      </td>

      {/* Observed */}
      <td className={cellClass}>
        <span className="whitespace-nowrap text-sm font-medium tabular-nums text-foreground/85">
          {summary.latestObservedAt
            ? new Date(summary.latestObservedAt).toLocaleString()
            : "—"}
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

      {/* Analyzer */}
      <td className={cellClass}>
        <SummaryPlaceholder />
      </td>

      {/* Test */}
      <td className={cellClass}>
        <span className="text-xs text-muted-foreground">
          {summary.testCount} {summary.testCount === 1 ? "test" : "tests"}
          {summary.pendingCount > 0 && ` · ${summary.pendingCount} pending`}
        </span>
      </td>

      {/* Value */}
      <td className={cellClass}>
        <SummaryPlaceholder />
      </td>

      {/* Units */}
      <td className={cellClass}>
        <SummaryPlaceholder />
      </td>

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
      <td className={cn(cellClass, "min-w-[10rem]")}>
        <div
          className="flex min-w-[9rem] flex-col gap-1.5"
          onClick={stopRowSelect}
          onKeyDown={(e) => e.stopPropagation()}
          role="presentation"
        >
          {workflowStatus ? (
            <WorkflowStatusChip status={workflowStatus} />
          ) : null}
          <div className="flex flex-wrap items-center gap-1.5">
            <SubmitForReleaseButton summary={summary} />
            <RecallFromReleaseButton summary={summary} />
            <NotifyAuthorizerButton summary={summary} />
          </div>
        </div>
      </td>
    </tr>
  );
}
