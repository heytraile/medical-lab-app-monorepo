import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import type { OrderSelection } from "@drax-lis/catalog";
import {
  buildPanelsWithMembers,
  selectionsNeedFasting,
} from "@drax-lis/catalog";
import {
  ApiError,
  api,
  isIdentityConfirmationRequired,
  type IdentityConfirmation,
  type IdentityConfirmationRequired,
  type LabelPreviewFields,
  type PatientListItem,
} from "../../lib/api";
import { buildDraftLabelPreview } from "../../lib/label-preview-draft";
import { AccessioningShell } from "../../components/accessioning/accessioning-shell";
import { LabelPreviewPanel } from "../../components/accessioning/label-preview-panel";
import { PatientPicker } from "../../components/accessioning/patient-picker";
import { PatientRequiredHint } from "../../components/accessioning/patient-required-hint";
import { PanelOrderSection } from "../../components/requisition/panel-order-section";
import { IndividualTestsSection } from "../../components/requisition/individual-tests-section";
import { SelectedTestsSummary } from "../../components/requisition/selected-tests-summary";
import { FastingCallout } from "../../components/requisition/fasting-callout";
import {
  EMPTY_SPECIMEN_INFO,
  primarySpecimenType,
  SpecimenInformationSection,
} from "../../components/requisition/specimen-information-section";
import { selectionsToOrderedTests } from "../../components/requisition/test-order-form";
import { useCatalog } from "../../lib/use-catalog";
import { useAuth } from "../../lib/auth";
import { Button } from "../../components/ui/button";
import { ScrollContainer } from "../../components/ui/scroll-container";
import { Select } from "../../components/ui/select";
import { cn } from "../../lib/utils";
import type { SpecimenInfo } from "@drax-lis/contracts";

export const Route = createFileRoute("/_lab/accession")({
  component: AccessionPage,
});

const DEFAULT_SELECTIONS: OrderSelection[] = [
  { kind: "test", code: "CBC" },
];

function AccessionPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const auth = useAuth();
  const catalogQ = useCatalog();
  const [selected, setSelected] = useState<PatientListItem | null>(null);
  const [selections, setSelections] =
    useState<OrderSelection[]>(DEFAULT_SELECTIONS);
  const deferredSelections = useDeferredValue(selections);
  const [printLabel, setPrintLabel] = useState(true);
  const [copies, setCopies] = useState(1);
  const [registeredPreview, setRegisteredPreview] =
    useState<LabelPreviewFields | null>(null);
  const [registeredAccession, setRegisteredAccession] = useState<string | null>(
    null,
  );
  const [registeredPrintStatus, setRegisteredPrintStatus] = useState<{
    ok: boolean;
    error?: string;
  } | null>(null);
  const [confirmPayload, setConfirmPayload] =
    useState<IdentityConfirmationRequired | null>(null);
  const [pendingConfirmation, setPendingConfirmation] =
    useState<IdentityConfirmation | null>(null);
  const [copied, setCopied] = useState<"barcode" | "cmd" | null>(null);
  const [specimenInfo, setSpecimenInfo] =
    useState<SpecimenInfo>(EMPTY_SPECIMEN_INFO);

  const panels = useMemo(() => {
    if (!catalogQ.data) return [];
    return buildPanelsWithMembers(
      catalogQ.data.panels.map((p) => ({
        code: p.code,
        name: p.name,
        description: p.description ?? undefined,
        memberCodes: p.memberCodes,
      })),
      catalogQ.data.items.map((i) => ({
        code: i.code,
        name: i.name,
        category: i.category,
        specimenHint:
          (i.specimenHint as "serum" | "urine" | "blood") ?? undefined,
        fastingRequired: i.fastingRequired,
      })),
    );
  }, [catalogQ.data]);

  const expandedTests = useMemo(() => {
    if (!catalogQ.data) return [];
    return selectionsToOrderedTests(catalogQ.data, deferredSelections);
  }, [catalogQ.data, deferredSelections]);

  const fasting = useMemo(
    () =>
      selectionsNeedFasting(expandedTests, panels, deferredSelections),
    [expandedTests, panels, deferredSelections],
  );

  const panelCount = selections.filter((s) => s.kind === "panel").length;
  const individualCount = selections.filter((s) => s.kind === "test").length;

  const testCodes = useMemo(
    () => expandedTests.map((t) => t.code),
    [expandedTests],
  );

  const orderedTestsPayload = useMemo(
    () => expandedTests.map((t) => ({ code: t.code, name: t.name })),
    [expandedTests],
  );

  const draftPreview = useMemo(
    () => (selected ? buildDraftLabelPreview(selected, testCodes) : null),
    [selected, testCodes],
  );

  const previewQ = useQuery({
    queryKey: ["print-preview", selected?.id, testCodes.join(","), selected?.mrn],
    queryFn: () =>
      api.printPreview({
        accessionNumber: "Assigns on accession",
        patientName: selected!.displayName,
        barcode: selected!.mrn,
        dateOfBirth: selected!.dateOfBirth,
        orderedTests: testCodes,
        mrn: selected!.mrn,
      }),
    enabled: Boolean(selected) && !registeredAccession,
    staleTime: 400,
  });

  const reprintMutation = useMutation({
    mutationFn: (accession: string) =>
      api.reprintLabel({ accessionNumber: accession, copies }),
    onSuccess: (data) => {
      setRegisteredPreview(data.fields);
      setRegisteredPrintStatus({ ok: data.ok, error: data.error });
    },
  });

  const mutation = useMutation({
    mutationFn: async (identityConfirmation?: IdentityConfirmation) => {
      if (!selected) throw new Error("Select a patient");
      if (!catalogQ.data) throw new Error("Catalog not loaded");
      if (expandedTests.length === 0) {
        throw new Error("Select at least one panel or test");
      }

      let requisitionId: string | undefined;
      if (auth.accessToken) {
        const req = await api.createRequisition({
          patientId: selected.id,
          patientSnapshot: {
            displayName: selected.displayName,
            mrn: selected.mrn,
            dateOfBirth: selected.dateOfBirth,
          },
          selections: deferredSelections,
          specimenInfo,
        });
        requisitionId = req.id;
      }

      const data = await api.registerSpecimen({
        patientId: selected.id,
        identityConfirmation:
          identityConfirmation ?? pendingConfirmation ?? undefined,
        orderedTests: orderedTestsPayload,
        requisitionId,
        printLabel,
        copies,
        specimenType: primarySpecimenType(specimenInfo.specimenTypes),
        collectedAt: specimenInfo.collectedAt,
      });

      if (requisitionId) {
        await api.linkRequisition(requisitionId, {
          accessionNumber: data.specimen.accessionNumber,
          edgeSpecimenId: data.specimen.id,
        });
      }

      return data;
    },
    onSuccess: (data) => {
      const acc = data.specimen.accessionNumber;
      setRegisteredAccession(acc);
      setRegisteredPreview(
        data.labelPreview ??
          data.printResult?.fields ??
          previewQ.data?.fields ??
          (selected
            ? {
                ...buildDraftLabelPreview(selected, testCodes),
                accessionNumber: acc,
                barcode: acc,
              }
            : null),
      );
      setRegisteredPrintStatus(
        data.printResult
          ? { ok: data.printResult.ok, error: data.printResult.error }
          : printLabel
            ? { ok: false, error: "No print result" }
            : null,
      );
      setSelected(null);
      setConfirmPayload(null);
      setPendingConfirmation(null);
      void qc.invalidateQueries({ queryKey: ["specimens"] });
      void qc.invalidateQueries({ queryKey: ["syncStatus"] });
    },
    onError: (err) => {
      if (isIdentityConfirmationRequired(err)) {
        setConfirmPayload(err.body);
        return;
      }
      setConfirmPayload(null);
    },
  });

  useEffect(() => {
    setPendingConfirmation(null);
    setConfirmPayload(null);
  }, [selected?.id]);

  function confirmIdentity(decision: IdentityConfirmation["decision"]) {
    if (!confirmPayload?.patient.suspectGroupId) return;
    const conf: IdentityConfirmation = {
      decision,
      suspectGroupId: confirmPayload.patient.suspectGroupId,
      confirmedAt: new Date().toISOString(),
      confirmedBy: "edge-tech",
    };
    setPendingConfirmation(conf);
    setConfirmPayload(null);
    mutation.mutate(conf);
  }

  function startNewAccession() {
    setRegisteredAccession(null);
    setRegisteredPreview(null);
    setRegisteredPrintStatus(null);
    setSelected(null);
    setSelections(DEFAULT_SELECTIONS);
    setSpecimenInfo(EMPTY_SPECIMEN_INFO);
  }

  const previewFields =
    registeredPreview ?? previewQ.data?.fields ?? draftPreview;
  const previewPhase = registeredAccession
    ? "registered"
    : selected
      ? "draft"
      : "idle";

  const showPatientReminder =
    !selected && !registeredAccession && expandedTests.length > 0;

  return (
    <AccessioningShell
      wide
      title="Accession"
      description="Select an existing patient, build the test order, preview the tube label, then accession and print."
    >
      <form
        className="grid min-w-0 grid-cols-1 gap-5 overflow-x-hidden lg:grid-cols-2 lg:grid-rows-[minmax(0,1fr)_auto] lg:min-h-0 lg:flex-1 lg:overflow-hidden xl:grid-cols-[minmax(15rem,18rem)_minmax(0,1fr)_minmax(0,1fr)_minmax(17rem,22rem)] xl:grid-rows-1"
        onSubmit={(e) => {
          e.preventDefault();
          if (!selected || registeredAccession) return;
          mutation.mutate(pendingConfirmation ?? undefined);
        }}
      >
        {/* Col 1 — Patient (primary step) */}
        <div
          className={cn(
            "flex h-full min-h-0 min-w-0 flex-col gap-3 overflow-hidden rounded-xl border-2 p-4 shadow-md lg:min-h-0",
            "border-accent/40 bg-gradient-to-b from-accent/[0.14] via-accent/[0.06] to-card",
            "dark:border-accent/35 dark:from-accent/[0.2] dark:via-accent/[0.08] dark:to-card",
            !selected &&
              "ring-2 ring-accent/25 ring-offset-2 ring-offset-background",
          )}
        >
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <span className="rounded-full bg-accent px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white dark:text-accent-foreground">
              Step 1
            </span>
            <span className="text-xs font-medium text-muted-foreground">
              {selected ? "Patient selected" : "Select patient first"}
            </span>
          </div>

          {!auth.accessToken && !registeredAccession && (
            <div className="shrink-0 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-xs">
              <p>
                Sign in to save a cloud requisition linked to this accession.
              </p>
              <Link
                to="/login"
                className="mt-1 inline-flex font-medium text-primary hover:underline"
              >
                Sign in
              </Link>
            </div>
          )}

          <PatientPicker
            selected={selected}
            onSelect={setSelected}
            onAccessionScan={(accession) => {
              void navigate({ to: "/labels", search: { accession } });
            }}
            scanEnabled={!registeredAccession}
            fillHeight
            className="min-h-0"
          />
        </div>

        {/* Col 2 & 3 — Panels + individual tests (side by side from lg up) */}
        {!registeredAccession && catalogQ.data && (
          <div className="grid min-h-0 grid-cols-1 gap-3 lg:col-span-1 lg:h-full lg:min-h-0 xl:col-span-2 xl:col-start-2 xl:flex xl:flex-col">
            {showPatientReminder && <PatientRequiredHint className="shrink-0" />}
            <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 lg:grid-cols-2 lg:gap-4">
              <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card p-4 shadow-sm max-lg:min-h-[min(40vh,20rem)]">
                <PanelOrderSection
                  catalog={catalogQ.data}
                  selections={selections}
                  onChange={setSelections}
                  className="h-full"
                />
              </div>
              <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card p-4 shadow-sm max-lg:min-h-[min(40vh,20rem)]">
                <IndividualTestsSection
                  catalog={catalogQ.data}
                  selections={selections}
                  onChange={setSelections}
                  className="h-full"
                />
              </div>
            </div>
          </div>
        )}

        {/* Col 4 — Session */}
        <ScrollContainer className="flex h-full min-h-0 min-w-0 flex-col gap-3 lg:col-span-2 xl:col-span-1">
          {!registeredAccession && catalogQ.data && (
            <>
              <div className="min-w-0 shrink-0 rounded-xl border border-border bg-card p-4 shadow-sm">
                <SelectedTestsSummary
                  expanded={expandedTests}
                  panelCount={panelCount}
                  individualCount={individualCount}
                />
                <div className="mt-3">
                  <FastingCallout show={fasting} />
                </div>
              </div>

              <SpecimenInformationSection
                value={specimenInfo}
                onChange={setSpecimenInfo}
                currentUserId={auth.session?.user?.id ?? auth.profile?.id}
                className="shrink-0"
              />

              <div className="min-w-0 shrink-0 overflow-hidden rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
                <div className="flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={printLabel}
                      onChange={(e) => setPrintLabel(e.target.checked)}
                      className="size-4 rounded border-border"
                    />
                    Print label
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    Copies
                    <Select
                      className="h-9 w-[4.5rem]"
                      value={String(copies)}
                      onValueChange={(v) => setCopies(Number(v))}
                      disabled={!printLabel}
                      aria-label="Label copies"
                      options={[1, 2, 3, 4, 5].map((n) => ({
                        value: String(n),
                        label: String(n),
                      }))}
                    />
                  </label>
                </div>
              </div>

              <Button
                type="submit"
                className="h-11 w-full shrink-0"
                disabled={
                  mutation.isPending ||
                  !selected ||
                  expandedTests.length === 0
                }
              >
                {mutation.isPending
                  ? "Accessioning…"
                  : printLabel
                    ? "Accession & Print Label"
                    : "Accession specimen"}
              </Button>
            </>
          )}

          <LabelPreviewPanel
            className="shrink-0"
            phase={previewPhase}
            fields={previewFields}
            emptyContext="register"
            loading={Boolean(
              selected && previewQ.isFetching && !registeredAccession,
            )}
            previewWarning={
              previewQ.isError && selected && !registeredAccession
                ? "Could not reach edge for ZPL preview — showing draft."
                : undefined
            }
            printStatus={registeredPrintStatus}
            accessionNumber={registeredAccession}
            actions={
              registeredAccession ? (
                <div className="grid grid-cols-2 gap-2 [&>*]:h-11 [&>*]:w-full [&>*]:justify-center sm:flex sm:flex-wrap sm:[&>*]:h-8 sm:[&>*]:w-auto">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      void navigator.clipboard.writeText(registeredAccession);
                      setCopied("barcode");
                      setTimeout(() => setCopied(null), 1500);
                    }}
                  >
                    {copied === "barcode" ? "Copied" : "Copy barcode"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={reprintMutation.isPending}
                    onClick={() => reprintMutation.mutate(registeredAccession)}
                  >
                    {reprintMutation.isPending ? "Printing…" : "Reprint"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      const cmd = `pnpm --filter @drax-lis/simulators send:sysmex -- --barcode ${registeredAccession}`;
                      void navigator.clipboard.writeText(cmd);
                      setCopied("cmd");
                      setTimeout(() => setCopied(null), 1500);
                    }}
                  >
                    {copied === "cmd" ? "Copied" : "Copy sim command"}
                  </Button>
                  <Link
                    to="/labels"
                    search={{ accession: registeredAccession }}
                    className="inline-flex h-8 items-center rounded-md bg-secondary px-3 text-xs font-medium text-secondary-foreground hover:bg-secondary/80"
                  >
                    Open in Labels
                  </Link>
                  <Link
                    to="/bench"
                    search={{ q: registeredAccession }}
                    className="inline-flex h-8 items-center rounded-md bg-secondary px-3 text-xs font-medium text-secondary-foreground hover:bg-secondary/80"
                  >
                    Open in Bench
                  </Link>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={startNewAccession}
                  >
                    Accession another
                  </Button>
                </div>
              ) : undefined
            }
          />
        </ScrollContainer>
      </form>

      {mutation.isError && !confirmPayload && (
        <p className="text-sm text-lab-danger">
          {mutation.error instanceof ApiError
            ? mutation.error.message
            : "Accession failed — is edge-engine running?"}
        </p>
      )}

      {confirmPayload && (
        <IdentityConfirmDialog
          payload={confirmPayload}
          busy={mutation.isPending}
          onCancel={() => {
            setConfirmPayload(null);
            mutation.reset();
          }}
          onConfirm={confirmIdentity}
        />
      )}
    </AccessioningShell>
  );
}

