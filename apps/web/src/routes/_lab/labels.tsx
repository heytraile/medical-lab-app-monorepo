import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueries, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScanLine } from "lucide-react";
import { accessionInputField } from "@drax-lis/contracts";
import { buildSpecimenLabelInput } from "@drax-lis/catalog";
import { ApiError, api, type LabelPreviewFields } from "../../lib/api";
import {
  findContainersByAccession,
  PRINT_API_UNAVAILABLE_MSG,
  TEST_LABEL_PREVIEW,
} from "../../lib/label-preview-from-specimen";
import {
  buildLabelPreviewFromPrintGroup,
  labelPrintGroupsFromSpecimenRows,
} from "../../lib/label-print-preview";
import { useCatalog } from "../../lib/use-catalog";
import { useScanInput } from "../../lib/use-barcode-scanner";
import { AccessioningShell } from "../../components/accessioning/accessioning-shell";
import {
  MultiLabelPreviewPanel,
  type LabelPreviewItem,
} from "../../components/accessioning/multi-label-preview-panel";
import { Button } from "../../components/ui/button";
import { ScrollContainer } from "../../components/ui/scroll-container";
import { ClearableInput } from "../../components/ui/clearable-input";
import { Select } from "../../components/ui/select";
import { SpecimenAccessionStatusChip } from "../../components/result-status";
import { cn } from "../../lib/utils";
import {
  useIsWorkstation,
  useShowWorkstationChrome,
} from "../../lib/use-media-query";
import {
  actorDisplayName,
  parsePatientJson,
  patientDisplayNameFromJson,
} from "../../lib/specimen-display";
import { groupSpecimensIntoSessions } from "../../lib/accession-sessions";
import { resolveAccessionFromSearch } from "../../lib/specimen-search";
import { useDebouncedValue } from "../../lib/use-debounced-value";

type LabelsSearch = {
  accession?: string;
};

function isPrintApiMissing(err: unknown): boolean {
  return err instanceof ApiError && err.status === 404;
}

export const Route = createFileRoute("/_lab/labels")({
  validateSearch: (search: Record<string, unknown>): LabelsSearch => ({
    accession:
      typeof search.accession === "string" && search.accession.trim()
        ? search.accession.trim()
        : undefined,
  }),
  component: LabelsPage,
});

