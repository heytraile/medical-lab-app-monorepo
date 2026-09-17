import type { ReleaseQueueGroup } from "@drax-lis/contracts";
import { usePatientNameOrder } from "../lib/patient-name-order";
import { cn } from "../lib/utils";
import { PatientReportExportMenu } from "./patient-report-export-menu";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { AlarmSign, FlagChip, isAlarmFlag, isCriticalFlag } from "./result-status";
import {
  CriticalPulse,
  CriticalUrgencyMark,
} from "./critical-urgency";

type Props = {
  group: ReleaseQueueGroup;
  selected: boolean;
  onSelect: () => void;
  canRelease: boolean;
  releasingAccession: string | null;
  onReleaseAccession: (accessionNumber: string) => void;
  returningAccession: string | null;
  onReturnToBench: () => void;
  dismissingAccession: string | null;
  onDismissFromQueue: () => void;
  actionPending: boolean;
};

export function ReleaseQueueListItem({
  group,
  selected,
  onSelect,
  canRelease,
  releasingAccession,
  onReleaseAccession,
  returningAccession,
  onReturnToBench,
  dismissingAccession,
  onDismissFromQueue,
  actionPending,
}: Props) {
  const { formatName } = usePatientNameOrder();
  const parts = group.patient.displayName.trim().split(/\s+/);
  const patientName = formatName({
    displayName: group.patient.displayName,
    firstName: parts[0],
    lastName: parts.length > 1 ? parts[parts.length - 1] : undefined,
  });
  const isPending = group.queuePhase === "pending_authorization";
  const isReleasing = releasingAccession === group.accessionNumber;
  const isReturning = returningAccession === group.accessionNumber;
  const isDismissing = dismissingAccession === group.accessionNumber;
  const patientId = group.patient.edgePatientId;
  const critical =
    group.hasCritical || isCriticalFlag(group.worstFlag);
  const alarm = group.hasAlarm || isAlarmFlag(group.worstFlag);

  return (
    <li
      className={cn(
        "relative rounded-lg border bg-card transition-colors",
        selected
          ? "border-accent ring-1 ring-accent/30"
          : "border-border hover:border-border/80",
        alarm && "border-l-[3px] border-l-lab-alarm",
      )}
    >
      {critical ? (
        <span
          className="pointer-events-none absolute inset-0 animate-alarm-ring rounded-lg bg-lab-danger/30"
          aria-hidden
        />
      ) : null}
      <button
        type="button"
        onClick={onSelect}
        className="relative w-full px-3 py-3 text-left"
      >
        <div className="space-y-1">
          <p className="font-display text-sm font-semibold tracking-tight sm:text-base">
            {patientName}
          </p>
          <p className="font-mono text-[10px] text-muted-foreground">
            {group.patient.mrn} · {group.accessionNumber}
          </p>
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            {!isPending ? (
              <Badge variant="ok" className="text-[10px]">
                Released
              </Badge>
            ) : null}
            {group.worstFlag && group.worstFlag !== "normal" ? (
              <>
                <AlarmSign flag={group.worstFlag} />
                <FlagChip flag={group.worstFlag} />
              </>
            ) : null}
            <Badge variant="muted" className="text-[10px]">
              {group.testCount} {group.testCount === 1 ? "test" : "tests"}
            </Badge>
            {group.submittedIncomplete ? (
              <Badge variant="warn" className="text-[10px]">
                Incomplete order · {group.missingExpectedResults.length} missing
              </Badge>
            ) : null}
          </div>
          {critical ? (
            <CriticalUrgencyMark
              phase={isPending ? "authorize" : "send"}
              className="pt-1"
            />
          ) : null}
        </div>
      </button>

      {canRelease && isPending ? (
        <div
          className="relative flex flex-wrap gap-2 border-t border-border/60 px-3 py-2"
          onClick={(e) => e.stopPropagation()}
        >
          <Button
            variant="outline"
            size="sm"
            className="h-8 flex-1 border-destructive/40 text-destructive hover:bg-destructive/10"
            disabled={actionPending}
            onClick={onReturnToBench}
          >
            {isReturning ? "Returning…" : "Return"}
          </Button>
          <CriticalPulse active={critical} className="flex-1">
            <Button
              size="sm"
              className={cn(
                "h-8 w-full",
                critical &&
                  "border-lab-alarm bg-lab-alarm text-white hover:bg-lab-alarm/90",
              )}
              disabled={actionPending}
              onClick={() => onReleaseAccession(group.accessionNumber)}
            >
              {isReleasing
                ? "Releasing…"
                : critical
                  ? "Authorize now"
                  : "Release"}
            </Button>
          </CriticalPulse>
        </div>
      ) : null}

      {canRelease && !isPending ? (
        <div
          className="relative flex flex-col gap-2 border-t border-border/60 px-3 py-2"
          onClick={(e) => e.stopPropagation()}
        >
          <CriticalPulse active={critical} className="w-full">
            <PatientReportExportMenu
              patientId={patientId ?? group.accessionNumber}
              patientLabel={patientName}
              accessionNumber={group.accessionNumber}
              releaseEligible
              urgent={critical}
              variant="default"
              size="sm"
              className="w-full"
            />
          </CriticalPulse>
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-full"
            disabled={actionPending}
            onClick={onDismissFromQueue}
          >
            {isDismissing ? "Removing…" : "Remove from queue"}
          </Button>
        </div>
      ) : null}
    </li>
  );
}
