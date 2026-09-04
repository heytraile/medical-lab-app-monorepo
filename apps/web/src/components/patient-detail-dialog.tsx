import { type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Badge } from "./ui/badge";
import { PatientReportExportMenu } from "./patient-report-export-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-x-3 gap-y-1 py-2 text-sm sm:grid-cols-[7.5rem_1fr]">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-foreground">{value}</dd>
    </div>
  );
}

function originLabel(origin: string | undefined) {
  if (origin === "local_provisional") return "Registered here";
  if (origin === "upstream") return "Main registry";
  return origin ?? "—";
}

function syncLabel(status: string | undefined) {
  switch (status) {
    case "pending_upstream":
      return "Waiting to link";
    case "synced":
      return "Linked";
    case "failed":
      return "Could not link";
    case "n_a":
      return "Not applicable";
    default:
      return status ?? "—";
  }
}

export function PatientDetailDialog({
  patientId,
  open,
  onOpenChange,
}: {
  patientId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const q = useQuery({
    queryKey: ["patient", patientId],
    queryFn: () => api.patient(patientId!),
    enabled: open && Boolean(patientId),
  });

  const p = q.data;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{p?.displayName ?? "Patient"}</DialogTitle>
          <DialogDescription>
            Patient details for bench review.
          </DialogDescription>
        </DialogHeader>

        <div className="px-5 py-4">
          {q.isLoading && (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}
          {q.isError && (
            <p className="text-sm text-lab-danger">
              Could not load patient details.
            </p>
          )}
          {p && (
            <>
              <dl className="divide-y divide-border/70">
                <Field
                  label="MRN"
                  value={
                    <span className="font-mono text-xs tracking-tight">
                      {p.mrn}
                    </span>
                  }
                />
                <Field label="Date of birth" value={p.dateOfBirth ?? "—"} />
                <Field label="Sex" value={p.sex ?? "—"} />
                <Field
                  label="Status"
                  value={
                    <Badge
                      variant={
                        p.status === "quarantined" ? "danger" : "muted"
                      }
                    >
                      {p.status}
                    </Badge>
                  }
                />
                <Field
                  label="Identity"
                  value={
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                      {originLabel(p.identityOrigin)}
                      {p.identityOrigin === "local_provisional" && (
                        <Badge variant="warn">Provisional</Badge>
                      )}
                      {p.requiresIdentityConfirmation && (
                        <Badge variant="warn">Suspect group</Badge>
                      )}
                    </span>
                  }
                />
                <Field label="Record status" value={syncLabel(p.syncStatus)} />
                {p.externalId ? (
                  <Field
                    label="External ID"
                    value={
                      <span className="font-mono text-xs">{p.externalId}</span>
                    }
                  />
                ) : null}
              </dl>

              {p.siblings.length > 0 && (
                <div className="mt-4 rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-3">
                  <p className="text-xs font-medium uppercase tracking-wider text-amber-900 dark:text-amber-200">
                    Suspect siblings
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Same demographics, different MRNs — confirm identity when
                    registering.
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {p.siblings.map((s) => (
                      <li
                        key={s.id}
                        className="flex items-baseline justify-between gap-2 text-sm"
                      >
                        <span>{s.displayName}</span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {s.mrn}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>

        {p && patientId ? (
          <div className="flex justify-end border-t border-border px-5 py-3">
            <PatientReportExportMenu
              patientId={patientId}
              patientLabel={p.displayName}
            />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
