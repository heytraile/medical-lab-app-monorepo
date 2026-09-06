import type { ReleaseQueueGroup } from "@drax-lis/contracts";
import { usePatientNameOrder } from "../lib/patient-name-order";
import { cn } from "../lib/utils";
import { PatientReportExportMenu } from "./patient-report-export-menu";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { AlarmSign, FlagChip, isAlarmFlag } from "./result-status";

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

  return (
    <li
      className={cn(
        "rounded-lg border bg-card transition-colors",
        selected
          ? "border-accent ring-1 ring-accent/30"
          : "border-border hover:border-border/80",
        group.worstFlag &&
          isAlarmFlag(group.worstFlag) &&
          "border-l-[3px] border-l-lab-alarm",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="w-full px-3 py-3 text-left"
      >
        <div className="space-y-1">
          <p className="font-display text-sm font-semibold tracking-tight sm:text-base">
            {patientName}
          </p>
          <p className="font-mono text-[10px] text-muted-foreground">
            {group.patient.mrn} · {group.accessionNumber}
          </p>
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            {isPending ? (
              <>
                <AlarmSign flag={group.worstFlag} />
                <FlagChip flag={group.worstFlag} />
              </>
            ) : (
              <Badge variant="ok" className="text-[10px]">
                Released
              </Badge>
            )}
            <Badge variant="muted" className="text-[10px]">
              {group.testCount} {group.testCount === 1 ? "test" : "tests"}
            </Badge>
            {group.submittedIncomplete ? (
              <Badge variant="warn" className="text-[10px]">
                Incomplete order · {group.missingExpectedResults.length} missing
              </Badge>
            ) : null}
          </div>
        </div>
      </button>

      {canRelease && isPending ? (
        <div
          className="flex flex-wrap gap-2 border-t border-border/60 px-3 py-2"
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
          <Button
            size="sm"
            className="h-8 flex-1"
            disabled={actionPending}
            onClick={() => onReleaseAccession(group.accessionNumber)}
          >
            {isReleasing ? "Releasing…" : "Release"}
          </Button>
        </div>
      ) : null}

      {canRelease && !isPending ? (
        <div
          className="flex flex-col gap-2 border-t border-border/60 px-3 py-2"
          onClick={(e) => e.stopPropagation()}
        >
          {patientId ? (
            <PatientReportExportMenu
              patientId={patientId}
              patientLabel={patientName}
              accessionNumber={group.accessionNumber}
              releaseEligible
              variant="default"
              size="sm"
              className="w-full"
            />
          ) : (
            <p className="text-xs text-muted-foreground">
              Cannot send report from here — open this patient on the Bench.
            </p>
          )}
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
