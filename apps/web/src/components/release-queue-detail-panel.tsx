import type { ActorSnapshot, ReleaseQueueGroup } from "@drax-lis/contracts";
import { analyzerLabel } from "../lib/analyzers";
import { usePatientNameOrder } from "../lib/patient-name-order";
import { cn } from "../lib/utils";
import { Badge } from "./ui/badge";
import {
  AlarmSign,
  FlagChip,
  flagRowClass,
  flagValueClass,
  isAlarmFlag,
} from "./result-status";
import { ScrollContainer } from "./ui/scroll-container";

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
  className?: string;
};

export function ReleaseQueueDetailPanel({ group, className }: Props) {
  const { formatName } = usePatientNameOrder();
  const parts = group.patient.displayName.trim().split(/\s+/);
  const patientName = formatName({
    displayName: group.patient.displayName,
    firstName: parts[0],
    lastName: parts.length > 1 ? parts[parts.length - 1] : undefined,
  });
  const submitter = actorLabel(group.submittedBy);
  const accessioner = actorLabel(group.accessionedBy);
  const releaser = actorLabel(group.releasedBy ?? null);
  const isPending = group.queuePhase === "pending_authorization";

  return (
    <div
      className={cn(
        "flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm",
        group.worstFlag &&
          isAlarmFlag(group.worstFlag) &&
          "border-l-[3px] border-l-lab-alarm",
        className,
      )}
    >
      <div className="shrink-0 space-y-2 border-b border-border/60 p-4">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <h3 className="font-display text-lg font-semibold tracking-tight">
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

        <div className="flex flex-wrap items-center gap-2">
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
              Incomplete order
            </Badge>
          ) : null}
        </div>

        <dl className="space-y-1 text-xs text-muted-foreground">
          {submitter ? (
            <div>
              <span className="font-medium text-foreground">Submitted by</span>{" "}
              {submitter}
              {group.submittedBy?.role ? ` (${group.submittedBy.role})` : ""}
              {" · "}
              {formatWhen(group.submittedAt)}
            </div>
          ) : null}
          {accessioner ? (
            <div>
              <span className="font-medium text-foreground">Registered by</span>{" "}
              {accessioner}
              {" · "}
              {formatWhen(group.accessionedAt)}
            </div>
          ) : null}
          {!isPending && releaser ? (
            <div>
              <span className="font-medium text-foreground">Released by</span>{" "}
              {releaser}
              {group.releasedBy?.role ? ` (${group.releasedBy.role})` : ""}
              {" · "}
              {formatWhen(group.releasedAt)}
            </div>
          ) : null}
        </dl>

        {!isPending && group.patient.edgePatientId ? (
          <p className="text-xs text-muted-foreground">
            Send report (from the list) includes released results for this
            accession only.
          </p>
        ) : null}
      </div>

      <ScrollContainer className="min-h-0 flex-1">
        <div className="overflow-x-auto p-4">
          {group.missingExpectedResults.length > 0 ? (
            <section className="mb-4 rounded-lg border border-amber-500/35 bg-amber-500/10 p-3">
              <h4 className="text-sm font-semibold text-amber-950 dark:text-amber-100">
                Missing expected results at submission
              </h4>
              <p className="mt-1 text-xs text-muted-foreground">
                The bench tech explicitly submitted this incomplete order.
                Review these items before releasing, or return it to the bench.
              </p>
              <ul className="mt-2 space-y-2 text-sm">
                {group.missingExpectedResults.map((item) => (
                  <li
                    key={`${item.orderedTestCode}-${item.componentCode}`}
                    className="rounded-md border border-amber-500/20 bg-card/60 px-2.5 py-2"
                  >
                    <div>
                      <span className="font-mono text-xs font-semibold">
                        {item.orderedTestCode}
                      </span>
                      {" · "}
                      {item.orderedTestName}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Missing: {item.componentName}
                      {" · "}
                      {item.workflow === "hybrid"
                        ? "Hybrid manual component"
                        : item.workflow === "send_out"
                          ? "Reference laboratory result"
                          : "Manual result"}
                      {item.confirmationStatus === "provisional"
                        ? " · Provisional workflow mapping"
                        : ""}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {isPending ? "Tests awaiting sign-off" : "Released tests"}
          </p>
          <table className="w-full min-w-[32rem] text-left text-sm">
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
                    <p>{analyzerLabel(r.analyzerId)}</p>
                    {r.analyzerId === "manual" ? (
                      <>
                        <p>
                          Entered by{" "}
                          {actorLabel(r.manualEnteredBy) ??
                            "Entry attribution unavailable"}{" "}
                          · {formatWhen(r.manualEnteredAt)}
                        </p>
                        {r.manualLastEditedAt ? (
                          <p>
                            Last edited by{" "}
                            {actorLabel(r.manualLastEditedBy) ??
                              "Edit attribution unavailable"}{" "}
                            · {formatWhen(r.manualLastEditedAt)}
                          </p>
                        ) : null}
                      </>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ScrollContainer>
    </div>
  );
}
