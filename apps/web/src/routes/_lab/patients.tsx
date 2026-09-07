import { useDeferredValue, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { searchQueryField } from "@drax-lis/contracts";
import { api, type PatientListItem } from "../../lib/api";
import { PatientDetailDialog } from "../../components/patient-detail-dialog";
import { RegisterPatientDialog } from "../../components/patients/register-patient-dialog";
import {
  IdentityReviewPanel,
  useIdentityReviewPendingCount,
} from "../../components/patients/identity-review-panel";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { ClearableInput } from "../../components/ui/clearable-input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { cn } from "../../lib/utils";
import { useIsDesktop, useIsWide } from "../../lib/use-media-query";

type PatientsSearch = {
  register?: boolean;
  seed?: string;
  tab?: "registry" | "review";
};

export const Route = createFileRoute("/_lab/patients")({
  validateSearch: (search: Record<string, unknown>): PatientsSearch => ({
    register: search.register === true || search.register === "true",
    seed:
      typeof search.seed === "string" && search.seed.trim()
        ? search.seed.trim()
        : undefined,
    tab: search.tab === "review" ? "review" : "registry",
  }),
  component: PatientsPage,
});

function PatientsPage() {
  const navigate = Route.useNavigate();
  const { register: openRegister, seed, tab } = Route.useSearch();
  const [query, setQuery] = useState("");
  const [queryError, setQueryError] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(query);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [registerOpen, setRegisterOpen] = useState(false);
  const isDesktop = useIsDesktop();
  const isWide = useIsWide();
  const pendingReviewCount = useIdentityReviewPendingCount();

  useEffect(() => {
    if (openRegister) setRegisterOpen(true);
  }, [openRegister]);

  const patientsQ = useQuery({
    queryKey: ["patients", deferredQuery],
    queryFn: () => api.patients(deferredQuery),
    enabled: tab === "registry",
  });

  const rows = patientsQ.data ?? [];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 lg:space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3 lg:gap-4">
        <div className={cn(!isWide && "hidden")}>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Registry
          </p>
          <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            Patients
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Register new patients and look up who is in the lab system for
            accessioning and bench review.
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:justify-end">
          {tab === "registry" ? (
            <span className="text-xs text-muted-foreground">
              {patientsQ.isFetching
                ? "Refreshing…"
                : `${rows.length} patient${rows.length === 1 ? "" : "s"}`}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">
              {pendingReviewCount} pending review
              {pendingReviewCount === 1 ? "" : "s"}
            </span>
          )}
          <Button
            type="button"
            size={isWide ? "default" : "lg"}
            className={cn(!isWide && "min-h-10 flex-1 sm:flex-none")}
            onClick={() => setRegisterOpen(true)}
          >
            Register patient
          </Button>
        </div>
      </div>

      <Tabs
        value={tab}
        onValueChange={(value) => {
          void navigate({
            search: (prev) => ({
              ...prev,
              tab: value === "review" ? "review" : undefined,
            }),
          });
        }}
      >
        <TabsList>
          <TabsTrigger value="registry">Registry</TabsTrigger>
          <TabsTrigger value="review">
            Identity review
            {pendingReviewCount > 0 ? (
              <Badge variant="warn" className="ml-1.5 px-1.5 py-0 text-[10px]">
                {pendingReviewCount}
              </Badge>
            ) : null}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="registry" className="mt-4 space-y-4">
          <ClearableInput
            value={query}
            onChange={(e) => {
              setQueryError(null);
              setQuery(e.target.value);
            }}
            onBlur={() => {
              const parsed = searchQueryField.safeParse(query);
              if (!parsed.success) {
                setQueryError(
                  parsed.error.issues[0]?.message ?? "Invalid search",
                );
                return;
              }
              if (parsed.data !== query) setQuery(parsed.data);
              setQueryError(null);
            }}
            placeholder="Search name or MRN…"
            wrapperClassName="max-w-md"
            maxLength={200}
            aria-invalid={Boolean(queryError)}
          />
          {queryError ? (
            <p className="text-xs text-lab-danger" role="alert">
              {queryError}
            </p>
          ) : null}

          {patientsQ.isError && (
            <p className="text-sm text-lab-danger">
              Could not load patients. Please try again.
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
                  No patients found. Register a patient using the button above.
                </p>
              )}
              {rows.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedId(p.id)}
                  className={cn(
                    "w-full rounded-xl border border-border bg-card p-3.5 text-left shadow-sm transition-colors hover:bg-muted/35",
                    selectedId === p.id && "ring-1 ring-inset ring-accent/40",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 truncate text-base font-medium">
                      {p.displayName}
                    </span>
                    <StatusBadges patient={p} />
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    <span className="font-mono">{p.mrn}</span> ·{" "}
                    {p.dateOfBirth ?? "—"} · {p.sex ?? "—"}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
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
                          No patients found. Register a patient using the button
                          above.
                        </td>
                      </tr>
                    )}
                    {rows.map((p) => (
                      <tr
                        key={p.id}
                        onClick={() => setSelectedId(p.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelectedId(p.id);
                          }
                        }}
                        tabIndex={0}
                        role="button"
                        aria-label={`Open ${p.displayName}`}
                        className={cn(
                          "cursor-pointer border-t border-border/60 transition-colors hover:bg-muted/35",
                          selectedId === p.id && "bg-accent/5",
                        )}
                      >
                        <td className="px-3 py-2.5 align-middle">
                          <span className="font-medium">{p.displayName}</span>
                          <div className="mt-0.5 flex flex-wrap gap-1">
                            {p.identityOrigin === "local_provisional" && (
                              <Badge
                                variant="warn"
                                className="px-1 py-0 text-[10px]"
                              >
                                Provisional
                              </Badge>
                            )}
                            {p.requiresIdentityConfirmation && (
                              <Badge
                                variant="warn"
                                className="px-1 py-0 text-[10px]"
                              >
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
        </TabsContent>

        <TabsContent value="review" className="mt-4">
          <IdentityReviewPanel onOpenPatient={setSelectedId} />
        </TabsContent>
      </Tabs>

      <PatientDetailDialog
        patientId={selectedId}
        open={Boolean(selectedId)}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      />

      <RegisterPatientDialog
        open={registerOpen}
        onOpenChange={setRegisterOpen}
        nameSeed={seed}
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
