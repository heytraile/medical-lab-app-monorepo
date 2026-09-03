import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, ApiError } from "../../lib/api";
import { canAuthorize, isAdmin, useAuth } from "../../lib/auth";
import { Badge } from "../../components/ui/badge";
import { ReleaseQueueEmptyState } from "../../components/release-queue-empty-state";
import { ReleaseQueueGroupRow } from "../../components/release-queue-group-row";
import { useIsDesktop } from "../../lib/use-media-query";

export const Route = createFileRoute("/_lab/release")({
  component: ReleasePage,
});

function ReleasePage() {
  const auth = useAuth();
  const qc = useQueryClient();
  const allowed = canAuthorize(auth.role);
  const isDesktop = useIsDesktop();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [releasingAccession, setReleasingAccession] = useState<string | null>(
    null,
  );

  const [returningAccession, setReturningAccession] = useState<string | null>(
    null,
  );

  const queueQ = useQuery({
    queryKey: ["release-queue"],
    queryFn: () => api.releaseQueue(),
    enabled: auth.ready && Boolean(auth.accessToken),
    refetchInterval: 10_000,
    retry: (count, err) =>
      count < 2 && !(err instanceof ApiError && err.status === 401),
  });

  const releaseM = useMutation({
    mutationFn: async (accessionNumber: string) => {
      const released = await api.releaseAccession(accessionNumber);
      try {
        await api.markAccessionReleased(accessionNumber);
      } catch {
        // Cloud release succeeded; edge mirror may fail if edge is down
      }
      return released;
    },
    onMutate: (accessionNumber) => setReleasingAccession(accessionNumber),
    onSettled: () => setReleasingAccession(null),
    onSuccess: () => {
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

  const groups = queueQ.data ?? [];

  function toggleGroup(accession: string) {
    setExpanded((prev) => ({ ...prev, [accession]: !prev[accession] }));
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Authorization
          </p>
          <h2 className="font-display text-2xl font-semibold sm:text-3xl tracking-tight">
            Release queue
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Patient groups submitted by bench techs — review context, then release
            the whole accession for doctor export.
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

      {!auth.accessToken && (
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
          Sign in required.{" "}
          <Link to="/login" className="underline underline-offset-2">
            Go to login
          </Link>
        </p>
      )}

      {auth.accessToken && allowed && isAdmin(auth.role) && (
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          As admin you have full authorizer access. Use{" "}
          <Link to="/staff" className="font-medium text-foreground underline-offset-2 hover:underline">
            Staff
          </Link>{" "}
          to grant authorizer permission to others.
        </p>
      )}

      {auth.accessToken && !allowed && (
        <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
          Your role ({auth.role}) cannot release results. Ask an authorizer.
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
              Session expired or invalid — often after{" "}
              <code className="text-xs">pnpm supabase:reset</code>.{" "}
              <Link to="/login" search={{ redirect: "/release" }} className="underline underline-offset-2">
                Sign in again
              </Link>
            </>
          ) : queueQ.error instanceof ApiError ? (
            queueQ.error.message
          ) : (
            "Failed to load release queue"
          )}
        </p>
      )}

      {queueQ.isLoading && (
        <p className="rounded-xl border border-border bg-card px-3 py-12 text-center text-muted-foreground">
          Loading release queue…
        </p>
      )}

      {!queueQ.isLoading && groups.length === 0 && auth.accessToken && (
        <ReleaseQueueEmptyState />
      )}

      {!queueQ.isLoading && groups.length > 0 && (
        <div className="space-y-3">
          {groups.map((group) => (
            <ReleaseQueueGroupRow
              key={group.accessionNumber}
              group={group}
              expanded={expanded[group.accessionNumber] ?? true}
              onToggle={() => toggleGroup(group.accessionNumber)}
              canRelease={allowed}
              releasingAccession={releasingAccession}
              onReleaseAccession={(accession) => releaseM.mutate(accession)}
              returningAccession={returningAccession}
              onReturnToBench={(accession, reason) =>
                returnM.mutate({ accessionNumber: accession, reason })
              }
              compact={!isDesktop}
            />
          ))}
        </div>
      )}

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
    </div>
  );
}
