import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { api, ApiError } from "../../lib/api";
import { canAuthorize, isAdmin, useAuth } from "../../lib/auth";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { ConfirmAccessionActionDialog } from "../../components/confirm-accession-action-dialog";
import { ReleaseQueueEmptyState } from "../../components/release-queue-empty-state";
import { ReleaseQueueMasterDetail } from "../../components/release-queue-master-detail";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import {
  useIsCompactWorkstation,
  useIsWorkstation,
  useShowWorkstationChrome,
  useWorkstationViewportClass,
} from "../../lib/use-media-query";
import { cn } from "../../lib/utils";
import {
  reconcileReleasedMirror,
  type MirrorReconcileOutcome,
} from "../../lib/reconcile-released-mirror";
import { BenchAlignmentBanner } from "../../components/bench-alignment-banner";

export const Route = createFileRoute("/_lab/release")({
  component: ReleasePage,
});

const RELEASE_QUEUE_TAB_KEY = "release-queue-tab";

type ReleaseQueueTab = "authorization" | "ready";

type MirrorNotice = {
  id: string;
  kind: "warning" | "info";
  message: string;
};

function applyMirrorOutcome(
  outcome: MirrorReconcileOutcome,
  accessionNumber: string,
  setNotices: Dispatch<SetStateAction<MirrorNotice[]>>,
) {
  setNotices((prev) =>
    prev.filter(
      (notice) =>
        !notice.id.startsWith(`warn:${accessionNumber}:`) &&
        !notice.id.startsWith(`info:${accessionNumber}:`),
    ),
  );

  if (outcome.status === "mirrored") return;

  if (outcome.status === "bench-not-found") {
    setNotices((prev) => [
      ...prev,
      {
        id: `warn:${accessionNumber}:${Date.now()}`,
        kind: "warning",
        message: `${accessionNumber} is released in cloud but was not found on the Bench (edge may have been reset). Ready to send and export still work from cloud.`,
      },
    ]);
    return;
  }

  if (outcome.status === "dismissed-stale") return;

  if (outcome.status !== "failed") return;

  setNotices((prev) => [
    ...prev,
    {
      id: `warn:${accessionNumber}:${Date.now()}`,
      kind: "warning",
      message: outcome.retryable
        ? `${accessionNumber} is released in cloud, but Bench has not confirmed yet. Stay on Ready or tap Refresh — do not resubmit or recall.`
        : `${accessionNumber} could not sync to Bench and could not be cleared automatically. Ask an admin to remove it from Ready.`,
    },
  ]);
}

function MirrorNoticesPanel({
  notices,
  onDismiss,
}: {
  notices: MirrorNotice[];
  onDismiss: (id: string) => void;
}) {
  if (notices.length === 0) return null;

  return (
    <div className="mb-3 space-y-2">
      {notices.map((notice) => (
        <div
          key={notice.id}
          className={cn(
            "flex items-start justify-between gap-3 rounded-md border px-3 py-2 text-sm",
            notice.kind === "info"
              ? "border-border bg-muted/50 text-muted-foreground"
              : "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-100",
          )}
        >
          <p className="min-w-0">{notice.message}</p>
          <button
            type="button"
            className="shrink-0 text-xs font-medium underline-offset-2 hover:underline"
            onClick={() => onDismiss(notice.id)}
          >
            Dismiss
          </button>
        </div>
      ))}
    </div>
  );
}

function readStoredReleaseQueueTab(): ReleaseQueueTab {
  if (typeof window === "undefined") return "authorization";
  return sessionStorage.getItem(RELEASE_QUEUE_TAB_KEY) === "ready"
    ? "ready"
    : "authorization";
}

function storeReleaseQueueTab(tab: ReleaseQueueTab) {
  try {
    sessionStorage.setItem(RELEASE_QUEUE_TAB_KEY, tab);
  } catch {
    // Private browsing or storage full — ignore
  }
}

