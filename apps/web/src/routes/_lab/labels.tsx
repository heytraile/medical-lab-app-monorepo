import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { ScanLine } from "lucide-react";
import { accessionInputField } from "@drax-lis/contracts";
import { ApiError, api, type LabelPreviewFields } from "../../lib/api";
import {
  buildLabelPreviewFromSpecimen,
  fetchEdgeLabelPreviewForSpecimen,
  findSpecimenByAccession,
  PRINT_API_UNAVAILABLE_MSG,
  TEST_LABEL_PREVIEW,
} from "../../lib/label-preview-from-specimen";
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
import { Badge } from "../../components/ui/badge";
import { cn } from "../../lib/utils";
import {
  actorDisplayName,
  patientDisplayNameFromJson,
} from "../../lib/specimen-display";
import { groupSpecimensIntoSessions } from "../../lib/accession-sessions";

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
  const { accession: accessionFromUrl } = Route.useSearch();
  const navigate = useNavigate();
  const [accessionInput, setAccessionInput] = useState(accessionFromUrl ?? "");
  const [accessionInputError, setAccessionInputError] = useState<string | null>(
    null,
  );
  const [activeAccession, setActiveAccession] = useState(
    accessionFromUrl?.trim() ?? "",
  );
  const [printStatus, setPrintStatus] = useState<{
    ok: boolean;
    error?: string;
  } | null>(null);
  const [copies, setCopies] = useState(1);
  const [testPreview, setTestPreview] = useState<LabelPreviewFields | null>(
    null,
  );
  const selectedRowRef = useRef<HTMLButtonElement | null>(null);

  const specimensQ = useQuery({
    queryKey: ["specimens"],
    queryFn: () => api.specimens(),
  });

  useEffect(() => {
    if (accessionFromUrl) {
      setAccessionInput(accessionFromUrl);
      setActiveAccession(accessionFromUrl.trim());
      setTestPreview(null);
    }
  }, [accessionFromUrl]);

  // The list is scrollable, so a scanned barcode or /labels?accession=… deep
  // link can select a row that is out of view. "nearest" keeps the page still.
  useEffect(() => {
    selectedRowRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeAccession, specimensQ.dataUpdatedAt]);

  const specimenRow = useMemo(() => {
    if (!activeAccession.trim() || !specimensQ.data) return undefined;
    return findSpecimenByAccession(specimensQ.data, activeAccession);
  }, [activeAccession, specimensQ.data]);

  const clientPreview = useMemo(
    () => (specimenRow ? buildLabelPreviewFromSpecimen(specimenRow) : null),
    [specimenRow],
  );

  const edgePreviewQ = useQuery({
    queryKey: [
      "print-preview",
      "specimen",
      activeAccession,
      specimenRow?.id,
      specimenRow?.orderedTestsJson,
      specimensQ.dataUpdatedAt,
    ],
    queryFn: async () => {
      if (!specimenRow) return null;
      return fetchEdgeLabelPreviewForSpecimen(specimenRow);
    },
    enabled: Boolean(specimenRow),
    staleTime: 400,
  });

  const lookupError = useMemo(() => {
    if (!activeAccession.trim()) return null;
    if (specimensQ.isLoading) return null;
    if (specimensQ.isError) {
      return "Could not load specimens. Please try again.";
    }
    if (specimensQ.isSuccess && !specimenRow) {
      return "Accession not found";
    }
    return null;
  }, [
    activeAccession,
    specimensQ.isLoading,
    specimensQ.isError,
    specimensQ.isSuccess,
    specimenRow,
  ]);

  const preview =
    testPreview ??
    edgePreviewQ.data?.fields ??
    clientPreview ??
    null;

  const previewLabels = useMemo((): LabelPreviewItem[] => {
    if (!preview) return [];
    return [
      {
        id: preview.accessionNumber,
        specimenType: preview.specimenType,
        fields: preview,
        accessionNumber: preview.accessionNumber,
        printStatus,
      },
    ];
  }, [preview, printStatus]);

  const previewPhase = preview ? "registered" : "idle";

  const previewWarning =
    edgePreviewQ.data?.edgeFailed && preview
      ? "Could not load the label preview — showing the last saved preview."
      : undefined;

  function selectAccession(acc: string) {
    const trimmed = acc.trim();
    if (!trimmed) {
      setAccessionInput("");
      setActiveAccession("");
      setAccessionInputError(null);
      setTestPreview(null);
      setPrintStatus(null);
      void navigate({ to: "/labels", search: {} });
      return;
    }

    const parsed = accessionInputField.safeParse(trimmed);
    if (!parsed.success) {
      setAccessionInput(trimmed);
      setAccessionInputError(
        parsed.error.issues[0]?.message ?? "Invalid accession",
      );
      return;
    }

    setAccessionInput(parsed.data);
    setActiveAccession(parsed.data);
    setAccessionInputError(null);
    setTestPreview(null);
    setPrintStatus(null);
    void navigate({ to: "/labels", search: { accession: parsed.data } });
  }

  const reprintMutation = useMutation({
    mutationFn: (acc: string) =>
      api.reprintLabel({ accessionNumber: acc, copies }),
    onSuccess: (data) => {
      setTestPreview(data.fields);
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
      setAccessionInput("");
      setTestPreview(data.fields);
      setPrintStatus({ ok: data.ok, error: data.error });
      void navigate({ to: "/labels", search: {} });
    },
    onError: (err) => {
      if (isPrintApiMissing(err)) {
        setActiveAccession("");
        setAccessionInput("");
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
    selectAccession(value);
  });

  const recentSessions = useMemo(
    () => groupSpecimensIntoSessions(specimensQ.data ?? []).slice(0, 20),
    [specimensQ.data],
  );

  return (
    <AccessioningShell
      title="Labels"
      description="Reprint tube labels, verify accessions, and check printer alignment."
    >
      <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
        <div className="order-2 space-y-4 rounded-xl border border-border bg-card p-4 shadow-sm lg:order-1 lg:p-5">
          <label className="block space-y-1.5">
            <span className="flex items-center gap-2 text-sm font-medium">
              <ScanLine className="size-4" />
              Scan or enter accession
            </span>
            <ClearableInput
              value={accessionInput}
              onChange={(e) => {
                setAccessionInputError(null);
                setAccessionInput(e.target.value);
              }}
              placeholder="Scan barcode or type accession…"
              autoComplete="off"
              autoFocus
              maxLength={64}
              aria-invalid={Boolean(accessionInputError)}
              leftSlot={<ScanLine className="size-4 text-muted-foreground" />}
              {...scanHandlers}
              onKeyDown={(e) => {
                scanHandlers.onKeyDown(e);
                if (e.key === "Enter" && !e.defaultPrevented) {
                  selectAccession(e.currentTarget.value);
                }
              }}
            />
            {accessionInputError ? (
              <p className="text-xs text-lab-danger" role="alert">
                {accessionInputError}
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
              {reprintMutation.isPending ? "Printing…" : "Reprint label"}
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

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Recent registrations
            </p>
            <ScrollContainer className="max-h-64 rounded-md border border-border">
            <ul className="divide-y divide-border">
              {specimensQ.isLoading && (
                <li className="px-3 py-2 text-sm text-muted-foreground">
                  Loading…
                </li>
              )}
              {!specimensQ.isLoading && recentSessions.length === 0 && (
                <li className="px-3 py-3 text-sm text-muted-foreground">
                  No specimens yet.{" "}
                  <Link
                    to="/accession"
                    className="font-medium text-foreground underline-offset-4 hover:underline"
                  >
                    Register a new specimen →
                  </Link>
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
                  session.tubes.length === 1
                    ? session.specimenTypes[0] ?? "blood"
                    : `${session.tubes.length} tubes · ${session.specimenTypes.join(", ")}`;
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
                        <Badge variant="muted" className="shrink-0">
                          {s.status}
                        </Badge>
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
            </ScrollContainer>
          </div>
        </div>

        <div className="order-1 lg:order-2">
          <MultiLabelPreviewPanel
            phase={previewPhase}
            labels={previewLabels}
            emptyContext="labels"
            loading={
              Boolean(specimenRow) &&
              edgePreviewQ.isFetching &&
              !edgePreviewQ.data &&
              !testPreview
            }
            previewWarning={previewWarning}
            actions={
              preview && !lookupError ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  title="Bench shows results. If none yet, you’ll see a waiting state for this accession."
                  onClick={() =>
                    void navigate({
                      to: "/bench",
                      search: { q: preview.accessionNumber },
                    })
                  }
                >
                  Open in Bench
                </Button>
              ) : lookupError ? (
                <p className="text-xs text-lab-danger">{lookupError}</p>
              ) : undefined
            }
          />
        </div>
      </div>
    </AccessioningShell>
  );
}
