import { Link } from "@tanstack/react-router";
import type { CatalogResponse, SpecimenInfo } from "@drax-lis/contracts";
import type { ExpandedOrderedTest, OrderSelection } from "@drax-lis/catalog";
import type { UseMutationResult } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type {
  IdentityConfirmation,
  LabelPreviewFields,
  PatientListItem,
} from "../../lib/api";
import { PatientPicker } from "../accessioning/patient-picker";
import {
  MultiLabelPreviewPanel,
  type LabelPreviewItem,
} from "../accessioning/multi-label-preview-panel";
import { PanelOrderSection } from "../requisition/panel-order-section";
import { IndividualTestsSection } from "../requisition/individual-tests-section";
import { SelectedTestsSummary } from "../requisition/selected-tests-summary";
import { FastingCallout } from "../requisition/fasting-callout";
import { SpecimenInformationSection } from "../requisition/specimen-information-section";
import { MobileScreen } from "../mobile-screen";
import {
  MobileWizardChrome,
  MobileWizardFooter,
} from "../mobile-wizard-chrome";
import { ScrollContainer } from "../ui/scroll-container";
import { Button } from "../ui/button";
import { Select } from "../ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { AccessioningTabs } from "../accessioning/accessioning-tabs";
import { PrinterStatusPill } from "../accessioning/printer-status-pill";

const DRAFT_STEPS = ["Patient", "Order", "Specimen", "Review"] as const;

type RegisteredSpecimenLabel = {
  accessionNumber: string;
  specimenType: string;
  labelPreview: LabelPreviewFields;
  printStatus?: { ok: boolean; error?: string };
};

type Props = {
  selected: PatientListItem | null;
  onSelectPatient: (patient: PatientListItem | null) => void;
  onAccessionScan: (accession: string) => void;
  catalog: CatalogResponse | undefined;
  selections: OrderSelection[];
  onSelectionsChange: (next: OrderSelection[]) => void;
  expandedTests: ExpandedOrderedTest[];
  panelCount: number;
  individualCount: number;
  fasting: boolean;
  specimenInfo: SpecimenInfo;
  onSpecimenInfoChange: (next: SpecimenInfo) => void;
  currentUserId?: string;
  printLabel: boolean;
  onPrintLabelChange: (next: boolean) => void;
  copies: number;
  onCopiesChange: (next: number) => void;
  signedIn: boolean;
  isRegistered: boolean;
  registeredSpecimens: RegisteredSpecimenLabel[];
  primaryAccession: string | null;
  previewLabels: LabelPreviewItem[];
  previewPhase: "idle" | "draft" | "registered";
  previewLoading: boolean;
  previewWarning?: string;
  specimenGroupCount: number;
  mutation: UseMutationResult<
    unknown,
    Error,
    IdentityConfirmation | undefined,
    unknown
  >;
  reprintPending: boolean;
  onReprint: () => void;
  onStartNew: () => void;
  onRequestStartOver: () => void;
  draftDirty: boolean;
  pendingConfirmation: IdentityConfirmation | null;
};

