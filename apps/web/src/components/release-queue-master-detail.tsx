import { useEffect, useRef, useState } from "react";
import type { ReleaseQueueGroup } from "@drax-lis/contracts";
import { ReleaseQueueDetailPanel } from "./release-queue-detail-panel";
import { ReleaseQueueListItem } from "./release-queue-list-item";
import { ConfirmAccessionActionDialog } from "./confirm-accession-action-dialog";
import { ScrollContainer } from "./ui/scroll-container";
import { cn } from "../lib/utils";

type Props = {
  groups: ReleaseQueueGroup[];
  tabKey: string;
  canRelease: boolean;
  releasingAccession: string | null;
  onReleaseAccession: (accessionNumber: string) => void;
  returningAccession: string | null;
  onReturnToBench: (accessionNumber: string, reason?: string) => void;
  dismissingAccession: string | null;
  onDismissFromQueue: (accessionNumber: string) => void;
  className?: string;
};

export function ReleaseQueueMasterDetail({
  groups,
  tabKey,
  canRelease,
  releasingAccession,
  onReleaseAccession,
  returningAccession,
  onReturnToBench,
  dismissingAccession,
  onDismissFromQueue,
  className,
}: Props) {
  const [selectedAccession, setSelectedAccession] = useState<string | null>(
    null,
  );
  const [returnDialogAccession, setReturnDialogAccession] = useState<
    string | null
  >(null);
  const [dismissDialogAccession, setDismissDialogAccession] = useState<
    string | null
  >(null);
  const wasReturning = useRef(false);
  const wasDismissing = useRef(false);

  const actionPending =
    releasingAccession !== null ||
    returningAccession !== null ||
    dismissingAccession !== null;

  useEffect(() => {
    setSelectedAccession(null);
  }, [tabKey]);

  useEffect(() => {
    if (returningAccession) wasReturning.current = true;
    if (wasReturning.current && !returningAccession) {
      setReturnDialogAccession(null);
      wasReturning.current = false;
    }
  }, [returningAccession]);

  useEffect(() => {
    if (dismissingAccession) wasDismissing.current = true;
    if (wasDismissing.current && !dismissingAccession) {
      setDismissDialogAccession(null);
      wasDismissing.current = false;
    }
  }, [dismissingAccession]);

  useEffect(() => {
    if (
      selectedAccession &&
      !groups.some((g) => g.accessionNumber === selectedAccession)
    ) {
      setSelectedAccession(null);
    }
  }, [groups, selectedAccession]);

  const selectedGroup =
    groups.find((g) => g.accessionNumber === selectedAccession) ?? null;

  return (
    <>
      <div
        className={cn(
          "grid min-h-[28rem] grid-cols-1 gap-4 lg:min-h-[32rem] lg:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)] lg:items-stretch",
          className,
        )}
      >
        <ScrollContainer className="min-h-0 max-h-[50vh] rounded-xl border border-border bg-muted/10 lg:max-h-none">
          <ul className="space-y-2 p-2">
            {groups.map((group) => (
              <ReleaseQueueListItem
                key={`${group.queuePhase}-${group.accessionNumber}`}
                group={group}
                selected={selectedAccession === group.accessionNumber}
                onSelect={() => setSelectedAccession(group.accessionNumber)}
                canRelease={canRelease}
                releasingAccession={releasingAccession}
                onReleaseAccession={onReleaseAccession}
                returningAccession={returningAccession}
                onReturnToBench={() =>
                  setReturnDialogAccession(group.accessionNumber)
                }
                dismissingAccession={dismissingAccession}
                onDismissFromQueue={() =>
                  setDismissDialogAccession(group.accessionNumber)
                }
                actionPending={actionPending}
              />
            ))}
          </ul>
        </ScrollContainer>

        <div className="flex min-h-[16rem] min-w-0 flex-col lg:min-h-0">
          {selectedGroup ? (
            <ReleaseQueueDetailPanel
              group={selectedGroup}
              className="min-h-0 flex-1"
            />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center shadow-sm">
              <p className="text-sm font-medium text-foreground">
                Select a patient
              </p>
              <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                Choose a name from the list to see their test results and
                sign-off details.
              </p>
            </div>
          )}
        </div>
      </div>

      <ConfirmAccessionActionDialog
        open={returnDialogAccession !== null}
        onOpenChange={(open) => {
          if (!open) setReturnDialogAccession(null);
        }}
        title="Return to bench?"
        description="Send these results back to the tech for another look? They will leave this queue and nothing will be sent to the doctor."
        confirmLabel="Return to bench"
        showReason
        reasonLabel="Reason (optional)"
        reasonPlaceholder="e.g. repeat run needed, QC concern, verify patient identity"
        pending={returningAccession === returnDialogAccession}
        onConfirm={(reason) => {
          if (returnDialogAccession) {
            onReturnToBench(returnDialogAccession, reason);
          }
        }}
      />

      <ConfirmAccessionActionDialog
        open={dismissDialogAccession !== null}
        onOpenChange={(open) => {
          if (!open) setDismissDialogAccession(null);
        }}
        title="Remove from queue?"
        description="Remove this patient from your send list? Their results stay released — you are only clearing this list."
        confirmLabel="Remove from queue"
        pending={dismissingAccession === dismissDialogAccession}
        onConfirm={() => {
          if (dismissDialogAccession) {
            onDismissFromQueue(dismissDialogAccession);
          }
        }}
      />
    </>
  );
}