function LabelsPage() {
  const isWorkstation = useIsWorkstation();
  const showWorkstationChrome = useShowWorkstationChrome();
  const { accession: accessionFromUrl } = Route.useSearch();
  const navigate = useNavigate();
  /** Filters the left list — not tied to the selected preview row. */
  const [filterQuery, setFilterQuery] = useState("");
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [activeAccession, setActiveAccession] = useState(
    accessionFromUrl?.trim() ?? "",
  );
  const debouncedFilter = useDebouncedValue(filterQuery, 200);
  const [printStatus, setPrintStatus] = useState<{
    ok: boolean;
    error?: string;
  } | null>(null);
  const [reprintStatuses, setReprintStatuses] = useState<
    Record<string, { ok: boolean; error?: string }>
  >({});
  const [copies, setCopies] = useState(1);
  const [testPreview, setTestPreview] = useState<LabelPreviewFields | null>(
    null,
  );
  const selectedRowRef = useRef<HTMLButtonElement | null>(null);

  const catalogQ = useCatalog();
  const labelRouting = catalogQ.data?.labelRouting;

  const specimensQ = useQuery({
    queryKey: ["specimens", debouncedFilter.trim()],
    queryFn: () => api.specimens(debouncedFilter.trim() || undefined),
  });

  useEffect(() => {
    if (accessionFromUrl) {
      setActiveAccession(accessionFromUrl.trim());
      setTestPreview(null);
    }
  }, [accessionFromUrl]);

  // The list is scrollable, so a scanned barcode or /labels?accession=… deep
  // link can select a row that is out of view. "nearest" keeps the page still.
  useEffect(() => {
    selectedRowRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeAccession, specimensQ.dataUpdatedAt]);

  const containerRows = useMemo(() => {
    if (!activeAccession.trim() || !specimensQ.data) return [];
    return findContainersByAccession(specimensQ.data, activeAccession);
  }, [activeAccession, specimensQ.data]);

  const labelPrintGroups = useMemo(
    () => labelPrintGroupsFromSpecimenRows(containerRows, labelRouting),
    [containerRows, labelRouting],
  );

  const edgePreviewQueries = useQueries({
    queries: labelPrintGroups.map((group) => ({
      queryKey: [
        "print-preview",
        "labels",
        group.primarySpecimenNumber,
        group.catalogCategory,
        group.orderedTestCodes.join(","),
        specimensQ.dataUpdatedAt,
      ],
      queryFn: async () => {
        const row =
          containerRows.find((r) => r.id === group.specimenIds[0]) ??
          containerRows[0]!;
        const patient = parsePatientJson(row.patientJson);
        const displayName = patientDisplayNameFromJson(row.patientJson);
        try {
          const res = await api.printPreview(
            buildSpecimenLabelInput({
              accessionNumber: row.accessionNumber,
              specimenNumber: group.primarySpecimenNumber,
              patientName: displayName === "—" ? "Unknown" : displayName,
              barcode: group.primaryBarcode,
              dateOfBirth: patient?.dateOfBirth,
              collectionType: group.collectionType,
              departmentKey: group.departmentKey,
              catalogCategory: group.catalogCategory,
              departmentLabel: group.departmentLabel,
              orderedTestCodes: group.orderedTestCodes,
              mrn: patient?.mrn,
              routing: labelRouting,
            }),
          );
          return { fields: res.fields, edgeFailed: false };
        } catch {
          return {
            fields: buildLabelPreviewFromPrintGroup(group, row, labelRouting),
            edgeFailed: true,
          };
        }
      },
      enabled: Boolean(containerRows.length),
      staleTime: 400,
    })),
  });

  const previewLookupError = useMemo(() => {
    if (!activeAccession.trim()) return null;
    if (specimensQ.isLoading) return null;
    if (specimensQ.isError) {
      return "Could not load specimens. Please try again.";
    }
    if (specimensQ.isSuccess && containerRows.length === 0) {
      return "Accession not found";
    }
    return null;
  }, [
    activeAccession,
    specimensQ.isLoading,
    specimensQ.isError,
    specimensQ.isSuccess,
    containerRows.length,
  ]);

  const previewLabels = useMemo((): LabelPreviewItem[] => {
    if (testPreview && containerRows.length === 0) {
      return [
        {
          id: "test-label",
          specimenType: testPreview.specimenType,
          fields: testPreview,
          accessionNumber: testPreview.accessionNumber,
          printStatus,
        },
      ];
    }
    return labelPrintGroups.map((group, i) => {
      const key =
        group.specimenIds[0] ?? group.primarySpecimenNumber ?? `label-${i}`;
      const row =
        containerRows.find((r) => r.id === group.specimenIds[0]) ??
        containerRows[0]!;
      return {
        id: key,
        specimenType: group.collectionType,
        fields:
          edgePreviewQueries[i]?.data?.fields ??
          buildLabelPreviewFromPrintGroup(group, row, labelRouting),
        accessionNumber: row.accessionNumber,
        printStatus: reprintStatuses[key] ?? null,
        testCount: group.orderedTestCodes.length,
      };
    });
  }, [
    containerRows,
    labelPrintGroups,
    edgePreviewQueries,
    reprintStatuses,
    testPreview,
    printStatus,
    labelRouting,
  ]);

  const previewPhase =
    previewLabels.length > 0 || testPreview ? "registered" : "idle";

  const previewWarning =
    edgePreviewQueries.some((q) => q.data?.edgeFailed) &&
    previewLabels.length > 0
      ? "Could not load the label preview — showing the last saved preview."
      : undefined;

  const previewLoading =
    containerRows.length > 0 &&
    edgePreviewQueries.some((q) => q.isFetching && !q.data);

  const selectAccession = useCallback(
    (acc: string) => {
      const trimmed = acc.trim();
      if (!trimmed) {
        setActiveAccession("");
        setLookupError(null);
        setTestPreview(null);
        setPrintStatus(null);
        setReprintStatuses({});
        void navigate({ to: "/labels", search: {} });
        return;
      }

      const parsed = accessionInputField.safeParse(trimmed);
      if (!parsed.success) {
        setLookupError(
          parsed.error.issues[0]?.message ?? "Invalid accession",
        );
        return;
      }

      setActiveAccession(parsed.data);
      setLookupError(null);
      setTestPreview(null);
      setPrintStatus(null);
      setReprintStatuses({});
      void navigate({ to: "/labels", search: { accession: parsed.data } });
    },
    [navigate],
  );

  const resolveSearch = useCallback(async () => {
    const trimmed = filterQuery.trim();
    if (!trimmed) return;

    const specimens = specimensQ.data ?? [];
    const resolved = await resolveAccessionFromSearch(specimens, trimmed);
    if (resolved) {
      setFilterQuery("");
      selectAccession(resolved);
      return;
    }

    const parsed = accessionInputField.safeParse(trimmed);
    if (parsed.success) {
      setFilterQuery("");
      selectAccession(parsed.data);
      return;
    }

    const sessions = groupSpecimensIntoSessions(specimens);
    if (sessions.length === 1) {
      const acc =
        sessions[0]?.accessionNumbers[0] ??
        sessions[0]?.primary.accessionNumber;
      if (acc) {
        setFilterQuery("");
        selectAccession(acc);
      }
    }
  }, [filterQuery, specimensQ.data, selectAccession]);

  const reprintMutation = useMutation({
    mutationFn: (acc: string) =>
      api.reprintLabel({ accessionNumber: acc, copies }),
    onSuccess: (data) => {
      const statuses: Record<string, { ok: boolean; error?: string }> = {};
      for (const label of data.labels ?? []) {
        const key = label.specimenId ?? label.departmentKey ?? "label";
        statuses[key] = { ok: label.ok, error: label.error };
      }
      if (!data.labels?.length && data.fields) {
        statuses.default = { ok: data.ok, error: data.error };
      }
      setReprintStatuses(statuses);
      setPrintStatus({ ok: data.ok, error: data.error });
    },
    onError: (err) => {
      setPrintStatus({
        ok: false,
        error: isPrintApiMissing(err)
          ? PRINT_API_UNAVAILABLE_MSG
          : "Reprint failed",
      });
    },
  });

  const testMutation = useMutation({
    mutationFn: () => api.printTestLabel(copies),
    onSuccess: (data) => {
      setActiveAccession("");
      setFilterQuery("");
      setTestPreview(data.fields);
      setPrintStatus({ ok: data.ok, error: data.error });
      void navigate({ to: "/labels", search: {} });
    },
    onError: (err) => {
      if (isPrintApiMissing(err)) {
        setActiveAccession("");
        setFilterQuery("");
        setTestPreview(TEST_LABEL_PREVIEW);
        setPrintStatus({
          ok: false,
          error: PRINT_API_UNAVAILABLE_MSG,
        });
        void navigate({ to: "/labels", search: {} });
        return;
      }
      setPrintStatus({ ok: false, error: "Test label print failed" });
    },
  });

  const scanHandlers = useScanInput((value) => {
    setFilterQuery("");
    void (async () => {
      const acc = await resolveAccessionFromSearch(specimensQ.data ?? [], value);
      selectAccession(acc ?? value.trim());
    })();
  });

  const recentSessions = useMemo(
    () => groupSpecimensIntoSessions(specimensQ.data ?? []).slice(0, 50),
    [specimensQ.data],
  );

  const leftPanelControls = (
    <>
          <label className="block space-y-1.5">
            <span className="flex items-center gap-2 text-sm font-medium">
              <ScanLine className="size-4" />
              Scan or enter accession / specimen ID
            </span>
            <ClearableInput
              value={filterQuery}
              onChange={(e) => {
                setLookupError(null);
                setFilterQuery(e.target.value);
              }}
              onClear={() => setFilterQuery("")}
              placeholder="Patient, MRN, accession, or specimen ID…"
              autoComplete="off"
              autoFocus
              maxLength={200}
              aria-invalid={Boolean(lookupError)}
              leftSlot={<ScanLine className="size-4 text-muted-foreground" />}
              {...scanHandlers}
              onKeyDown={(e) => {
                scanHandlers.onKeyDown(e);
                if (e.key === "Enter" && !e.defaultPrevented) {
                  e.preventDefault();
                  void resolveSearch();
                }
              }}
            />
            {lookupError ? (
              <p className="text-xs text-lab-danger" role="alert">
                {lookupError}
              </p>
            ) : null}
          </label>

          <div className="flex flex-wrap items-center gap-3 [&>button]:h-11 [&>button]:flex-1 sm:[&>button]:h-9 sm:[&>button]:flex-none">
            <label className="flex items-center gap-2 text-sm">
              Copies
              <Select
                className="h-9 w-[4.5rem]"
                value={String(copies)}
                onValueChange={(v) => setCopies(Number(v))}
                aria-label="Label copies"
                options={[1, 2, 3, 4, 5].map((n) => ({
                  value: String(n),
                  label: String(n),
                }))}
              />
            </label>
            <Button
              type="button"
              disabled={!activeAccession.trim() || reprintMutation.isPending}
              onClick={() => reprintMutation.mutate(activeAccession.trim())}
            >
              {reprintMutation.isPending
                ? "Printing…"
                : containerRows.length > 1
                  ? "Reprint all labels"
                  : "Reprint label"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={testMutation.isPending}
              onClick={() => testMutation.mutate()}
            >
              Test label
            </Button>
          </div>
    </>
  );

  const recentRegistrationsList = (
            <ul className="divide-y divide-border">
              {specimensQ.isLoading && (
                <li className="px-3 py-2 text-sm text-muted-foreground">
                  Loading…
                </li>
              )}
              {!specimensQ.isLoading && recentSessions.length === 0 && (
                <li className="px-3 py-3 text-sm text-muted-foreground">
                  {debouncedFilter.trim() ? (
                    <>No accessions match “{debouncedFilter.trim()}”.</>
                  ) : (
                    <>
                      No specimens yet.{" "}
                      <Link
                        to="/accession"
                        className="font-medium text-foreground underline-offset-4 hover:underline"
                      >
                        Register a new specimen →
                      </Link>
                    </>
                  )}
                </li>
              )}
              {recentSessions.map((session) => {
                const s = session.primary;
                const isSelected = session.accessionNumbers.some(
                  (acc) =>
                    acc.toUpperCase() === activeAccession.trim().toUpperCase(),
                );
                const patientName =
                  s.patientDisplayName?.trim() ||
                  patientDisplayNameFromJson(s.patientJson);
                const registeredBy =
                  s.registeredByName?.trim() ||
                  actorDisplayName(s.registeredBySnapshot) ||
                  null;
                const collector = s.collectedByName?.trim() || null;
                const tubeLabel =
                  session.departmentLabels.length > 0
                    ? `${session.tubes.length} label${session.tubes.length === 1 ? "" : "s"} · ${session.departmentLabels.join(", ")}`
                    : session.tubes.length === 1
                      ? session.specimenTypes[0] ?? "blood"
                      : `${session.tubes.length} labels · ${session.specimenTypes.join(", ")}`;
                return (
                  <li key={session.key}>
                    <button
                      type="button"
                      ref={isSelected ? selectedRowRef : undefined}
                      aria-current={isSelected ? "true" : undefined}
                      className={cn(
                        "flex w-full flex-col items-start gap-1 border-l-2 px-3 py-2.5 text-left text-sm transition-colors",
                        isSelected
                          ? "border-l-accent bg-accent/10"
                          : "border-l-transparent hover:bg-muted",
                      )}
                      onClick={() => selectAccession(s.accessionNumber)}
                    >
                      <span className="flex w-full min-w-0 items-start justify-between gap-2">
                        <span className="min-w-0">
                          <span
                            className={cn(
                              "block truncate font-medium",
                              isSelected && "text-accent",
                            )}
                          >
                            {patientName}
                          </span>
                          <span
                            className={cn(
                              "font-mono text-xs tracking-tight",
                              isSelected
                                ? "text-accent/90"
                                : "text-muted-foreground",
                            )}
                          >
                            {session.accessionNumbers.join(" · ")}
                          </span>
                        </span>
                        <SpecimenAccessionStatusChip status={s.status} />
                      </span>
                      <span className="text-xs capitalize text-muted-foreground">
                        {tubeLabel}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(session.registeredAt).toLocaleString()}
                        {registeredBy ? ` · Reg: ${registeredBy}` : ""}
                        {collector ? ` · Collector: ${collector}` : ""}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
  );

  const previewPanel = (
          <MultiLabelPreviewPanel
            phase={previewPhase}
            labels={previewLabels}
            emptyContext="labels"
            loading={previewLoading}
            previewWarning={previewWarning}
            className={cn(
              isWorkstation && "min-h-0 flex-1 lg:static lg:self-stretch",
            )}
            actions={
              activeAccession.trim() && !previewLookupError ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  title="Bench shows results. If none yet, you’ll see a waiting state for this accession."
                  onClick={() =>
                    void navigate({
                      to: "/bench",
                      search: { q: activeAccession.trim() },
                    })
                  }
                >
                  Open in Bench
                </Button>
              ) : previewLookupError ? (
                <p className="text-xs text-lab-danger">{previewLookupError}</p>
              ) : undefined
            }
          />
  );

  const layout = (
      <div
        className={cn(
          "grid min-h-0 min-w-0 gap-4",
          isWorkstation
            ? "flex-1 overflow-hidden lg:grid-cols-2 lg:grid-rows-1 xl:gap-6"
            : "grid-cols-1 xl:grid-cols-2",
          !showWorkstationChrome && isWorkstation && "h-full",
        )}
      >
        <div
          className={cn(
            "flex min-h-0 min-w-0 flex-col gap-4 overflow-hidden rounded-xl border border-border bg-card p-4 shadow-sm lg:order-1 xl:p-5",
            isWorkstation ? "order-2 h-full lg:order-1" : "order-2",
            !isWorkstation && "space-y-4",
          )}
        >
          <div className="shrink-0 space-y-4">{leftPanelControls}</div>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <p className="mb-2 shrink-0 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {debouncedFilter.trim()
                ? "Matching registrations"
                : "Recent registrations"}
            </p>
            <ScrollContainer
              className={cn(
                "min-h-0 flex-1 rounded-md border border-border",
                !isWorkstation && "max-h-64",
              )}
            >
              {recentRegistrationsList}
            </ScrollContainer>
          </div>
        </div>

        <div
          className={cn(
            "min-h-0 min-w-0",
            isWorkstation
              ? "order-1 flex min-h-0 flex-col overflow-hidden lg:order-2"
              : "order-1 xl:order-2",
          )}
        >
          {previewPanel}
        </div>
      </div>
  );

  if (!isWorkstation) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-y-auto">
        <AccessioningShell
          title="Labels"
          description="Reprint tube labels, verify accessions, and check printer alignment."
        >
          {layout}
        </AccessioningShell>
      </div>
    );
  }

  return (
    <AccessioningShell
      wide
      title="Labels"
      description="Reprint tube labels, verify accessions, and check printer alignment."
    >
      {layout}
    </AccessioningShell>
  );
}
