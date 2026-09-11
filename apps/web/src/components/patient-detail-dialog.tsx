import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import { isAdmin, useAuth } from "../lib/auth";
import {
  chartStatusLabel,
  chartStatusVariant,
  CHART_STATUS_HELP,
  HOSPITAL_REGISTRY_LINK_HELP,
  HOSPITAL_SYSTEM_ID_HELP,
  hospitalRegistryLinkLabel,
  registrationSourceLabel,
  REGISTRATION_SOURCE_HELP,
} from "../lib/patient-display";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { PatientReportExportMenu } from "./patient-report-export-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

function FieldWithHelp({
  label,
  help,
  value,
}: {
  label: string;
  help?: string;
  value: ReactNode;
}) {
  return (
    <div className="py-3 first:pt-0">
      <div className="grid grid-cols-1 gap-x-3 gap-y-1 text-sm sm:grid-cols-[8.5rem_1fr]">
        <dt className="font-medium text-muted-foreground">{label}</dt>
        <dd className="min-w-0 text-foreground">{value}</dd>
      </div>
      {help ? (
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground sm:pl-[8.5rem]">
          {help}
        </p>
      ) : null}
    </div>
  );
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
  const auth = useAuth();
  const admin = isAdmin(auth.role);
  const queryClient = useQueryClient();
  const [statusError, setStatusError] = useState<string | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);

  const q = useQuery({
    queryKey: ["patient", patientId],
    queryFn: () => api.patient(patientId!),
    enabled: open && Boolean(patientId),
  });

  const updateStatus = useMutation({
    mutationFn: (status: "active" | "inactive") =>
      api.updatePatientStatus(patientId!, status),
    onSuccess: async () => {
      setStatusError(null);
      setConfirmDeactivate(false);
      await queryClient.invalidateQueries({ queryKey: ["patients"] });
      await queryClient.invalidateQueries({ queryKey: ["patient", patientId] });
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        setStatusError(err.message);
      } else if (err instanceof Error) {
        setStatusError(err.message);
      } else {
        setStatusError("Could not update chart status");
      }
    },
  });

  const p = q.data;
  const canToggleStatus =
    admin && p && p.status !== "quarantined" && auth.accessToken;
  const showDeactivate = canToggleStatus && p.status === "active";
  const showReactivate = canToggleStatus && p.status === "inactive";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setConfirmDeactivate(false);
          setStatusError(null);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{p?.displayName ?? "Patient"}</DialogTitle>
          <DialogDescription>
            Lab patient chart — used for accession and bench. Demographics come
            from the main hospital registry import or registration at this lab.
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
                <FieldWithHelp
                  label="MRN"
                  value={
                    <span className="font-mono text-xs tracking-tight">
                      {p.mrn}
                    </span>
                  }
                />
                <FieldWithHelp
                  label="Date of birth"
                  value={p.dateOfBirth ?? "—"}
                />
                <FieldWithHelp label="Sex" value={p.sex ?? "—"} />
                <FieldWithHelp
                  label="Chart status"
                  help={CHART_STATUS_HELP}
                  value={
                    <Badge variant={chartStatusVariant(p.status)}>
                      {chartStatusLabel(p.status)}
                    </Badge>
                  }
                />
                <FieldWithHelp
                  label="Registration source"
                  help={REGISTRATION_SOURCE_HELP}
                  value={
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                      {registrationSourceLabel(p.identityOrigin)}
                      {p.identityOrigin === "local_provisional" && (
                        <Badge variant="warn">Provisional</Badge>
                      )}
                      {p.requiresIdentityConfirmation && (
                        <Badge variant="warn">Suspect group</Badge>
                      )}
                    </span>
                  }
                />
                <FieldWithHelp
                  label="Hospital registry link"
                  help={HOSPITAL_REGISTRY_LINK_HELP}
                  value={hospitalRegistryLinkLabel(p.syncStatus)}
                />
                <FieldWithHelp
                  label="Hospital system ID"
                  help={HOSPITAL_SYSTEM_ID_HELP}
                  value={
                    p.externalId ? (
                      <span className="font-mono text-xs">{p.externalId}</span>
                    ) : (
                      "—"
                    )
                  }
                />
              </dl>

              {p.status === "quarantined" && (
                <p className="mt-4 rounded-lg border border-lab-danger/25 bg-lab-danger/5 px-3 py-2.5 text-xs text-muted-foreground">
                  This chart is quarantined because of an identity conflict.
                  Status is managed by the system — use{" "}
                  <strong className="font-medium text-foreground">
                    Identity review
                  </strong>{" "}
                  to resolve duplicates.
                </p>
              )}

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

              {statusError ? (
                <p className="mt-3 text-sm text-lab-danger" role="alert">
                  {statusError}
                </p>
              ) : null}

              {showDeactivate && confirmDeactivate ? (
                <div className="mt-4 rounded-lg border border-border bg-muted/30 px-3 py-3">
                  <p className="text-sm text-foreground">
                    Deactivate this chart? The patient will be hidden from the
                    default registry list and cannot receive new specimens until
                    reactivated.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="border-lab-danger/40 text-lab-danger hover:bg-lab-danger/10"
                      disabled={updateStatus.isPending}
                      onClick={() => updateStatus.mutate("inactive")}
                    >
                      {updateStatus.isPending
                        ? "Deactivating…"
                        : "Confirm deactivate"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={updateStatus.isPending}
                      onClick={() => setConfirmDeactivate(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>

        {p && patientId ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-3">
            <div className="flex flex-wrap gap-2">
              {showDeactivate && !confirmDeactivate ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmDeactivate(true)}
                >
                  Deactivate chart
                </Button>
              ) : null}
              {showReactivate ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={updateStatus.isPending}
                  onClick={() => updateStatus.mutate("active")}
                >
                  {updateStatus.isPending ? "Reactivating…" : "Reactivate chart"}
                </Button>
              ) : null}
            </div>
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
