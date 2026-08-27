import { useDeferredValue, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api, type PatientListItem } from "../../lib/api";
import { PatientDetailDialog } from "../../components/patient-detail-dialog";
import { Badge } from "../../components/ui/badge";
import { Input } from "../../components/ui/input";
import { cn } from "../../lib/utils";
import { useIsDesktop } from "../../lib/use-media-query";

export const Route = createFileRoute("/_lab/patients")({
  component: PatientsPage,
});

function PatientsPage() {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const isDesktop = useIsDesktop();

  const patientsQ = useQuery({
    queryKey: ["patients", deferredQuery],
    queryFn: () => api.patients(deferredQuery),
  });

  const rows = patientsQ.data ?? [];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Registry
          </p>
          <h2 className="font-display text-2xl font-semibold sm:text-3xl tracking-tight">
            Patients
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Local edge MRN registry — operational identity for registration and
            bench review.
          </p>
        </div>
        <span className="text-xs text-muted-foreground">
          {patientsQ.isFetching
            ? "Refreshing…"
            : `${rows.length} patient${rows.length === 1 ? "" : "s"}`}
        </span>
      </div>

      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search name or MRN…"
        className="max-w-md"
      />

      {patientsQ.isError && (
        <p className="text-sm text-lab-danger">
          Could not load patients. Is edge-engine running?
        </p>
      )}

      {!isDesktop ? (
        <div className="space-y-2">
          {patientsQ.isLoading && (
            <p className="rounded-xl border border-border bg-card px-3 py-12 text-center text-muted-foreground">
              Loading…
            </p>
          )}
          {!patientsQ.isLoading && rows.length === 0 && (
            <p className="rounded-xl border border-border bg-card px-3 py-12 text-center text-muted-foreground">
              No patients found. Seed with{" "}
              <code className="text-xs">POST /patients/seed</code>.
            </p>
          )}
          {rows.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelectedId(p.id)}
              className="w-full rounded-xl border border-border bg-card p-3 text-left shadow-sm transition-colors hover:bg-muted/35"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0 truncate font-medium">
                  {p.displayName}
                </span>
                <StatusBadges patient={p} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                <span className="font-mono">{p.mrn}</span> ·{" "}
                {p.dateOfBirth ?? "—"} · {p.sex ?? "—"}
              </p>
              <div className="mt-1 flex flex-wrap gap-1">
                {p.identityOrigin === "local_provisional" && (
                  <Badge variant="warn" className="px-1 py-0 text-[10px]">
                    Provisional
                  </Badge>
                )}
                {p.requiresIdentityConfirmation && (
                  <Badge variant="warn" className="px-1 py-0 text-[10px]">
                    Suspect
                  </Badge>
                )}
              </div>
            </button>
          ))}
        </div>
      ) : (
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2.5 font-medium">Name</th>
                <th className="px-3 py-2.5 font-medium">MRN</th>
                <th className="px-3 py-2.5 font-medium">DOB</th>
                <th className="px-3 py-2.5 font-medium">Sex</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {patientsQ.isLoading && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-3 py-12 text-center text-muted-foreground"
                  >
                    Loading…
                  </td>
                </tr>
              )}
              {!patientsQ.isLoading && rows.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-3 py-12 text-center text-muted-foreground"
                  >
                    No patients found. Seed with{" "}
                    <code className="text-xs">POST /patients/seed</code>.
                  </td>
                </tr>
              )}
              {rows.map((p) => (
                <tr
                  key={p.id}
                  className={cn(
                    "border-t border-border/60 transition-colors hover:bg-muted/35",
                    selectedId === p.id && "bg-accent/5",
                  )}
                >
                  <td className="px-3 py-2.5 align-middle">
                    <button
                      type="button"
                      className="text-left font-medium underline-offset-2 hover:underline"
                      onClick={() => setSelectedId(p.id)}
                    >
                      {p.displayName}
                    </button>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {p.identityOrigin === "local_provisional" && (
                        <Badge variant="warn" className="px-1 py-0 text-[10px]">
                          Provisional
                        </Badge>
                      )}
                      {p.requiresIdentityConfirmation && (
                        <Badge variant="warn" className="px-1 py-0 text-[10px]">
                          Suspect
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 align-middle font-mono text-xs tracking-tight">
                    {p.mrn}
                  </td>
                  <td className="px-3 py-2.5 align-middle text-muted-foreground">
                    {p.dateOfBirth ?? "—"}
                  </td>
                  <td className="px-3 py-2.5 align-middle text-muted-foreground">
                    {p.sex ?? "—"}
                  </td>
                  <td className="px-3 py-2.5 align-middle">
                    <StatusBadges patient={p} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      )}

      <PatientDetailDialog
        patientId={selectedId}
        open={Boolean(selectedId)}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      />
    </div>
  );
}

function StatusBadges({ patient }: { patient: PatientListItem }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <Badge variant={patient.status === "quarantined" ? "danger" : "muted"}>
        {patient.status}
      </Badge>
    </span>
  );
}
