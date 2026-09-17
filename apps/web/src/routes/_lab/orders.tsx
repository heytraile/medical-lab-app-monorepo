import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueries, useQuery } from "@tanstack/react-query";
import {
  useMemo,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { ScanLine } from "lucide-react";
import { api, type SpecimenRow } from "../../lib/api";
import {
  mergeOrderedTestsLookup,
  parseOrderedTestsJson,
  type ParsedOrderedTest,
} from "../../lib/ordered-tests";
import { resolveAccessionFromSearch } from "../../lib/specimen-search";
import {
  findSessionByAccession,
  groupSpecimensIntoSessions,
  type AccessionSession,
  type OrderSelectionSnapshot,
} from "../../lib/accession-sessions";
import { buildSpecimenLabelInput } from "@drax-lis/catalog";
import { findContainersByAccession } from "../../lib/label-preview-from-specimen";
import {
  buildLabelPreviewFromPrintGroup,
  labelPrintGroupsFromSpecimenRows,
} from "../../lib/label-print-preview";
import {
  MultiLabelPreviewPanel,
  type LabelPreviewItem,
} from "../../components/accessioning/multi-label-preview-panel";
import { AccessionPeopleBlockForAccession } from "../../components/accession-people-block";
import {
  actorDisplayName,
  parseOrderedTests,
  parsePatientJson,
  patientDisplayNameFromJson,
  accessionIntegrityNotes,
} from "../../lib/specimen-display";
import { useDebouncedValue } from "../../lib/use-debounced-value";
import { useScanInput } from "../../lib/use-barcode-scanner";
import { AccessioningShell } from "../../components/accessioning/accessioning-shell";
import { Button } from "../../components/ui/button";
import { ClearableInput } from "../../components/ui/clearable-input";
import { SpecimenAccessionStatusChip } from "../../components/result-status";
import { Badge } from "../../components/ui/badge";
import { ScrollContainer } from "../../components/ui/scroll-container";
import {
  useIsWorkstation,
  useShowWorkstationChrome,
} from "../../lib/use-media-query";
import { cn } from "../../lib/utils";
import { useCatalog } from "../../lib/use-catalog";
import { CatalogOfflineBanner } from "../../components/catalog-offline-banner";

type OrdersSearch = { accession?: string };

export const Route = createFileRoute("/_lab/orders")({
  validateSearch: (search: Record<string, unknown>): OrdersSearch => ({
    accession:
      typeof search.accession === "string" && search.accession.trim()
        ? search.accession.trim()
        : undefined,
  }),
  component: OrdersLookupPage,
});

function OrdersLookupPage() {
  const navigate = useNavigate();
  const isWorkstation = useIsWorkstation();
  const showWorkstationChrome = useShowWorkstationChrome();
  const catalogQ = useCatalog();
  const { accession: routeAccession } = Route.useSearch();
  /** Filters the left list only — never tied to the selected row. */
  const [filterQuery, setFilterQuery] = useState("");
  const [selectedAccession, setSelectedAccession] = useState(
    routeAccession?.trim() ?? "",
  );
  const selectedRowRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    setSelectedAccession(routeAccession?.trim() ?? "");
  }, [routeAccession]);

  useEffect(() => {
    selectedRowRef.current?.scrollIntoView({ block: "nearest" });
  }, [selectedAccession]);

  const debouncedFilter = useDebouncedValue(filterQuery, 200);

  const clearFilter = useCallback(() => {
    setFilterQuery("");
  }, []);

  const specimensQ = useQuery({
    queryKey: ["specimens", debouncedFilter.trim()],
    queryFn: () => api.specimens(debouncedFilter.trim() || undefined),
    staleTime: 10_000,
  });

  const suggestions = useMemo(
    () => groupSpecimensIntoSessions(specimensQ.data ?? []).slice(0, 50),
    [specimensQ.data],
  );

  const selectedSession = useMemo(
    () =>
      selectedAccession.trim()
        ? findSessionByAccession(suggestions, selectedAccession)
        : undefined,
    [selectedAccession, suggestions],
  );

  const selectAccession = useCallback(
    (acc: string) => {
      const trimmed = acc.trim();
      if (!trimmed) {
        setSelectedAccession("");
        void navigate({ to: "/orders", search: {} });
        return;
      }
      setSelectedAccession(trimmed);
      void navigate({ to: "/orders", search: { accession: trimmed } });
    },
    [navigate],
  );

  const confirmFromInput = useCallback(async () => {
    const trimmed = filterQuery.trim();
    if (!trimmed) return;

    const specimens = specimensQ.data ?? [];
    const resolved = await resolveAccessionFromSearch(specimens, trimmed);
    if (resolved) {
      setFilterQuery("");
      selectAccession(resolved);
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
      return;
    }

    if (/^[A-Za-z0-9._-]+$/.test(trimmed)) {
      setFilterQuery("");
      selectAccession(trimmed);
    }
  }, [filterQuery, specimensQ.data, selectAccession]);

  useScanInput((value) => {
    const v = value.trim();
    if (!v) return;
    setFilterQuery("");
    void (async () => {
      const acc = await resolveAccessionFromSearch(specimensQ.data ?? [], v);
      selectAccession(acc ?? v);
    })();
  });

  const searchForm = (
    <form
      className="flex shrink-0 gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void confirmFromInput();
      }}
    >
      <ClearableInput
        value={filterQuery}
        onChange={(e) => setFilterQuery(e.target.value)}
        onClear={clearFilter}
        placeholder="Patient, MRN, accession, or specimen ID…"
        wrapperClassName="flex-1"
        leftSlot={<ScanLine className="size-4 text-muted-foreground" />}
      />
      <Button
        type="submit"
        variant="secondary"
        size="lg"
        className="min-h-10 shrink-0 lg:h-9 lg:min-h-0 lg:px-3 lg:text-sm"
      >
        Look up
      </Button>
    </form>
  );

  const accessionList = (
    <ScrollContainer className="min-h-0 flex-1 rounded-md border border-border">
      <ul className="divide-y divide-border">
        {specimensQ.isLoading && (
          <li className="px-3 py-2 text-sm text-muted-foreground">Loading…</li>
        )}
        {!specimensQ.isLoading && suggestions.length === 0 && (
          <li className="px-3 py-3 text-sm text-muted-foreground">
            {debouncedFilter.trim()
              ? `No accessions match “${debouncedFilter.trim()}”.`
              : "No specimens yet."}
          </li>
        )}
        {suggestions.map((session) => {
          const s = session.primary;
          const accessionNumber =
            session.accessionNumbers[0] ?? s.accessionNumber;
          const isSelected =
            accessionNumber.toUpperCase() ===
            selectedAccession.trim().toUpperCase();
          const tubeHint =
            session.tubes.length > 1
              ? `${session.tubes.length} labels`
              : null;
          const patientName =
            s.patientDisplayName?.trim() ||
            patientDisplayNameFromJson(s.patientJson);
          return (
            <li key={session.key}>
              <button
                ref={isSelected ? selectedRowRef : undefined}
                type="button"
                aria-current={isSelected ? "true" : undefined}
                className={cn(
                  "flex w-full flex-col items-start gap-1 border-l-2 px-3 py-3 text-left text-sm transition-colors lg:py-2.5",
                  isSelected
                    ? "border-l-accent bg-accent/10"
                    : "border-l-transparent hover:bg-muted",
                )}
                onClick={() => selectAccession(accessionNumber)}
              >
                <span className="flex w-full items-start justify-between gap-2">
                  <span className="min-w-0 truncate font-medium">
                    {patientName}
                  </span>
                  <SpecimenAccessionStatusChip
                    status={s.status}
                    className="shrink-0 text-[10px]"
                  />
                </span>
                <span
                  className={cn(
                    "font-mono text-xs tracking-tight",
                    isSelected ? "text-accent" : "text-muted-foreground",
                  )}
                >
                  {accessionNumber}
                </span>
                {tubeHint ? (
                  <span className="text-xs text-muted-foreground">
                    {tubeHint}
                    {session.departmentLabels.length > 0
                      ? ` · ${session.departmentLabels.join(", ")}`
                      : ""}
                  </span>
                ) : null}
                {session.orderedTests.length > 0 ? (
                  <span className="line-clamp-2 text-xs text-muted-foreground">
                    {session.orderedTests
                      .slice(0, 6)
                      .map((t) => t.code)
                      .join(", ")}
                    {session.orderedTests.length > 6
                      ? ` +${session.orderedTests.length - 6}`
                      : ""}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </ScrollContainer>
  );

  const layout = (
    <div
      className={cn(
        "grid min-h-0 min-w-0 flex-1 gap-4",
        isWorkstation
          ? "overflow-hidden lg:grid-cols-2 lg:grid-rows-1 xl:gap-6"
          : "grid-cols-1 xl:grid-cols-2",
        showWorkstationChrome && isWorkstation && "h-full",
      )}
    >
      <div
        className={cn(
          "flex min-h-0 min-w-0 flex-col gap-3 overflow-hidden rounded-xl border border-border bg-card p-4 shadow-sm lg:order-1 xl:p-5",
          isWorkstation ? "order-2 h-full lg:order-1" : "order-2 min-h-[14rem] xl:min-h-0",
        )}
      >
        <div className="shrink-0 space-y-3">
          {searchForm}
          {catalogQ.usingOfflineFallback ? <CatalogOfflineBanner /> : null}
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {debouncedFilter.trim() ? "Matching accessions" : "Recent accessions"}
          </p>
        </div>
        {accessionList}
      </div>

      <div
        className={cn(
          "flex min-h-0 min-w-0 flex-col overflow-hidden",
          isWorkstation
            ? "order-1 h-full lg:order-2"
            : "order-1 min-h-[16rem] xl:order-2 xl:min-h-0",
        )}
      >
        <OrdersLookupDetail
          accessionNumber={selectedAccession}
          session={selectedSession}
          specimens={specimensQ.data ?? []}
          className="min-h-0 flex-1"
        />
      </div>
    </div>
  );

  if (!isWorkstation) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <AccessioningShell
          wide
          title="Test lookup"
          description="Read-only view of what was ordered for an accession. Bench operators can also use Bench → Awaiting run for incomplete work."
        >
          {layout}
        </AccessioningShell>
      </div>
    );
  }

  return (
    <AccessioningShell
      wide
      title="Test lookup"
      description="Read-only view of what was ordered for an accession. Bench operators can also use Bench → Awaiting run for incomplete work."
    >
      {layout}
    </AccessioningShell>
  );
}

function formatSpecimenType(type: string): string {
  if (!type) return "Specimen";
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function panelSelections(
  selections: OrderSelectionSnapshot[],
): OrderSelectionSnapshot[] {
  return selections.filter((s) => s.kind === "panel");
}

function OrdersLookupDetail({
  accessionNumber,
  session,
  specimens,
  className,
}: {
  accessionNumber: string;
  session?: AccessionSession;
  specimens: SpecimenRow[];
  className?: string;
}) {
  const trimmed = accessionNumber.trim();
  const isWideDetail = useIsWorkstation();

  const catalogQ = useCatalog();

  const cloudSpecimenQ = useQuery({
    queryKey: ["cloud-specimen", trimmed],
    queryFn: () => api.cloudSpecimenByAccession(trimmed),
    enabled: Boolean(trimmed),
    retry: false,
  });

  const cloudRequisitionQ = useQuery({
    queryKey: ["requisition", trimmed],
    queryFn: () => api.getRequisitionByAccession(trimmed),
    enabled: Boolean(trimmed),
    retry: false,
  });

  const edgeSpecimenQ = useQuery({
    queryKey: ["edge-specimen", trimmed],
    queryFn: () => api.specimenByAccession(trimmed),
    enabled: Boolean(trimmed),
    retry: false,
  });

  const tests: ParsedOrderedTest[] = useMemo(() => {
    const merged = mergeOrderedTestsLookup({
      cloudSpecimen: cloudSpecimenQ.data?.orderedTests,
      cloudRequisition: cloudRequisitionQ.data?.orderedTests?.map((t) => ({
        code: t.code,
        name: t.name,
      })),
      edgeSpecimen: parseOrderedTestsJson(
        edgeSpecimenQ.data?.orderedTestsJson,
      ),
    });
    if (merged.length > 0) return merged;
    return (
      session?.orderedTests.map((t) => ({
        code: t.code,
        name: t.name,
      })) ?? []
    );
  }, [
    cloudSpecimenQ.data,
    cloudRequisitionQ.data,
    edgeSpecimenQ.data,
    session?.orderedTests,
  ]);

  const isLoading =
    Boolean(trimmed) &&
    tests.length === 0 &&
    edgeSpecimenQ.isLoading &&
    !session;

  const row = session?.primary;
  const patient = parsePatientJson(row?.patientJson ?? null);
  const patientName =
    row?.patientDisplayName?.trim() ||
    patientDisplayNameFromJson(row?.patientJson ?? null);
  const registeredBy =
    row?.registeredByName?.trim() ||
    actorDisplayName(row?.registeredBySnapshot) ||
    null;
  const panels = panelSelections(session?.orderedSelections ?? []);
  const panelNameByCode = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of catalogQ.data?.panels ?? []) {
      map.set(p.code, p.name);
    }
    return map;
  }, [catalogQ.data]);

  const containerRows = useMemo(() => {
    if (session?.tubes.length) return session.tubes;
    if (!trimmed) return [];
    return findContainersByAccession(specimens, trimmed);
  }, [session?.tubes, trimmed, specimens]);

  const labelRouting = catalogQ.data?.labelRouting;
  const labelPrintGroups = useMemo(
    () => labelPrintGroupsFromSpecimenRows(containerRows, labelRouting),
    [containerRows, labelRouting],
  );

  const edgePreviewQueries = useQueries({
    queries: labelPrintGroups.map((group) => ({
      queryKey: [
        "orders-label-preview",
        group.primarySpecimenNumber,
        group.catalogCategory,
        group.orderedTestCodes.join(","),
      ],
      queryFn: async () => {
        const tube =
          containerRows.find((r) => r.id === group.specimenIds[0]) ??
          containerRows[0]!;
        const patient = parsePatientJson(tube.patientJson);
        const displayName = patientDisplayNameFromJson(tube.patientJson);
        try {
          const res = await api.printPreview(
            buildSpecimenLabelInput({
              accessionNumber: tube.accessionNumber,
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
            fields: buildLabelPreviewFromPrintGroup(group, tube, labelRouting),
            edgeFailed: true,
          };
        }
      },
      enabled: Boolean(containerRows.length),
      staleTime: 400,
    })),
  });

  const previewLabels = useMemo((): LabelPreviewItem[] => {
    return labelPrintGroups.map((group, i) => {
      const key =
        group.specimenIds[0] ?? group.primarySpecimenNumber ?? `label-${i}`;
      const tube =
        containerRows.find((r) => r.id === group.specimenIds[0]) ??
        containerRows[0]!;
      return {
        id: key,
        specimenType: group.collectionType,
        fields:
          edgePreviewQueries[i]?.data?.fields ??
          buildLabelPreviewFromPrintGroup(group, tube, labelRouting),
        accessionNumber: tube.accessionNumber,
        testCount: group.orderedTestCodes.length,
      };
    });
  }, [containerRows, labelPrintGroups, edgePreviewQueries, labelRouting]);

  const previewLoading =
    containerRows.length > 0 &&
    edgePreviewQueries.some((q) => q.isFetching && !q.data);

  const previewWarning =
    edgePreviewQueries.some((q) => q.data?.edgeFailed) &&
    previewLabels.length > 0
      ? "Showing a client preview — printer preview unavailable."
      : undefined;

  if (!trimmed) {
    return (
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 px-6 py-12 text-center",
          className,
        )}
      >
        <p className="text-sm font-medium text-foreground">
          Select an accession
        </p>
        <p className="mt-1 max-w-xs text-sm text-muted-foreground">
          Choose a row on the left or scan an accession to see ordered tests
          here.
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm",
        className,
      )}
    >
      <div className="shrink-0 border-b border-border px-4 py-3 xl:px-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate font-display text-lg font-semibold tracking-tight">
              {patientName}
            </h3>
            <p className="mt-0.5 font-mono text-xs text-muted-foreground">
              {trimmed}
              {patient?.mrn || row?.patientMrn
                ? ` · ${patient?.mrn ?? row?.patientMrn}`
                : ""}
            </p>
            {session ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {new Date(session.registeredAt).toLocaleString()}
                {registeredBy ? ` · Reg: ${registeredBy}` : ""}
              </p>
            ) : null}
          </div>
          {row ? (
            <SpecimenAccessionStatusChip
              status={row.status}
              className="shrink-0 text-[10px]"
            />
          ) : null}
        </div>
      </div>

      <ScrollContainer className="min-h-0 flex-1">
        <div className="space-y-5 p-4 xl:p-5">
          <section className="space-y-1 text-sm">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Patient
            </p>
            <p>
              {[patient?.dateOfBirth, patient?.sex].filter(Boolean).join(" · ") ||
                "No DOB/sex on file"}
            </p>
            {session ? (
              <p className="text-muted-foreground">
                Tubes:{" "}
                {session.specimenTypes.map(formatSpecimenType).join(", ")}
                {session.departmentLabels.length > 0
                  ? ` · ${session.departmentLabels.join(", ")}`
                  : ""}
              </p>
            ) : null}
          </section>

          <AccessionPeopleBlockForAccession
            accessionNumber={trimmed}
            specimens={containerRows}
            results={[]}
          />

          {row && accessionIntegrityNotes(row).length > 0 ? (
            <section className="space-y-1 text-sm">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Integrity
              </p>
              <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
                {accessionIntegrityNotes(row).map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {panels.length > 0 ? (
            <section>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Panels selected ({panels.length})
              </p>
              <ul className="divide-y divide-border rounded-lg border border-border">
                {panels.map((p) => (
                  <li key={`panel-${p.code}`} className="px-3 py-2 text-sm">
                    <Badge variant="ok" className="mr-2 text-[10px]">
                      Panel
                    </Badge>
                    <span className="font-medium">
                      {panelNameByCode.get(p.code) ??
                        p.code.replaceAll("_", " ")}
                    </span>
                    <span className="ml-2 font-mono text-xs text-muted-foreground">
                      {p.code}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {panels.length > 0
                ? `Tests on order (${tests.length})`
                : `Ordered tests (${tests.length})`}
            </p>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : tests.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No ordered tests found for this accession.
              </p>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {tests.map((t) => (
                  <li key={t.code} className="px-3 py-2 text-sm">
                    <span className="font-mono text-xs text-muted-foreground">
                      {t.code}
                    </span>{" "}
                    <span className="font-medium">{t.name ?? t.code}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Routing labels
              {containerRows.length > 0
                ? ` (${containerRows.length})`
                : ""}
            </p>
            <MultiLabelPreviewPanel
              phase={previewLabels.length > 0 ? "registered" : "idle"}
              labels={previewLabels}
              emptyContext="labels"
              loading={previewLoading}
              previewWarning={previewWarning}
              className={cn(
                isWideDetail && previewLabels.length === 1 && "min-h-[12rem]",
              )}
              actions={
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="w-full sm:w-auto"
                  asChild
                >
                  <Link to="/bench" search={{ q: trimmed }}>
                    Open results on Bench
                  </Link>
                </Button>
              }
            />
          </section>
        </div>
      </ScrollContainer>
    </div>
  );
}
