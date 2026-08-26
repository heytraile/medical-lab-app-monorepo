import { useEffect, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import {
  api,
  type BenchPatientSummary,
  type BenchResult,
} from "../lib/api";
import { analyzerLabel } from "../lib/analyzers";
import {
  FlagChip,
  WorkflowStatusChip,
  flagRowClass,
  flagValueClass,
  isAlarmFlag,
} from "./result-status";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { cn } from "../lib/utils";

function Field({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] gap-x-2 gap-y-0.5 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-foreground">{value}</dd>
    </div>
  );
}

function originLabel(origin: string | undefined) {
  if (origin === "local_provisional") return "Provisional (local)";
  if (origin === "upstream") return "Upstream registry";
  return origin ?? "—";
}

export function BenchPatientPanel({
  patientId,
  summary,
  results,
  onClose,
}: {
  patientId: string;
  summary: BenchPatientSummary | null;
  results: BenchResult[];
  onClose: () => void;
}) {
  const detailQ = useQuery({
    queryKey: ["patient", patientId],
    queryFn: () => api.patient(patientId),
  });

  const p = detailQ.data;
  const displayName =
    p?.displayName ?? summary?.displayName ?? "Patient";
  const mrn = p?.mrn ?? summary?.mrn ?? "—";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const sorted = [...results].sort(
    (a, b) =>
      new Date(b.observedAt).getTime() - new Date(a.observedAt).getTime(),
  );

  return (
    <aside
      className={cn(
        "flex max-h-[calc(100svh-8rem)] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm",
      )}
    >
      <div className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Patient focus
          </p>
          <h3 className="truncate font-display text-lg font-semibold tracking-tight">
            {displayName}
          </h3>
          <p className="mt-0.5 font-mono text-xs tracking-tight text-muted-foreground">
            {mrn}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0"
          onClick={onClose}
          aria-label="Close patient panel"
        >
          <X className="size-4" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="border-b border-border px-4 py-3">
          {detailQ.isLoading && !summary && (
            <p className="text-sm text-muted-foreground">Loading identity…</p>
          )}
          {detailQ.isError && !summary && (
            <p className="text-sm text-lab-danger">Could not load patient.</p>
          )}
          <dl className="divide-y divide-border/60">
            <Field
              label="Date of birth"
              value={p?.dateOfBirth ?? summary?.dateOfBirth ?? "—"}
            />
            <Field label="Sex" value={p?.sex ?? summary?.sex ?? "—"} />
            <Field
              label="Status"
              value={
                <Badge
                  variant={
                    (p?.status ?? summary?.status) === "quarantined"
                      ? "danger"
                      : "muted"
                  }
                >
                  {p?.status ?? summary?.status ?? "—"}
                </Badge>
              }
            />
            <Field
              label="Identity"
              value={
                <span className="inline-flex flex-wrap items-center gap-1.5">
                  {originLabel(p?.identityOrigin ?? summary?.identityOrigin)}
                  {(p?.identityOrigin ?? summary?.identityOrigin) ===
                    "local_provisional" && (
                    <Badge variant="warn" className="px-1 py-0 text-[10px]">
                      Provisional
                    </Badge>
                  )}
                  {p?.requiresIdentityConfirmation && (
                    <Badge variant="warn" className="px-1 py-0 text-[10px]">
                      Suspect
                    </Badge>
                  )}
                </span>
              }
            />
          </dl>

          {p && p.siblings.length > 0 && (
            <div className="mt-3 rounded-lg border border-amber-500/25 bg-amber-500/5 px-2.5 py-2">
              <p className="text-[10px] font-medium uppercase tracking-wider text-amber-900 dark:text-amber-200">
                Suspect siblings
              </p>
              <ul className="mt-1.5 space-y-1">
                {p.siblings.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-baseline justify-between gap-2 text-xs"
                  >
                    <span>{s.displayName}</span>
                    <span className="font-mono text-muted-foreground">
                      {s.mrn}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="px-4 py-3">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              All results
            </p>
            <span className="text-[11px] text-muted-foreground">
              {sorted.length} test{sorted.length === 1 ? "" : "s"}
            </span>
          </div>

          {sorted.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No results for this patient in the current load.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[32rem] text-left text-xs">
                <thead className="border-b border-border bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-2 py-2 font-medium">Observed</th>
                    <th className="px-2 py-2 font-medium">Test</th>
                    <th className="px-2 py-2 font-medium">Value</th>
                    <th className="px-2 py-2 font-medium">Flag</th>
                    <th className="px-2 py-2 font-medium">Accession</th>
                    <th className="px-2 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r) => (
                    <tr
                      key={r.id}
                      className={cn(
                        "border-t border-border/60",
                        flagRowClass(r.flag),
                      )}
                    >
                      <td className="px-2 py-2 align-middle whitespace-nowrap text-[10px] text-muted-foreground">
                        {new Date(r.observedAt).toLocaleString()}
                      </td>
                      <td className="px-2 py-2 align-middle">
                        <div className="font-medium">{r.testCode}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {analyzerLabel(r.analyzerId)}
                        </div>
                      </td>
                      <td className="px-2 py-2 align-middle whitespace-nowrap">
                        <span className={flagValueClass(r.flag)}>{r.value}</span>
                        {r.units ? (
                          <span className="text-muted-foreground">
                            {" "}
                            {r.units}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-2 py-2 align-middle">
                        <FlagChip flag={r.flag} />
                      </td>
                      <td className="px-2 py-2 align-middle font-mono text-[10px] tracking-tight">
                        {r.accessionNumber}
                      </td>
                      <td className="px-2 py-2 align-middle">
                        <WorkflowStatusChip
                          status={r.status ?? "pending_review"}
                          onAlarm={isAlarmFlag(r.flag)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="mt-2 text-[11px] text-muted-foreground">
            Showing every loaded result for this patient (all tabs / filters).
          </p>
        </div>
      </div>
    </aside>
  );
}
