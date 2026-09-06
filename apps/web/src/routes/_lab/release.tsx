import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError } from "../../lib/api";
import { canAuthorize, isAdmin, useAuth } from "../../lib/auth";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { ConfirmAccessionActionDialog } from "../../components/confirm-accession-action-dialog";
import { ReleaseQueueEmptyState } from "../../components/release-queue-empty-state";
import { ReleaseQueueMasterDetail } from "../../components/release-queue-master-detail";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { useIsWide } from "../../lib/use-media-query";
import { cn } from "../../lib/utils";

export const Route = createFileRoute("/_lab/release")({
  component: ReleasePage,
});

const RELEASE_QUEUE_TAB_KEY = "release-queue-tab";

type ReleaseQueueTab = "authorization" | "ready";

async function mirrorReleasedAccession(accessionNumber: string) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await api.markAccessionReleased(accessionNumber);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
      }
    }
  }
  throw lastError;
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
  const isWide = useIsWide();
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
  const [mirrorWarning, setMirrorWarning] = useState<string | null>(null);
  const mirrorAttempts = useRef(new Set<string>());

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
      try {
        await mirrorReleasedAccession(accessionNumber);
        return { released, mirrorFailed: false, accessionNumber };
      } catch {
        return { released, mirrorFailed: true, accessionNumber };
      }
    },
    onMutate: (accessionNumber) => setReleasingAccession(accessionNumber),
    onSettled: () => setReleasingAccession(null),
    onSuccess: ({ mirrorFailed, accessionNumber }) => {
      setMirrorWarning(
        mirrorFailed
          ? `${accessionNumber} was released in cloud, but the bench mirror has not confirmed yet. The system will retry; do not resubmit or recall it.`
          : null,
      );
      setActiveTab("ready");
      void qc.invalidateQueries({ queryKey: ["release-queue"] });
      void qc.invalidateQueries({ queryKey: ["cloud-results"] });
      void qc.invalidateQueries({ queryKey: ["results"] });
      void qc.invalidateQueries({ queryKey: ["patient-report-summary"] });
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

  // Reconcile cloud-authoritative released accessions back to edge whenever an
  // authorizer opens the Ready tab. The edge endpoint is idempotent.
  useEffect(() => {
    if (!auth.accessToken) return;
    for (const group of readyGroups) {
      if (mirrorAttempts.current.has(group.accessionNumber)) continue;
      mirrorAttempts.current.add(group.accessionNumber);
      void mirrorReleasedAccession(group.accessionNumber)
        .then(() => {
          void qc.invalidateQueries({ queryKey: ["results"] });
        })
        .catch(() => {
          setMirrorWarning(
            `${group.accessionNumber} is released in cloud, but the bench mirror is still pending. It will retry when this page is reopened.`,
          );
        });
    }
  }, [auth.accessToken, qc, readyGroups]);

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
        "mx-auto w-full",
        isWide
          ? "max-w-7xl space-y-6"
          : "flex h-full min-h-0 max-w-none flex-col",
      )}
    >
      {isWide ? (
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
      ) : null}

      <div
        className={cn(
          "space-y-3",
          !isWide && "flex min-h-0 flex-1 flex-col space-y-2 p-3",
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

      {auth.accessToken && allowed && isAdmin(auth.role) && isWide && (
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
          className={cn(!isWide && "flex min-h-0 flex-1 flex-col")}
        >
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
            <TabsList>
              <TabsTrigger value="authorization">
                {isWide ? "Authorization queue" : "Authorize"}
                {authorizationGroups.length > 0 ? (
                  <Badge variant="muted" className="ml-2 text-[10px]">
                    {authorizationGroups.length}
                  </Badge>
                ) : null}
              </TabsTrigger>
              <TabsTrigger value="ready">
                {isWide ? "Ready to send" : "Ready"}
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
            className={cn("mt-4", !isWide && "mt-2 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden")}
          >
            {renderGroupList(authorizationGroups, "authorization", "authorization")}
          </TabsContent>

          <TabsContent
            value="ready"
            className={cn("mt-4", !isWide && "mt-2 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden")}
          >
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

      {mirrorWarning && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-100">
          {mirrorWarning}
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
