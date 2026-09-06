import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  useMutation,
  useQueries,
  useQueryClient,
} from "@tanstack/react-query";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import type { OrderSelection } from "@drax-lis/catalog";
import {
  buildPanelsWithMembers,
  groupTestsBySpecimenBucket,
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
import {
  MultiLabelPreviewPanel,
  type LabelPreviewItem,
} from "../../components/accessioning/multi-label-preview-panel";
import { PatientPicker } from "../../components/accessioning/patient-picker";
import { PatientRequiredHint } from "../../components/accessioning/patient-required-hint";
import { PanelOrderSection } from "../../components/requisition/panel-order-section";
import { IndividualTestsSection } from "../../components/requisition/individual-tests-section";
import { SelectedTestsSummary } from "../../components/requisition/selected-tests-summary";
import { FastingCallout } from "../../components/requisition/fasting-callout";
import {
  EMPTY_SPECIMEN_INFO,
  SpecimenInformationSection,
} from "../../components/requisition/specimen-information-section";
import { selectionsToOrderedTests } from "../../components/requisition/test-order-form";
import { ConfirmAccessionActionDialog } from "../../components/confirm-accession-action-dialog";
import { useCatalog } from "../../lib/use-catalog";
import { useAuth } from "../../lib/auth";
import { useUnsavedWorkGuard } from "../../lib/use-unsaved-work-guard";
import { useIsWide } from "../../lib/use-media-query";
import { Button } from "../../components/ui/button";
import { ScrollContainer } from "../../components/ui/scroll-container";
import { Select } from "../../components/ui/select";
import { cn } from "../../lib/utils";
import type { SpecimenInfo } from "@drax-lis/contracts";
import { AccessionMobileWizard } from "../../components/accessioning/accession-mobile-wizard";

export const Route = createFileRoute("/_lab/accession")({
  component: AccessionPage,
});

const EMPTY_SELECTIONS: OrderSelection[] = [];

type RegisteredSpecimenLabel = {
  accessionNumber: string;
  specimenType: string;
  labelPreview: LabelPreviewFields;
  printStatus?: { ok: boolean; error?: string };
};

function AccessionPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const auth = useAuth();
  const catalogQ = useCatalog();
  const [selected, setSelected] = useState<PatientListItem | null>(null);
  const [selections, setSelections] =
    useState<OrderSelection[]>(EMPTY_SELECTIONS);
  const deferredSelections = useDeferredValue(selections);
  const [printLabel, setPrintLabel] = useState(true);
  const [copies, setCopies] = useState(1);
  const [registeredSpecimens, setRegisteredSpecimens] = useState<
    RegisteredSpecimenLabel[]
  >([]);
  const [confirmPayload, setConfirmPayload] =
    useState<IdentityConfirmationRequired | null>(null);
  const [pendingConfirmation, setPendingConfirmation] =
    useState<IdentityConfirmation | null>(null);
  const [copied, setCopied] = useState<"barcode" | null>(null);
  const [specimenInfo, setSpecimenInfo] =
    useState<SpecimenInfo>(EMPTY_SPECIMEN_INFO);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [discardIntent, setDiscardIntent] = useState<"nav" | "start-over">(
    "nav",
  );

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

  const specimenGroups = useMemo(
    () => groupTestsBySpecimenBucket(expandedTests),
    [expandedTests],
  );

  const isRegistered = registeredSpecimens.length > 0;
  const primaryAccession = registeredSpecimens[0]?.accessionNumber ?? null;

  const previewQueries = useQueries({
    queries: specimenGroups.map((group) => ({
      queryKey: [
        "print-preview",
        selected?.id,
        group.specimenType,
        group.tests.map((t) => t.code).join(","),
        selected?.mrn,
      ],
      queryFn: () =>
        api.printPreview({
          accessionNumber: "Assigns on accession",
          patientName: selected!.displayName,
          barcode: selected!.mrn,
          dateOfBirth: selected!.dateOfBirth,
          orderedTests: group.tests.map((t) => t.code),
          specimenType: group.specimenType,
          mrn: selected!.mrn,
        }),
      enabled:
        Boolean(selected) && !isRegistered && group.tests.length > 0,
      staleTime: 400,
    })),
  });

  const reprintMutation = useMutation({
    mutationFn: (accessions: string[]) =>
      Promise.all(
        accessions.map((accession) =>
          api.reprintLabel({ accessionNumber: accession, copies }),
        ),
      ),
    onSuccess: (results) => {
      setRegisteredSpecimens((prev) =>
        prev.map((item, i) => ({
          ...item,
          labelPreview: results[i]?.fields ?? item.labelPreview,
          printStatus: {
            ok: results[i]?.ok ?? false,
            error: results[i]?.error,
          },
        })),
      );
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

      const batchSpecimens = specimenGroups.map((group) => ({
        specimenType: group.specimenType,
        orderedTests: group.tests.map((t) => ({ code: t.code, name: t.name })),
      }));

      const data = await api.registerSpecimensBatch({
        patientId: selected.id,
        identityConfirmation:
          identityConfirmation ?? pendingConfirmation ?? undefined,
        requisitionId,
        printLabel,
        copies,
        collectedAt: specimenInfo.collectedAt,
        specimens: batchSpecimens,
      });

      // Cloud requisition stores one primary accession; all edge specimens share requisitionId.
      if (requisitionId && data.specimens[0]?.accessionNumber) {
        await api.linkRequisition(requisitionId, {
          accessionNumber: data.specimens[0].accessionNumber,
          edgeSpecimenId: data.specimens[0].id ?? "",
        });
      }

      return { data, batchSpecimens };
    },
    onSuccess: ({ data, batchSpecimens }) => {
      setRegisteredSpecimens(
        data.specimens.map((specimen, i) => {
          const group = batchSpecimens[i];
          const codes = group?.orderedTests.map((t) => t.code) ?? [];
          const acc = specimen.accessionNumber;
          const printResult = data.printResults?.[i];
          return {
            accessionNumber: acc,
            specimenType:
              specimen.specimenType ?? group?.specimenType ?? "blood",
            labelPreview:
              data.labelPreviews[i] ??
              printResult?.fields ??
              previewQueries[i]?.data?.fields ??
              (selected
                ? {
                    ...buildDraftLabelPreview(
                      selected,
                      codes,
                      group?.specimenType ?? "blood",
                    ),
                    accessionNumber: acc,
                    barcode: acc,
                  }
                : {
                    accessionNumber: acc,
                    patientName: "",
                    barcode: acc,
                    dateOfBirth: "",
                    orderedTests: codes.join(", "),
                    specimenType: group?.specimenType ?? "blood",
                    printedAt: new Date().toISOString(),
                  }),
            printStatus: printResult
              ? { ok: printResult.ok, error: printResult.error }
              : printLabel
                ? { ok: false, error: "No print result" }
                : undefined,
          };
        }),
      );
      resetAccessionDraft();
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

  function resetAccessionDraft() {
    setSelected(null);
    setSelections(EMPTY_SELECTIONS);
    setSpecimenInfo(EMPTY_SPECIMEN_INFO);
    setConfirmPayload(null);
    setPendingConfirmation(null);
    mutation.reset();
  }

  function startNewAccession() {
    setRegisteredSpecimens([]);
    resetAccessionDraft();
  }

  const draftDirty =
    !isRegistered && (selected != null || selections.length > 0);

  const navigationBlocker = useUnsavedWorkGuard(draftDirty);

  useEffect(() => {
    if (navigationBlocker.status === "blocked") {
      setDiscardIntent("nav");
      setDiscardOpen(true);
    }
  }, [navigationBlocker.status]);

  function closeDiscardPrompt() {
    if (discardIntent === "nav" && navigationBlocker.status === "blocked") {
      navigationBlocker.reset?.();
    }
    setDiscardOpen(false);
  }

  function confirmDiscard() {
    if (discardIntent === "nav") {
      navigationBlocker.proceed?.();
    } else {
      resetAccessionDraft();
    }
    setDiscardOpen(false);
  }

  function requestStartOver() {
    if (!draftDirty) return;
    setDiscardIntent("start-over");
    setDiscardOpen(true);
  }

  const previewLabels = useMemo((): LabelPreviewItem[] => {
    if (registeredSpecimens.length > 0) {
      return registeredSpecimens.map((item, i) => ({
        id: `${item.specimenType}-${i}`,
        specimenType: item.specimenType,
        fields: item.labelPreview,
        accessionNumber: item.accessionNumber,
        printStatus: item.printStatus ?? null,
      }));
    }
    if (!selected || specimenGroups.length === 0) return [];
    return specimenGroups.map((group, i) => {
      const codes = group.tests.map((t) => t.code);
      return {
        id: `${group.specimenType}-${i}`,
        specimenType: group.specimenType,
        fields:
          previewQueries[i]?.data?.fields ??
          buildDraftLabelPreview(selected, codes, group.specimenType),
        accessionNumber: null,
        printStatus: null,
        testCount: group.tests.length,
      };
    });
  }, [registeredSpecimens, selected, specimenGroups, previewQueries]);

  const previewPhase = isRegistered
    ? "registered"
    : selected
      ? "draft"
      : "idle";

  const previewLoading =
    Boolean(selected) &&
    !isRegistered &&
    previewQueries.some((q) => q.isFetching);

  const previewWarning =
    previewQueries.some((q) => q.isError) && selected && !isRegistered
      ? "Could not load the label preview — showing a draft."
      : undefined;

  const allAccessionNumbers = registeredSpecimens
    .map((s) => s.accessionNumber)
    .join("\n");

  const showPatientReminder =
    !selected && !isRegistered && expandedTests.length > 0;

  const isWide = useIsWide();

  const mobileWizard = (
    <AccessionMobileWizard
      selected={selected}
      onSelectPatient={setSelected}
      onAccessionScan={(accession) => {
        void navigate({ to: "/labels", search: { accession } });
      }}
      catalog={catalogQ.data}
      selections={selections}
      onSelectionsChange={setSelections}
      expandedTests={expandedTests}
      panelCount={panelCount}
      individualCount={individualCount}
      fasting={fasting}
      specimenInfo={specimenInfo}
      onSpecimenInfoChange={setSpecimenInfo}
      currentUserId={auth.session?.user?.id ?? auth.profile?.id}
      printLabel={printLabel}
      onPrintLabelChange={setPrintLabel}
      copies={copies}
      onCopiesChange={setCopies}
      signedIn={Boolean(auth.accessToken)}
      isRegistered={isRegistered}
      registeredSpecimens={registeredSpecimens}
      primaryAccession={primaryAccession}
      previewLabels={previewLabels}
      previewPhase={previewPhase}
      previewLoading={previewLoading}
      previewWarning={previewWarning}
      specimenGroupCount={specimenGroups.length}
      mutation={mutation}
      reprintPending={reprintMutation.isPending}
      onReprint={() =>
        reprintMutation.mutate(
          registeredSpecimens.map((s) => s.accessionNumber),
        )
      }
      onStartNew={startNewAccession}
      onRequestStartOver={requestStartOver}
      draftDirty={draftDirty}
      pendingConfirmation={pendingConfirmation}
    />
  );

  if (!isWide) {
    return (
      <>
        {mobileWizard}
        {mutation.isError && !confirmPayload && (
          <p className="px-3 text-sm text-lab-danger">
            {mutation.error instanceof ApiError
              ? mutation.error.message
              : "Accession failed — please try again."}
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
        <ConfirmAccessionActionDialog
          open={discardOpen}
          onOpenChange={(open) => {
            if (!open) closeDiscardPrompt();
          }}
          title="Discard accession draft?"
          description="You'll lose the current patient and test selections."
          confirmLabel="Discard"
          onConfirm={() => confirmDiscard()}
        />
      </>
    );
  }

  return (
    <AccessioningShell
      wide
      title="Accession"
      description="Select an existing patient, build the test order, preview the tube label, then accession and print."
    >
      <form
        className="grid min-w-0 grid-cols-1 gap-5 overflow-x-hidden lg:grid-cols-2 lg:grid-rows-[minmax(0,1fr)_auto] lg:min-h-0 lg:flex-1 lg:overflow-hidden xl:grid-cols-[minmax(15rem,18rem)_minmax(0,1fr)_minmax(0,1fr)_minmax(22rem,28rem)] xl:grid-rows-1"
        onSubmit={(e) => {
          e.preventDefault();
          if (!selected || isRegistered) return;
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

          {!auth.accessToken && !isRegistered && (
            <div className="shrink-0 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-xs">
              <p>
                Sign in to save the order with this accession.
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
            scanEnabled={!isRegistered}
            fillHeight
            className="min-h-0"
          />
        </div>

        {/* Col 2 & 3 — Panels + individual tests (side by side from lg up) */}
        {!isRegistered && catalogQ.data && (
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

        {/* Col 4 — Session: column scrolls; sections scroll internally when they overflow */}
        <ScrollContainer className="h-full min-h-0 min-w-0 xl:min-w-[22rem] lg:col-span-2 xl:col-span-1">
          <div className="flex min-w-0 flex-col gap-3">
          {!isRegistered && catalogQ.data && (
            <>
              <div className="min-w-0 rounded-xl border border-border bg-card p-4 shadow-sm">
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
                expandedTests={expandedTests}
                currentUserId={auth.session?.user?.id ?? auth.profile?.id}
              />

              <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
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
                className="h-11 w-full"
                disabled={
                  mutation.isPending ||
                  !selected ||
                  expandedTests.length === 0
                }
              >
                {mutation.isPending
                  ? "Accessioning…"
                  : printLabel
                    ? specimenGroups.length > 1
                      ? "Accession & Print Labels"
                      : "Accession & Print Label"
                    : specimenGroups.length > 1
                      ? "Accession specimens"
                      : "Accession specimen"}
              </Button>

              {draftDirty && (
                <Button
                  type="button"
                  variant="ghost"
                  className="h-9 w-full text-muted-foreground"
                  onClick={requestStartOver}
                >
                  Start over
                </Button>
              )}
            </>
          )}

          <MultiLabelPreviewPanel
            phase={previewPhase}
            labels={previewLabels}
            emptyContext="register"
            loading={previewLoading}
            previewWarning={previewWarning}
            actions={
              isRegistered && primaryAccession ? (
                <div className="grid grid-cols-2 gap-2 [&>*]:h-11 [&>*]:w-full [&>*]:justify-center sm:flex sm:flex-wrap sm:[&>*]:h-8 sm:[&>*]:w-auto">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      void navigator.clipboard.writeText(allAccessionNumbers);
                      setCopied("barcode");
                      setTimeout(() => setCopied(null), 1500);
                    }}
                  >
                    {copied === "barcode"
                      ? "Copied"
                      : registeredSpecimens.length > 1
                        ? "Copy barcodes"
                        : "Copy barcode"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={reprintMutation.isPending}
                    onClick={() =>
                      reprintMutation.mutate(
                        registeredSpecimens.map((s) => s.accessionNumber),
                      )
                    }
                  >
                    {reprintMutation.isPending
                      ? "Printing…"
                      : registeredSpecimens.length > 1
                        ? "Reprint all"
                        : "Reprint"}
                  </Button>
                  <Link
                    to="/labels"
                    search={{ accession: primaryAccession }}
                    className="inline-flex h-8 items-center rounded-md bg-secondary px-3 text-xs font-medium text-secondary-foreground hover:bg-secondary/80"
                  >
                    Open in Labels
                  </Link>
                  <Link
                    to="/bench"
                    search={{ q: primaryAccession }}
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
          </div>
        </ScrollContainer>
      </form>

      {mutation.isError && !confirmPayload && (
        <p className="text-sm text-lab-danger">
          {mutation.error instanceof ApiError
            ? mutation.error.message
            : "Accession failed — please try again."}
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

      <ConfirmAccessionActionDialog
        open={discardOpen}
        onOpenChange={(open) => {
          if (!open) closeDiscardPrompt();
        }}
        title="Discard accession draft?"
        description="You'll lose the current patient and test selections."
        confirmLabel="Discard"
        onConfirm={() => confirmDiscard()}
      />
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
