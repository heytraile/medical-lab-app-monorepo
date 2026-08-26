import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, type CloudResult } from "../../lib/api";
import { canRelease, useAuth } from "../../lib/auth";
import { isCloudMode } from "../../lib/supabase";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import {
  FlagChip,
  flagRowClass,
  flagValueClass,
  isAlarmFlag,
} from "../../components/result-status";
import { cn } from "../../lib/utils";

export const Route = createFileRoute("/_lab/release")({
  component: ReleasePage,
});

function sortForRelease(rows: CloudResult[]) {
  const score = (r: CloudResult) => {
    if (r.urgency === "stat") return 0;
    if (r.flag?.startsWith("critical")) return 1;
    return 2;
  };
  return [...rows].sort((a, b) => {
    const d = score(a) - score(b);
    if (d !== 0) return d;
    return String(b.observed_at).localeCompare(String(a.observed_at));
  });
}

function ReleasePage() {
  const auth = useAuth();
  const qc = useQueryClient();
  const allowed = canRelease(auth.role);

  const resultsQ = useQuery({
    queryKey: ["cloud-results", "pending_review"],
    queryFn: () => api.cloudResults("pending_review"),
    enabled: Boolean(auth.accessToken),
    refetchInterval: 10_000,
  });

  const releaseM = useMutation({
    mutationFn: (id: string) => api.releaseResult(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["cloud-results"] });
    },
  });

  const rows = sortForRelease(resultsQ.data ?? []);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Authorization
          </p>
          <h2 className="font-display text-3xl font-semibold tracking-tight">
            Release queue
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Cloud pending results. Only authorizers (or admins) can release to
            the doctor path.
            {!isCloudMode && (
              <>
                {" "}
                Tip: set <code className="text-xs">VITE_LIS_MODE=cloud</code> for
                the full cloud login flow.
              </>
            )}
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

      {auth.accessToken && !allowed && (
        <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
          Your role ({auth.role}) cannot release results. Ask an authorizer.
        </p>
      )}

      {resultsQ.isError && (
        <p className="text-sm text-lab-danger">
          {resultsQ.error instanceof ApiError
            ? resultsQ.error.message
            : "Failed to load cloud results"}
        </p>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2.5 font-medium">Observed</th>
                <th className="px-3 py-2.5 font-medium">Accession</th>
                <th className="px-3 py-2.5 font-medium">Test</th>
                <th className="px-3 py-2.5 font-medium">Value</th>
                <th className="px-3 py-2.5 font-medium">Flag</th>
                <th className="px-3 py-2.5 font-medium" />
              </tr>
            </thead>
            <tbody>
              {resultsQ.isLoading && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-12 text-center text-muted-foreground"
                  >
                    Loading…
                  </td>
                </tr>
              )}
              {!resultsQ.isLoading && rows.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-12 text-center text-muted-foreground"
                  >
                    No pending_review results in cloud.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className={cn(
                    "border-t border-border/60 transition-colors",
                    !isAlarmFlag(r.flag) && "hover:bg-muted/35",
                    flagRowClass(r.flag),
                  )}
                >
                  <td className="px-3 py-2.5 whitespace-nowrap text-xs text-muted-foreground align-middle">
                    {new Date(r.observed_at).toLocaleString()}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs tracking-tight align-middle">
                    {r.accession_number}
                  </td>
                  <td className="px-3 py-2.5 align-middle">
                    <span className="font-medium">{r.test_code}</span>
                    {r.test_name ? (
                      <span className="text-muted-foreground">
                        {" "}
                        · {r.test_name}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 align-middle">
                    <span className={flagValueClass(r.flag)}>{r.value}</span>
                    {r.units ? (
                      <span className="text-muted-foreground"> {r.units}</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 align-middle">
                    <FlagChip flag={r.flag} />
                  </td>
                  <td className="px-3 py-2.5 text-right align-middle">
                    <Button
                      size="sm"
                      disabled={!allowed || releaseM.isPending}
                      onClick={() => releaseM.mutate(r.id)}
                    >
                      Release
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {releaseM.isError && (
        <p className="text-sm text-lab-danger">
          {releaseM.error instanceof ApiError
            ? releaseM.error.message
            : "Release failed"}
        </p>
      )}
    </div>
  );
}