function ReleasePage() {
  const auth = useAuth();
  const qc = useQueryClient();
  const showWorkstationChrome = useShowWorkstationChrome();
  const isWorkstation = useIsWorkstation();
  const isCompactWorkstation = useIsCompactWorkstation();
  const workstationViewportClass = useWorkstationViewportClass();
  const allowed = canAuthorize(auth.role);
  const [activeTab, setActiveTabState] = useState<ReleaseQueueTab>(
    readStoredReleaseQueueTab,
  );

  function setActiveTab(tab: ReleaseQueueTab) {
    setActiveTabState(tab);
    storeReleaseQueueTab(tab);
  }

  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [releasingAccession, setReleasingAccession] = useState<string | null>(
    null,
  );
  const [returningAccession, setReturningAccession] = useState<string | null>(
    null,
  );
  const [dismissingAccession, setDismissingAccession] = useState<string | null>(
    null,
  );
  const [mirrorNotices, setMirrorNotices] = useState<MirrorNotice[]>([]);

  const queueQ = useQuery({
    queryKey: ["release-queue"],
    queryFn: () => api.releaseQueue(),
    enabled: auth.ready && auth.hasCloudSession,
    refetchInterval: 10_000,
    retry: (count, err) =>
      count < 2 && !(err instanceof ApiError && err.status === 401),
  });

  const releaseM = useMutation({
    mutationFn: async (accessionNumber: string) => {
      const released = await api.releaseAccession(accessionNumber);
      const mirror = await reconcileReleasedMirror({
        accessionNumber,
        canDismissStale: allowed,
      });
      return { released, mirror, accessionNumber };
    },
    onMutate: (accessionNumber) => setReleasingAccession(accessionNumber),
    onSettled: () => setReleasingAccession(null),
    onSuccess: ({ mirror, accessionNumber }) => {
      applyMirrorOutcome(mirror, accessionNumber, setMirrorNotices);
      setActiveTab("ready");
      void qc.invalidateQueries({ queryKey: ["release-queue"] });
      void qc.invalidateQueries({ queryKey: ["cloud-results"] });
      void qc.invalidateQueries({ queryKey: ["results"] });
      void qc.invalidateQueries({ queryKey: ["patient-report-summary"] });
      void qc.invalidateQueries({ queryKey: ["bench-alignment"] });
    },
  });

  const returnM = useMutation({
    mutationFn: ({
      accessionNumber,
      reason,
    }: {
      accessionNumber: string;
      reason?: string;
    }) =>
      api.recallResults({
        accessionNumbers: [accessionNumber],
        reason,
      }),
    onMutate: ({ accessionNumber }) => setReturningAccession(accessionNumber),
    onSettled: () => setReturningAccession(null),
    onSuccess: async () => {
      void qc.invalidateQueries({ queryKey: ["release-queue"] });
      void qc.invalidateQueries({ queryKey: ["cloud-results"] });
      void qc.invalidateQueries({ queryKey: ["results"] });
      void qc.invalidateQueries({ queryKey: ["syncStatus"] });
      void qc.invalidateQueries({ queryKey: ["patient-report-summary"] });
      try {
        await api.drainSync();
        void qc.invalidateQueries({ queryKey: ["release-queue"] });
        void qc.invalidateQueries({ queryKey: ["cloud-results"] });
        void qc.invalidateQueries({ queryKey: ["syncStatus"] });
        void qc.invalidateQueries({ queryKey: ["patient-report-summary"] });
      } catch {
        // Sync page has manual drain
      }
    },
  });

  const dismissM = useMutation({
    mutationFn: (accessionNumber: string) =>
      api.dismissReleaseQueueAccession(accessionNumber),
    onMutate: (accessionNumber) => setDismissingAccession(accessionNumber),
    onSettled: () => setDismissingAccession(null),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["release-queue"] });
    },
  });

  const clearReleasedM = useMutation({
    mutationFn: () => api.dismissAllReleasedFromReleaseQueue(),
    onSuccess: () => {
      setClearDialogOpen(false);
      void qc.invalidateQueries({ queryKey: ["release-queue"] });
    },
  });

  const groups = queueQ.data ?? [];
  const authorizationGroups = useMemo(
    () =>
      groups.filter((group) => group.queuePhase === "pending_authorization"),
    [groups],
  );
  const readyGroups = useMemo(
    () => groups.filter((group) => group.queuePhase === "released"),
    [groups],
  );

  function renderGroupList(
    tabGroups: typeof groups,
    emptyVariant: "authorization" | "ready",
    tabKey: string,
  ) {
    if (!auth.hasCloudSession) {
      return (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-8 text-center text-sm text-amber-950 dark:text-amber-100">
          {allowed
            ? "The release queue could not connect to the cloud copy. Sign out and sign in again as an authorizer or admin, then reopen this page."
            : "The release queue is only available to sign-off staff with a cloud session. Sign in as an authorizer or admin."}
        </p>
      );
    }

    if (queueQ.isLoading || !queueQ.isFetched) {
      return (
        <p className="rounded-xl border border-border bg-card px-3 py-12 text-center text-muted-foreground">
          Loading release queue…
        </p>
      );
    }

    if (tabGroups.length === 0) {
      return <ReleaseQueueEmptyState variant={emptyVariant} />;
    }

    return (
      <ReleaseQueueMasterDetail
        groups={tabGroups}
        tabKey={tabKey}
        canRelease={allowed}
        releasingAccession={releasingAccession}
        onReleaseAccession={(accession) => releaseM.mutate(accession)}
        returningAccession={returningAccession}
        onReturnToBench={(accession, reason) =>
          returnM.mutate({ accessionNumber: accession, reason })
        }
        dismissingAccession={dismissingAccession}
        onDismissFromQueue={(accession) => dismissM.mutate(accession)}
      />
    );
  }

  return (
    <div
      className={cn(
        "mx-auto w-full max-w-none",
        showWorkstationChrome
          ? "max-w-7xl space-y-6"
          : cn(
              "flex min-h-0 flex-col",
              isWorkstation && workstationViewportClass,
            ),
      )}
    >
      {showWorkstationChrome ? (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Authorization
            </p>
            <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
              Release queue
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Sign off on submitted results, then send reports when you are ready.
              Items stay on your list until you remove them.
            </p>
          </div>
          <div className="text-sm text-muted-foreground">
            {auth.role ? (
              <span>
                Signed in as <Badge variant="muted">{auth.role}</Badge>
              </span>
            ) : (
              <Link
                to="/login"
                className="text-accent underline-offset-2 hover:underline"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
      ) : isWorkstation ? (
        <div className="flex shrink-0 flex-wrap items-end justify-between gap-3 px-3 pt-1 lg:px-0">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Authorization
            </p>
            <h2
              className={cn(
                "font-display font-semibold tracking-tight",
                isCompactWorkstation ? "text-xl sm:text-2xl" : "text-2xl",
              )}
            >
              Release queue
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Tap a patient for details · sign off when ready
            </p>
          </div>
          {auth.role ? (
            <Badge variant="muted">{auth.role}</Badge>
          ) : null}
        </div>
      ) : null}

      <div
        className={cn(
          "space-y-3",
          !showWorkstationChrome &&
            "flex min-h-0 flex-1 flex-col space-y-2 p-3",
        )}
      >
      {!auth.accessToken && (
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
          Sign in required.{" "}
          <Link to="/login" className="underline underline-offset-2">
            Go to login
          </Link>
        </p>
      )}

      {auth.accessToken && allowed && isAdmin(auth.role) && showWorkstationChrome && (
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          You can sign off on results and manage who else can. Use{" "}
          <Link to="/staff" className="font-medium text-foreground underline-offset-2 hover:underline">
            Staff
          </Link>{" "}
          to add or change permissions.
        </p>
      )}

      {auth.accessToken && !allowed && (
        <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
          Your account cannot sign off on results. Ask a supervisor or lab
          director if you need access.
        </p>
      )}

      {!auth.ready && auth.accessToken && (
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          Verifying session…
        </p>
      )}

      {auth.accessToken && auth.hasCloudSession && (
        <BenchAlignmentBanner
          variant={showWorkstationChrome ? "default" : "compact"}
        />
      )}

      {auth.accessToken && queueQ.isError && (
        <p className="text-sm text-lab-danger">
          {queueQ.error instanceof ApiError && queueQ.error.status === 401 ? (
            <>
              Your session expired. Please{" "}
              <Link to="/login" search={{ redirect: "/release" }} className="underline underline-offset-2">
                sign in again
              </Link>
              .
            </>
          ) : queueQ.error instanceof ApiError ? (
            queueQ.error.message
          ) : (
            "Failed to load release queue"
          )}
        </p>
      )}

      {auth.accessToken && (
        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as ReleaseQueueTab)}
          className={cn(
            !showWorkstationChrome && "flex min-h-0 flex-1 flex-col",
          )}
        >
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
            <TabsList>
              <TabsTrigger value="authorization">
                {showWorkstationChrome ? "Authorization queue" : "Authorize"}
                {authorizationGroups.length > 0 ? (
                  <Badge variant="muted" className="ml-2 text-[10px]">
                    {authorizationGroups.length}
                  </Badge>
                ) : null}
              </TabsTrigger>
              <TabsTrigger value="ready">
                {showWorkstationChrome ? "Ready to send" : "Ready"}
                {readyGroups.length > 0 ? (
                  <Badge variant="muted" className="ml-2 text-[10px]">
                    {readyGroups.length}
                  </Badge>
                ) : null}
              </TabsTrigger>
            </TabsList>

            {allowed && activeTab === "ready" && readyGroups.length > 0 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setClearDialogOpen(true)}
                disabled={clearReleasedM.isPending || clearDialogOpen}
              >
                Clear queue
              </Button>
            ) : null}
          </div>

          <TabsContent
            value="authorization"
            className={cn(
              "mt-4",
              !showWorkstationChrome &&
                "mt-2 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden",
            )}
          >
            {renderGroupList(authorizationGroups, "authorization", "authorization")}
          </TabsContent>

          <TabsContent
            value="ready"
            className={cn(
              "mt-4",
              !showWorkstationChrome &&
                "mt-2 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden",
            )}
          >
            <MirrorNoticesPanel
              notices={mirrorNotices}
              onDismiss={(id) =>
                setMirrorNotices((prev) => prev.filter((n) => n.id !== id))
              }
            />
            {renderGroupList(readyGroups, "ready", "ready")}
          </TabsContent>
        </Tabs>
      )}
      </div>

      <ConfirmAccessionActionDialog
        open={clearDialogOpen}
        onOpenChange={(open) => {
          if (!open && clearReleasedM.isPending) return;
          setClearDialogOpen(open);
        }}
        title="Clear ready-to-send queue?"
        description={`Are you sure you want to remove ${readyGroups.length} patient${
          readyGroups.length === 1 ? "" : "s"
        } from Ready to send? Their results stay released — this only clears your send list.`}
        confirmLabel={
          clearReleasedM.isPending ? "Clearing…" : "Yes, clear queue"
        }
        pending={clearReleasedM.isPending}
        preventOutsideDismiss
        onConfirm={() => {
          if (clearReleasedM.isPending) return;
          clearReleasedM.mutate();
        }}
      />

      {releaseM.isError && (
        <p className="text-sm text-lab-danger">
          {releaseM.error instanceof ApiError
            ? releaseM.error.message
            : "Release failed"}
        </p>
      )}

      {returnM.isError && (
        <p className="text-sm text-lab-danger">
          {returnM.error instanceof ApiError
            ? returnM.error.message
            : "Return to bench failed"}
        </p>
      )}

      {dismissM.isError && (
        <p className="text-sm text-lab-danger">
          {dismissM.error instanceof ApiError
            ? dismissM.error.message
            : "Remove from queue failed"}
        </p>
      )}

      {clearReleasedM.isError && (
        <p className="text-sm text-lab-danger">
          {clearReleasedM.error instanceof ApiError
            ? clearReleasedM.error.message
            : "Clear queue failed"}
        </p>
      )}
    </div>
  );
}
