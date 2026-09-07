import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQueries, useQuery } from "@tanstack/react-query";
import { api, type SpecimenRow } from "../../lib/api";
import {
  findSessionByAccession,
  groupSpecimensIntoSessions,
  withSessionSelections,
  type AccessionSession,
  type OrderSelectionSnapshot,
} from "../../lib/accession-sessions";
import { fetchEdgeLabelPreviewForSpecimen } from "../../lib/label-preview-from-specimen";
import {
  actorDisplayName,
  parseOrderedTests,
  parsePatientJson,
  patientDisplayNameFromJson,
} from "../../lib/specimen-display";
import { useIsWide } from "../../lib/use-media-query";
import { cn } from "../../lib/utils";
import {
  MultiLabelPreviewPanel,
  type LabelPreviewItem,
} from "./multi-label-preview-panel";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { ClearableInput } from "../ui/clearable-input";
import { ScrollContainer } from "../ui/scroll-container";
import { Sheet, SheetContent } from "../ui/sheet";

function specimenPatientName(row: SpecimenRow): string {
  return (
    row.patientDisplayName?.trim() ||
    patientDisplayNameFromJson(row.patientJson)
  );
}

function specimenRegisteredBy(row: SpecimenRow): string | null {
  return (
    row.registeredByName?.trim() ||
    actorDisplayName(row.registeredBySnapshot) ||
    null
  );
}

function specimenCollectedBy(row: SpecimenRow): string | null {
  if (row.collectedByName?.trim()) return row.collectedByName.trim();
  if (!row.collectedBySnapshot) return null;
  try {
    const snap = JSON.parse(row.collectedBySnapshot) as {
      fullName?: string;
      staffId?: string;
    };
    return snap.fullName?.trim() || snap.staffId?.trim() || null;
  } catch {
    return null;
  }
}

