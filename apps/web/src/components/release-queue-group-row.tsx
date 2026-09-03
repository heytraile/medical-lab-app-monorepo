import { ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ActorSnapshot, ReleaseQueueGroup } from "@drax-lis/contracts";
import { analyzerLabel } from "../lib/analyzers";
import { usePatientNameOrder } from "../lib/patient-name-order";
import { cn } from "../lib/utils";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { ConfirmAccessionActionDialog } from "./confirm-accession-action-dialog";
import {
  AlarmSign,
  FlagChip,
  flagBarColor,
  flagRowClass,
  flagValueClass,
  isAlarmFlag,
} from "./result-status";

function actorLabel(actor: ActorSnapshot | null | undefined): string | null {
  if (!actor) return null;
  if (actor.fullName?.trim()) return actor.fullName.trim();
  if (actor.email?.trim()) return actor.email.trim();
  return actor.role;
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

type Props = {
  group: ReleaseQueueGroup;
  expanded: boolean;
  onToggle: () => void;
  canRelease: boolean;
  releasingAccession: string | null;
  onReleaseAccession: (accessionNumber: string) => void;
  returningAccession: string | null;
  onReturnToBench: (accessionNumber: string, reason?: string) => void;
  compact?: boolean;
};

export function ReleaseQueueGroupRow({
  group,
  expanded,
  onToggle,
  canRelease,
  releasingAccession,
  onReleaseAccession,
  returningAccession,
  onReturnToBench,
  compact = false,
}: Props) {
  const { formatName } = usePatientNameOrder();
  const [returnDialogOpen, setReturnDialogOpen] = useState(false);
  const wasReturning = useRef(false);
  const parts = group.patient.displayName.trim().split(/\s+/);
  const patientName = formatName({
    displayName: group.patient.displayName,
    firstName: parts[0],
    lastName: parts.length > 1 ? parts[parts.length - 1] : undefined,
  });
  const submitter = actorLabel(group.submittedBy);
  const accessioner = actorLabel(group.accessionedBy);
  const isReleasing = releasingAccession === group.accessionNumber;
  const isReturning = returningAccession === group.accessionNumber;
  const actionPending = releasingAccession !== null || returningAccession !== null;

  useEffect(() => {
    if (isReturning) wasReturning.current = true;
    if (wasReturning.current && !isReturning) {
      setReturnDialogOpen(false);
      wasReturning.current = false;
    }
  }, [isReturning]);

  return (
    <section
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-card shadow-sm",
        group.worstFlag &&
          isAlarmFlag(group.worstFlag) &&
          "border-l-[3px] border-l-lab-alarm",
      )}
    >
      <div className="flex items-start gap-2 border-b border-border/60 p-3 sm:p-4">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="-m-1 grid size-10 shrink-0 place-items-center rounded-md"
        >
          <ChevronRight
            className={cn("size-5 transition-transform", expanded && "rotate-90")}
            strokeWidth={2.5}
            aria-hidden
          />
        </button>

        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <h3 className="font-display text-base font-semibold tracking-tight sm:text-lg">
              {patientName}
            </h3>
            <span className="font-mono text-xs text-muted-foreground">
              {group.patient.mrn}
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              {group.accessionNumber}
            </span>
          </div>

          {group.patient.dateOfBirth || group.patient.sex ? (
            <p className="text-xs text-muted-foreground">
              {group.patient.dateOfBirth ? (
                <span>DOB {group.patient.dateOfBirth}</span>
              ) : null}
              {group.patient.dateOfBirth && group.patient.sex ? " · " : null}
              {group.patient.sex ? <span>{group.patient.sex}</span> : null}
            </p>
          ) : null}

          <div className="space-y-0.5 text-xs text-muted-foreground">
            {submitter ? (
              <p>
                <span className="font-medium text-foreground">Submitted by</span>{" "}
                {submitter}
                {group.submittedBy?.role ? (
                  <span className="text-muted-foreground">
                    {" "}
                    ({group.submittedBy.role})
                  </span>
                ) : null}
                {" · "}
                {formatWhen(group.submittedAt)}
              </p>
            ) : (
              <p>Submitter not recorded</p>
            )}
            {accessioner ? (
              <p>
                <span className="font-medium text-foreground">Accessioned by</span>{" "}
                {accessioner}
                {" · "}
                {formatWhen(group.accessionedAt)}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            <AlarmSign flag={group.worstFlag} />
            <FlagChip flag={group.worstFlag} />
            <Badge variant="muted" className="text-[10px]">
              {group.testCount} {group.testCount === 1 ? "test" : "tests"}
            </Badge>
          </div>
        </div>

        {canRelease ? (
          <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              size="sm"
              className="border-destructive/40 text-destructive hover:bg-destructive/10"
              disabled={actionPending}
              onClick={() => setReturnDialogOpen(true)}
            >
              {isReturning ? "Returning…" : "Return to bench"}
            </Button>
            <Button
              size="sm"
              disabled={actionPending}
              onClick={() => onReleaseAccession(group.accessionNumber)}
            >
              {isReleasing ? "Releasing…" : "Release"}
            </Button>
          </div>
        ) : null}
      </div>

      <ConfirmAccessionActionDialog
        open={returnDialogOpen}
        onOpenChange={setReturnDialogOpen}
        title="Return to bench?"
        description="Send this accession back to the bench tech? It will leave the release queue and return to pending review. Nothing is released to the doctor."
        confirmLabel="Return to bench"
        showReason
        reasonLabel="Reason (optional)"
        reasonPlaceholder="e.g. repeat run needed, QC concern, verify patient identity"
        pending={isReturning}
        onConfirm={(reason) => onReturnToBench(group.accessionNumber, reason)}
      />

      {expanded ? (
        compact ? (
          <ul className="space-y-2 p-3 pt-0 pl-6">
            {group.results.map((r) => (
              <li
                key={r.id}
                className="rounded-lg border border-border p-2.5"
                style={{
                  boxShadow: `inset 3px 0 0 0 ${flagBarColor(r.flag)}`,
                }}
              >
                <div className="flex items-baseline justify-between gap-2 pl-1">
                  <span className="font-medium">
                    {r.testName?.trim() || r.testCode}
                  </span>
                  <span className="shrink-0 text-lg font-semibold tabular-nums">
                    <span className={flagValueClass(r.flag)}>{r.value}</span>
                    {r.units ? (
                      <span className="ml-1 text-sm font-medium text-muted-foreground">
                        {r.units}
                      </span>
                    ) : null}
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-1">
                  <FlagChip flag={r.flag} />
                </div>
                <p className="mt-1.5 pl-1 text-[10px] text-muted-foreground">
                  {analyzerLabel(r.analyzerId)} ·{" "}
                  {new Date(r.observedAt).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <div className="overflow-x-auto px-3 pb-3 sm:px-4 sm:pb-4">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead className="border-b border-border bg-muted/30 text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-2 py-2 font-medium">Observed</th>
                  <th className="px-2 py-2 font-medium">Test</th>
                  <th className="px-2 py-2 font-medium">Value</th>
                  <th className="px-2 py-2 font-medium">Flag</th>
                  <th className="px-2 py-2 font-medium">Instrument</th>
                </tr>
              </thead>
              <tbody>
                {group.results.map((r) => (
                  <tr
                    key={r.id}
                    className={cn(
                      "border-t border-border/60",
                      flagRowClass(r.flag),
                    )}
                  >
                    <td className="px-2 py-2 whitespace-nowrap text-xs tabular-nums">
                      {new Date(r.observedAt).toLocaleString()}
                    </td>
                    <td className="px-2 py-2">
                      <span className="font-medium">{r.testCode}</span>
                      {r.testName ? (
                        <span className="text-muted-foreground">
                          {" "}
                          · {r.testName}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap">
                      <span
                        className={cn(
                          "text-base font-semibold tabular-nums",
                          flagValueClass(r.flag),
                        )}
                      >
                        {r.value}
                      </span>
                      {r.units ? (
                        <span className="ml-1 text-sm text-muted-foreground">
                          {r.units}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-2 py-2">
                      <FlagChip flag={r.flag} />
                    </td>
                    <td className="px-2 py-2 text-xs text-muted-foreground">
                      {analyzerLabel(r.analyzerId)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}
    </section>
  );
}