export function AccessionMobileWizard({
  selected,
  onSelectPatient,
  onAccessionScan,
  catalog,
  selections,
  onSelectionsChange,
  expandedTests,
  panelCount,
  individualCount,
  fasting,
  specimenInfo,
  onSpecimenInfoChange,
  currentUserId,
  printLabel,
  onPrintLabelChange,
  copies,
  onCopiesChange,
  signedIn,
  isRegistered,
  registeredSpecimens,
  primaryAccession,
  previewLabels,
  previewPhase,
  previewLoading,
  previewWarning,
  specimenGroupCount,
  mutation,
  reprintPending,
  onReprint,
  onStartNew,
  onRequestStartOver,
  draftDirty,
  pendingConfirmation,
}: Props) {
  const [step, setStep] = useState(0);
  const [copied, setCopied] = useState(false);
  const wasRegistered = useRef(isRegistered);

  useEffect(() => {
    if (isRegistered) {
      setStep(4);
    } else if (wasRegistered.current) {
      setStep(0);
    }
    wasRegistered.current = isRegistered;
  }, [isRegistered]);

  const draftStepCount = DRAFT_STEPS.length;
  const onSuccess = step >= 4 || isRegistered;
  const stepLabel = onSuccess
    ? "Done"
    : DRAFT_STEPS[Math.min(step, draftStepCount - 1)]!;

  const canNext =
    step === 0
      ? Boolean(selected)
      : step === 1
        ? expandedTests.length > 0
        : true;

  function goNext() {
    if (step < draftStepCount - 1) setStep((s) => s + 1);
  }

  function goBack() {
    if (onSuccess) return;
    if (step > 0) setStep((s) => s - 1);
  }

  const allAccessionNumbers = registeredSpecimens
    .map((s) => s.accessionNumber)
    .join("\n");

  const submitLabel = mutation.isPending
    ? "Accessioning…"
    : printLabel
      ? specimenGroupCount > 1
        ? "Accession & Print"
        : "Accession & Print"
      : specimenGroupCount > 1
        ? "Accession specimens"
        : "Accession specimen";

  return (
    <MobileScreen
      className="bg-background"
      header={
        <div className="space-y-0">
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
            <AccessioningTabs />
            <PrinterStatusPill />
          </div>
          {!onSuccess ? (
            <MobileWizardChrome
              stepIndex={step}
              stepCount={draftStepCount}
              stepLabel={stepLabel}
            />
          ) : (
            <div className="border-b border-border px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Complete
              </p>
              <p className="font-display text-base font-semibold tracking-tight">
                Specimen registered
              </p>
            </div>
          )}
        </div>
      }
      footer={
        onSuccess ? (
          <div
            className="flex flex-col gap-2 border-t border-border bg-card px-4 py-3"
            style={{
              paddingBottom:
                "max(0.75rem, env(safe-area-inset-bottom, 0px))",
            }}
          >
            <Button type="button" className="h-11 w-full" onClick={onStartNew}>
              Accession another
            </Button>
            {primaryAccession ? (
              <div className="grid grid-cols-2 gap-2">
                <Link
                  to="/bench"
                  search={{ q: primaryAccession }}
                  className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-background text-sm font-medium"
                >
                  Open in Bench
                </Link>
                <Link
                  to="/labels"
                  search={{ accession: primaryAccession }}
                  className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-background text-sm font-medium"
                >
                  Open in Labels
                </Link>
              </div>
            ) : null}
          </div>
        ) : (
          <MobileWizardFooter
            hideBack={step === 0}
            onBack={goBack}
            onNext={step < draftStepCount - 1 ? goNext : undefined}
            nextDisabled={!canNext}
            primaryAction={
              step === draftStepCount - 1 ? (
                <Button
                  type="button"
                  className="min-w-[9rem]"
                  disabled={
                    mutation.isPending ||
                    !selected ||
                    expandedTests.length === 0
                  }
                  onClick={() =>
                    mutation.mutate(pendingConfirmation ?? undefined)
                  }
                >
                  {submitLabel}
                </Button>
              ) : undefined
            }
          />
        )
      }
    >
      {!onSuccess && step === 0 ? (
        <div className="flex h-full min-h-0 flex-col gap-2 p-3">
          {!signedIn && !isRegistered ? (
            <div className="shrink-0 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-xs">
              <p>Sign in to save the order with this accession.</p>
              <Link
                to="/login"
                className="mt-1 inline-flex font-medium text-primary hover:underline"
              >
                Sign in
              </Link>
            </div>
          ) : null}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border-2 border-accent/40 bg-card p-3">
            <PatientPicker
              selected={selected}
              onSelect={onSelectPatient}
              onAccessionScan={onAccessionScan}
              scanEnabled={!isRegistered}
              fillHeight
              className="min-h-0 h-full"
            />
          </div>
        </div>
      ) : !onSuccess && step === 1 && catalog ? (
        <div className="flex h-full min-h-0 flex-col gap-2 p-3">
          <p className="shrink-0 text-sm text-muted-foreground">
            {expandedTests.length} test
            {expandedTests.length === 1 ? "" : "s"} selected
            {panelCount || individualCount
              ? ` · ${panelCount} panel${panelCount === 1 ? "" : "s"}, ${individualCount} individual`
              : ""}
          </p>
          <Tabs
            defaultValue="panels"
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            <TabsList className="mb-2 grid h-10 w-full shrink-0 grid-cols-2">
              <TabsTrigger value="panels" className="px-2">
                Panels
                {panelCount > 0 ? ` (${panelCount})` : ""}
              </TabsTrigger>
              <TabsTrigger value="tests" className="px-2">
                Individual
                {individualCount > 0 ? ` (${individualCount})` : ""}
              </TabsTrigger>
            </TabsList>
            <TabsContent
              value="panels"
              className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden data-[state=inactive]:hidden"
            >
              <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card p-3">
                <PanelOrderSection
                  catalog={catalog}
                  selections={selections}
                  onChange={onSelectionsChange}
                  className="h-full min-h-0"
                />
              </div>
            </TabsContent>
            <TabsContent
              value="tests"
              className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden data-[state=inactive]:hidden"
            >
              <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card p-3">
                <IndividualTestsSection
                  catalog={catalog}
                  selections={selections}
                  onChange={onSelectionsChange}
                  className="h-full min-h-0"
                />
              </div>
            </TabsContent>
          </Tabs>
        </div>
      ) : (
      <ScrollContainer className="h-full">
        <div className="space-y-3 p-3 pb-4">
          {!signedIn && !isRegistered ? (
            <div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-xs">
              <p>Sign in to save the order with this accession.</p>
              <Link
                to="/login"
                className="mt-1 inline-flex font-medium text-primary hover:underline"
              >
                Sign in
              </Link>
            </div>
          ) : null}

          {onSuccess ? (
            <MultiLabelPreviewPanel
              phase={previewPhase}
              labels={previewLabels}
              emptyContext="register"
              loading={previewLoading}
              previewWarning={previewWarning}
              actions={
                primaryAccession ? (
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        void navigator.clipboard.writeText(allAccessionNumbers);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1500);
                      }}
                    >
                      {copied ? "Copied" : "Copy barcode"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={reprintPending}
                      onClick={onReprint}
                    >
                      {reprintPending ? "Printing…" : "Reprint"}
                    </Button>
                  </div>
                ) : undefined
              }
            />
          ) : null}

          {!onSuccess && step === 2 ? (
            <div className="space-y-3">
              <SpecimenInformationSection
                value={specimenInfo}
                onChange={onSpecimenInfoChange}
                expandedTests={expandedTests}
                currentUserId={currentUserId}
              />
              <div className="rounded-xl border border-border bg-card px-4 py-3">
                <div className="flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={printLabel}
                      onChange={(e) => onPrintLabelChange(e.target.checked)}
                      className="size-4 rounded border-border"
                    />
                    Print label
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    Copies
                    <Select
                      className="h-9 w-[4.5rem]"
                      value={String(copies)}
                      onValueChange={(v) => onCopiesChange(Number(v))}
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
            </div>
          ) : null}

          {!onSuccess && step === 3 ? (
            <div className="space-y-3">
              {catalog ? (
                <div className="rounded-xl border border-border bg-card p-4">
                  <SelectedTestsSummary
                    expanded={expandedTests}
                    panelCount={panelCount}
                    individualCount={individualCount}
                  />
                  <div className="mt-3">
                    <FastingCallout show={fasting} />
                  </div>
                </div>
              ) : null}
              <MultiLabelPreviewPanel
                phase={previewPhase}
                labels={previewLabels}
                emptyContext="register"
                loading={previewLoading}
                previewWarning={previewWarning}
              />
              {draftDirty ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="h-9 w-full text-muted-foreground"
                  onClick={onRequestStartOver}
                >
                  Start over
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </ScrollContainer>
      )}
    </MobileScreen>
  );
}