function specimenTests(row: SpecimenRow) {
  return row.orderedTests?.length
    ? row.orderedTests
    : parseOrderedTests(row.orderedTestsJson);
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

function individualSelections(
  selections: OrderSelectionSnapshot[],
): OrderSelectionSnapshot[] {
  return selections.filter((s) => s.kind === "test");
}

export function AccessionHistoryPanel({
  initialAccession,
  className,
}: {
  initialAccession?: string;
  className?: string;
}) {
  const isWide = useIsWide();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [selectedKey, setSelectedKey] = useState("");

  const specimensQ = useQuery({
    queryKey: ["specimens", deferredQuery.trim()],
    queryFn: () => api.specimens(deferredQuery.trim() || undefined),
  });
  const catalogQ = useQuery({
    queryKey: ["catalog"],
    queryFn: () => api.getCatalog(),
    staleTime: 60_000,
  });

  const rows = specimensQ.data ?? [];
  const baseSessions = useMemo(() => groupSpecimensIntoSessions(rows), [rows]);

  const hydrationTargets = useMemo(() => {
    const seen = new Set<string>();
    const out: Array<{ key: string; requisitionId: string }> = [];
    for (const s of baseSessions) {
      if (s.orderedSelections.length > 0) continue;
      const reqId = s.primary.requisitionId?.trim();
      if (!reqId || seen.has(reqId)) continue;
      seen.add(reqId);
      out.push({ key: s.key, requisitionId: reqId });
    }
    return out.slice(0, 30);
  }, [baseSessions]);

  const hydrationQueries = useQueries({
    queries: hydrationTargets.map((t) => ({
      queryKey: ["requisition-for-history", t.requisitionId],
      queryFn: () => api.getRequisition(t.requisitionId),
      staleTime: 60_000,
      retry: false,
    })),
  });

  const selectionsByReqId = useMemo(() => {
    const map = new Map<string, OrderSelectionSnapshot[]>();
    hydrationTargets.forEach((t, i) => {
      const data = hydrationQueries[i]?.data;
      const sels = data?.orderedSelections?.map((s) => ({
        kind: s.kind,
        code: s.code,
      }));
      if (sels?.length) map.set(t.requisitionId, sels);
    });
    return map;
  }, [hydrationTargets, hydrationQueries]);

  const sessions = useMemo(
    () =>
      baseSessions.map((s) => {
        const reqId = s.primary.requisitionId?.trim();
        if (!reqId) return s;
        return withSessionSelections(s, selectionsByReqId.get(reqId));
      }),
    [baseSessions, selectionsByReqId],
  );

  useEffect(() => {
    const acc = initialAccession?.trim();
    if (!acc || sessions.length === 0) return;
    const match = findSessionByAccession(sessions, acc);
    if (match) setSelectedKey(match.key);
  }, [initialAccession, sessions]);

  const selected = useMemo(
    () => sessions.find((s) => s.key === selectedKey) ?? null,
    [sessions, selectedKey],
  );

  const panelNameByCode = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of catalogQ.data?.panels ?? []) {
      map.set(p.code, p.name);
    }
    return map;
  }, [catalogQ.data]);

  const list = (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <ClearableInput
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search accession, patient, or MRN…"
        className="h-10"
      />
      {specimensQ.isError ? (
        <p className="text-sm text-lab-danger">
          Could not load accession history.
        </p>
      ) : null}
      <ScrollContainer className="min-h-0 flex-1 rounded-xl border border-border bg-card">
        <ul className="divide-y divide-border">
          {specimensQ.isLoading && (
            <li className="px-3 py-8 text-center text-sm text-muted-foreground">
              Loading…
            </li>
          )}
          {!specimensQ.isLoading && sessions.length === 0 && (
            <li className="px-3 py-8 text-center text-sm text-muted-foreground">
              No accessions match
              {deferredQuery.trim() ? ` “${deferredQuery.trim()}”` : " yet"}.
            </li>
          )}
          {sessions.map((session) => {
            const active = session.key === selectedKey;
            const by = specimenRegisteredBy(session.primary);
            const collector = specimenCollectedBy(session.primary);
            const panels = panelSelections(session.orderedSelections);
            const tubeLabel =
              session.tubes.length === 1
                ? formatSpecimenType(session.specimenTypes[0] ?? "blood")
                : `${session.tubes.length} tubes · ${session.specimenTypes
                    .map(formatSpecimenType)
                    .join(", ")}`;
            return (
              <li key={session.key}>
                <button
                  type="button"
                  className={cn(
                    "flex w-full flex-col gap-1 px-3 py-3 text-left transition-colors",
                    active ? "bg-accent/10" : "hover:bg-muted/40",
                  )}
                  onClick={() => setSelectedKey(session.key)}
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="min-w-0 truncate font-medium">
                      {specimenPatientName(session.primary)}
                    </span>
                    <Badge variant="muted" className="shrink-0">
                      {session.primary.status}
                    </Badge>
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {session.accessionNumbers.join(" · ")}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {tubeLabel}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(session.registeredAt).toLocaleString()}
                    {by ? ` · Reg: ${by}` : ""}
                    {collector ? ` · Collector: ${collector}` : ""}
                  </span>
                  {panels.length > 0 ? (
                    <span className="line-clamp-2 text-xs font-medium text-foreground/80">
                      Panels:{" "}
                      {panels
                        .map(
                          (p) =>
                            panelNameByCode.get(p.code) ??
                            p.code.replaceAll("_", " "),
                        )
                        .join(", ")}
                    </span>
                  ) : session.orderedTests.length > 0 ? (
                    <span className="line-clamp-2 text-xs text-muted-foreground">
                      {session.orderedTests
                        .slice(0, 8)
                        .map((t) => t.code)
                        .join(", ")}
                      {session.orderedTests.length > 8
                        ? ` +${session.orderedTests.length - 8}`
                        : ""}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </ScrollContainer>
    </div>
  );

  const detail = selected ? (
    <AccessionHistoryDetail
      session={selected}
      panelNameByCode={panelNameByCode}
      onClose={() => setSelectedKey("")}
    />
  ) : (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center">
      <p className="text-sm font-medium">Select an accession session</p>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        Each session is one Accession submit — panels may create blood, serum,
        and urine tubes together. Open a session to see the panels ordered, the
        full test list, and each tube label.
      </p>
    </div>
  );

  if (isWide) {
    return (
      <div
        className={cn(
          "grid min-h-0 flex-1 grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)] gap-4",
          className,
        )}
      >
        {list}
        <div className="flex min-h-0 min-w-0 flex-col">{detail}</div>
      </div>
    );
  }

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      {list}
      <Sheet
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelectedKey("");
        }}
      >
        <SheetContent side="bottom" label="Accession details" className="p-0">
          {selected ? (
            <AccessionHistoryDetail
              session={selected}
              panelNameByCode={panelNameByCode}
              embedded
              onClose={() => setSelectedKey("")}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function AccessionHistoryDetail({
  session,
  panelNameByCode,
  onClose,
  embedded = false,
}: {
  session: AccessionSession;
  panelNameByCode: Map<string, string>;
  onClose: () => void;
  embedded?: boolean;
}) {
  const row = session.primary;
  const patient = parsePatientJson(row.patientJson);
  const by = specimenRegisteredBy(row);
  const collector = specimenCollectedBy(row);
  const panels = panelSelections(session.orderedSelections);
  const individuals = individualSelections(session.orderedSelections);
  const [activeTubeId, setActiveTubeId] = useState(session.tubes[0]?.id ?? "");

  useEffect(() => {
    setActiveTubeId(session.tubes[0]?.id ?? "");
  }, [session.key, session.tubes]);

  const activeTube =
    session.tubes.find((t) => t.id === activeTubeId) ?? session.tubes[0]!;

  const previewQ = useQuery({
    queryKey: [
      "accession-history-preview",
      activeTube.id,
      activeTube.registeredAt,
    ],
    queryFn: () => fetchEdgeLabelPreviewForSpecimen(activeTube),
  });

  const reprintM = useMutation({
    mutationFn: () =>
      api.reprintLabel({
        accessionNumber: activeTube.accessionNumber,
        copies: 1,
      }),
  });

  const tubeTests = specimenTests(activeTube);
  const previewItems: LabelPreviewItem[] = previewQ.data
    ? [
        {
          id: activeTube.id,
          specimenType: activeTube.specimenType ?? "blood",
          fields: previewQ.data.fields,
          accessionNumber: activeTube.accessionNumber,
          printStatus: reprintM.data
            ? { ok: reprintM.data.ok, error: reprintM.data.error }
            : null,
          testCount: tubeTests.length,
        },
      ]
    : [];

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col overflow-hidden bg-card",
        embedded
          ? "h-full"
          : "h-full rounded-xl border border-border shadow-sm",
      )}
    >
      <div className="flex shrink-0 items-start justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0">
          {embedded ? (
            <div
              className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted-foreground/35"
              aria-hidden
            />
          ) : null}
          <h3 className="font-display text-lg font-semibold tracking-tight">
            {specimenPatientName(row)}
          </h3>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {session.accessionNumbers.join(" · ")}
            {patient?.mrn || row.patientMrn
              ? ` · ${patient?.mrn ?? row.patientMrn}`
              : ""}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {new Date(session.registeredAt).toLocaleString()}
            {by ? ` · Registered by ${by}` : ""}
          </p>
          {collector ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Collector: {collector}
            </p>
          ) : null}
        </div>
        {!embedded ? (
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        ) : null}
      </div>

      <ScrollContainer className="min-h-0 flex-1">
        <div className="space-y-5 p-4">
          <section className="space-y-1 text-sm">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Patient
            </p>
            <p>
              {[patient?.dateOfBirth, patient?.sex].filter(Boolean).join(" · ") ||
                "No DOB/sex on file"}
            </p>
            <p className="text-muted-foreground">
              Tubes:{" "}
              {session.specimenTypes.map(formatSpecimenType).join(", ")} ·
              Status: {row.status}
            </p>
          </section>

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
              {individuals.length > 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Plus {individuals.length} individual test
                  {individuals.length === 1 ? "" : "s"} selected with the
                  panels.
                </p>
              ) : null}
            </section>
          ) : null}

          <section>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {panels.length > 0
                ? `Tests on order (${session.orderedTests.length})`
                : `Ordered tests (${session.orderedTests.length})`}
            </p>
            {session.orderedTests.length === 0 ? (
              <p className="text-sm text-muted-foreground">No tests recorded.</p>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {session.orderedTests.map((t) => (
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

          {session.tubes.length > 1 ? (
            <section>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Tubes ({session.tubes.length})
              </p>
              <div className="flex flex-wrap gap-2">
                {session.tubes.map((tube) => {
                  const active = tube.id === activeTube.id;
                  return (
                    <button
                      key={tube.id}
                      type="button"
                      onClick={() => setActiveTubeId(tube.id)}
                      className={cn(
                        "rounded-lg border px-3 py-2 text-left text-xs transition-colors",
                        active
                          ? "border-accent bg-accent/10"
                          : "border-border hover:bg-muted/40",
                      )}
                    >
                      <span className="block font-medium capitalize">
                        {formatSpecimenType(tube.specimenType ?? "blood")}
                      </span>
                      <span className="font-mono text-muted-foreground">
                        {tube.accessionNumber}
                      </span>
                      <span className="mt-0.5 block text-muted-foreground">
                        {specimenTests(tube)
                          .map((t) => t.code)
                          .join(", ")}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}

          <section>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Label · {formatSpecimenType(activeTube.specimenType ?? "blood")} ·{" "}
              {activeTube.accessionNumber}
            </p>
            <MultiLabelPreviewPanel
              phase="registered"
              labels={previewItems}
              emptyContext="register"
              loading={previewQ.isLoading}
              previewWarning={
                previewQ.data?.edgeFailed
                  ? "Showing a client preview — printer preview unavailable."
                  : undefined
              }
              actions={
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <Button
                    type="button"
                    size="sm"
                    disabled={reprintM.isPending}
                    onClick={() => reprintM.mutate()}
                  >
                    {reprintM.isPending ? "Printing…" : "Reprint"}
                  </Button>
                  <Button type="button" size="sm" variant="outline" asChild>
                    <Link
                      to="/labels"
                      search={{ accession: activeTube.accessionNumber }}
                    >
                      Open in Labels
                    </Link>
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    asChild
                    title="Bench shows results. If none yet, you’ll see a waiting state for this accession."
                  >
                    <Link
                      to="/bench"
                      search={{ q: activeTube.accessionNumber }}
                    >
                      Open in Bench
                    </Link>
                  </Button>
                </div>
              }
            />
          </section>
        </div>
      </ScrollContainer>
    </div>
  );
}