function IdentityConfirmDialog({
  payload,
  busy,
  onCancel,
  onConfirm,
}: {
  payload: IdentityConfirmationRequired;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (decision: IdentityConfirmation["decision"]) => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="identity-confirm-title"
    >
      <div className="max-h-[calc(100svh-2rem)] w-full max-w-md overflow-y-auto rounded-xl border border-border bg-card p-4 shadow-lg sm:p-5">
        <h3
          id="identity-confirm-title"
          className="font-display text-xl font-semibold tracking-tight"
        >
          Confirm patient identity
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">
          {payload.message}
        </p>

        <div className="mt-4 space-y-2 rounded-md border border-border bg-muted/40 p-3 text-sm">
          <p className="font-medium">
            Selected: {payload.patient.displayName}{" "}
            <span className="text-muted-foreground">
              ({payload.patient.mrn})
            </span>
          </p>
          <p className="text-xs text-muted-foreground">Also on file:</p>
          <ul className="space-y-1">
            {payload.siblings.map((s) => (
              <li key={s.id}>
                {s.displayName}{" "}
                <span className="text-muted-foreground">({s.mrn})</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-5 flex flex-col gap-2 [&>button]:h-11 [&>button]:whitespace-normal sm:[&>button]:h-9">
          <Button
            type="button"
            disabled={busy}
            onClick={() => onConfirm("distinct_people")}
          >
            These are different people
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => onConfirm("possible_duplicate_acknowledged")}
          >
            Possible duplicate — proceed with selected MRN
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={onCancel}
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
