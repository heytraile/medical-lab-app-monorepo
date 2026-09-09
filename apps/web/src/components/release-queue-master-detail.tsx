import { useEffect, useRef, useState } from "react";
import type { ReleaseQueueGroup } from "@drax-lis/contracts";
import { ReleaseQueueDetailPanel } from "./release-queue-detail-panel";
import { ReleaseQueueListItem } from "./release-queue-list-item";
import { ConfirmAccessionActionDialog } from "./confirm-accession-action-dialog";
import { ScrollContainer } from "./ui/scroll-container";
import { Sheet, SheetContent } from "./ui/sheet";
import {
  useIsCompactWorkstation,
  useIsWorkstation,
} from "../lib/use-media-query";
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
  const isWorkstation = useIsWorkstation();
  const isCompactWorkstation = useIsCompactWorkstation();
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
  const splitDocked = Boolean(selectedAccession) && isWorkstation;

  const list = (
    <ScrollContainer
      className={cn(
        "min-h-0 min-w-0 flex-1 rounded-xl border border-border bg-muted/10",
      )}
    >
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
  );

  return (
    <>
      <div
        className={cn(
          "min-h-0 flex-1",
          splitDocked &&
            cn(
              "grid items-stretch gap-3",
              isCompactWorkstation
                ? "grid-cols-[minmax(0,1fr)_minmax(16rem,42%)]"
                : "grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)] lg:gap-4",
            ),
          !splitDocked && "flex flex-col",
          className,
        )}
      >
        {list}

        {splitDocked && selectedGroup ? (
          <ReleaseQueueDetailPanel
            group={selectedGroup}
            className="min-h-0 min-w-0 flex-1"
          />
        ) : null}
      </div>

      {!isWorkstation ? (
        <Sheet
          open={Boolean(selectedGroup)}
          onOpenChange={(open) => {
            if (!open) setSelectedAccession(null);
          }}
        >
          <SheetContent side="bottom" label="Release details" className="p-0">
            {selectedGroup ? (
              <ReleaseQueueDetailPanel group={selectedGroup} embedded />
            ) : null}
          </SheetContent>
        </Sheet>
      ) : null}

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
