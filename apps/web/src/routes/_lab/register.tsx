import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  ApiError,
  api,
  isIdentityConfirmationRequired,
  type IdentityConfirmation,
  type IdentityConfirmationRequired,
  type LabelPreviewFields,
  type PatientListItem,
} from "../../lib/api";
import {
  buildDraftLabelPreview,
} from "../../lib/label-preview-draft";
import { AccessioningShell } from "../../components/accessioning/accessioning-shell";
import { LabelPreviewPanel } from "../../components/accessioning/label-preview-panel";
import { PatientPicker } from "../../components/accessioning/patient-picker";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";

export const Route = createFileRoute("/_lab/register")({
  component: RegisterPage,
});

const TEST_PRESETS = [
  { label: "CBC", value: "CBC" },
  { label: "BMP", value: "BMP" },
  { label: "CHEM", value: "CHEM" },
  { label: "IA", value: "TSH,FT4" },
] as const;

function RegisterPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<PatientListItem | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    firstName: "",
    middleName: "",
    lastName: "",
    dateOfBirth: "",
    sex: "" as "" | "M" | "F" | "O" | "U",
  });
  const [tests, setTests] = useState("CBC");
  const deferredTests = useDeferredValue(tests);
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

  const testCodes = useMemo(
    () =>
      deferredTests
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    [deferredTests],
  );

  const draftPreview = useMemo(
    () => (selected ? buildDraftLabelPreview(selected, testCodes) : null),
    [selected, testCodes],
  );

  const previewQ = useQuery({
    queryKey: ["print-preview", selected?.id, testCodes.join(","), selected?.mrn],
    queryFn: () =>
      api.printPreview({
        accessionNumber: "Assigns on register",
        patientName: selected!.displayName,
        barcode: selected!.mrn,
        dateOfBirth: selected!.dateOfBirth,
        orderedTests: testCodes,
        mrn: selected!.mrn,
      }),
    enabled: Boolean(selected) && !registeredAccession,
    staleTime: 400,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.createPatient({
        firstName: createForm.firstName.trim(),
        lastName: createForm.lastName.trim(),
        middleName: createForm.middleName.trim() || undefined,
        dateOfBirth: createForm.dateOfBirth.trim() || undefined,
        sex: createForm.sex || undefined,
      }),
    onSuccess: (patient) => {
      setSelected(patient);
      setShowCreate(false);
      setCreateForm({
        firstName: "",
        middleName: "",
        lastName: "",
        dateOfBirth: "",
        sex: "",
      });
      void qc.invalidateQueries({ queryKey: ["patients-all"] });
      void qc.invalidateQueries({ queryKey: ["patients"] });
      void qc.invalidateQueries({ queryKey: ["syncStatus"] });
    },
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
    mutationFn: (identityConfirmation?: IdentityConfirmation) => {
      if (!selected) throw new Error("Select a patient");
      return api.registerSpecimen({
        patientId: selected.id,
        identityConfirmation:
          identityConfirmation ?? pendingConfirmation ?? undefined,
        orderedTests: testCodes.map((code) => ({ code })),
        printLabel,
        copies,
      });
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

  function openCreateFromSearch(seed: string) {
    const parts = seed.trim().split(/\s+/).filter(Boolean);
    setCreateForm((prev) => ({
      ...prev,
      firstName: parts[0] ?? prev.firstName,
      lastName: parts.length >= 2 ? parts.slice(1).join(" ") : prev.lastName,
    }));
    setShowCreate(true);
  }

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

  function startNewRegistration() {
    setRegisteredAccession(null);
    setRegisteredPreview(null);
    setRegisteredPrintStatus(null);
    setSelected(null);
    setTests("CBC");
  }

  const previewFields =
    registeredPreview ?? previewQ.data?.fields ?? draftPreview;
  const previewPhase = registeredAccession
    ? "registered"
    : selected
      ? "draft"
      : "idle";

  const previewPanel = (
    <LabelPreviewPanel
      phase={previewPhase}
      fields={previewFields}
      emptyContext="register"
      loading={Boolean(selected && previewQ.isFetching && !registeredAccession)}
      previewWarning={
        previewQ.isError && selected && !registeredAccession
          ? "Could not reach edge for ZPL preview — showing draft."
          : undefined
      }
      printStatus={registeredPrintStatus}
      accessionNumber={registeredAccession}
      actions={
        registeredAccession ? (
          <div className="flex flex-wrap gap-2">
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
              onClick={startNewRegistration}
            >
              Register another
            </Button>
          </div>
        ) : undefined
      }
    />
  );

  return (
    <AccessioningShell
      title="Specimen Registration"
      description="Select a patient, configure tests, preview the tube label, then register and print."
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <form
          className="order-2 space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm lg:order-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (!selected || registeredAccession) return;
            mutation.mutate(pendingConfirmation ?? undefined);
          }}
        >
          <PatientPicker
            selected={selected}
            onSelect={setSelected}
            onAccessionScan={(accession) => {
              void navigate({
                to: "/labels",
                search: { accession },
              });
            }}
            showCreate={showCreate}
            onShowCreate={setShowCreate}
            onOpenCreateFromSearch={openCreateFromSearch}
            scanEnabled={!registeredAccession}
          />

          {showCreate && !selected && (
            <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
              <p className="text-sm font-medium">New provisional patient</p>
              <p className="text-xs text-muted-foreground">
                Creates a local TEMP MRN for accessioning. Syncs upstream when
                the registry link is online.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block space-y-1">
                  <span className="text-xs font-medium">First name</span>
                  <Input
                    value={createForm.firstName}
                    onChange={(e) =>
                      setCreateForm((f) => ({ ...f, firstName: e.target.value }))
                    }
                    required
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-medium">Middle name</span>
                  <Input
                    value={createForm.middleName}
                    onChange={(e) =>
                      setCreateForm((f) => ({
                        ...f,
                        middleName: e.target.value,
                      }))
                    }
                  />
                </label>
                <label className="block space-y-1 sm:col-span-2">
                  <span className="text-xs font-medium">Last name</span>
                  <Input
                    value={createForm.lastName}
                    onChange={(e) =>
                      setCreateForm((f) => ({ ...f, lastName: e.target.value }))
                    }
                    required
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-medium">Date of birth</span>
                  <Input
                    type="date"
                    value={createForm.dateOfBirth}
                    onChange={(e) =>
                      setCreateForm((f) => ({
                        ...f,
                        dateOfBirth: e.target.value,
                      }))
                    }
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-medium">Sex</span>
                  <select
                    className="flex h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
                    value={createForm.sex}
                    onChange={(e) =>
                      setCreateForm((f) => ({
                        ...f,
                        sex: e.target.value as typeof f.sex,
                      }))
                    }
                  >
                    <option value="">—</option>
                    <option value="F">F</option>
                    <option value="M">M</option>
                    <option value="O">O</option>
                    <option value="U">U</option>
                  </select>
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={
                    createMutation.isPending ||
                    !createForm.firstName.trim() ||
                    !createForm.lastName.trim()
                  }
                  onClick={() => createMutation.mutate()}
                >
                  {createMutation.isPending
                    ? "Creating…"
                    : "Create & select patient"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowCreate(false)}
                >
                  Cancel
                </Button>
              </div>
              {createMutation.isError && (
                <p className="text-sm text-lab-danger">
                  {createMutation.error instanceof ApiError
                    ? createMutation.error.message
                    : "Could not create patient"}
                </p>
              )}
            </div>
          )}

          {!registeredAccession && (
            <>
              <div className="space-y-2">
                <span className="text-sm font-medium">Ordered tests</span>
                <div className="flex flex-wrap gap-2">
                  {TEST_PRESETS.map((preset) => (
                    <Button
                      key={preset.label}
                      type="button"
                      size="sm"
                      variant={tests === preset.value ? "default" : "outline"}
                      onClick={() => setTests(preset.value)}
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>
                <Input
                  value={tests}
                  onChange={(e) => setTests(e.target.value)}
                  placeholder="Custom: CBC, BMP, …"
                />
              </div>

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
                  <select
                    className="h-9 rounded-md border border-border bg-background px-2"
                    value={copies}
                    onChange={(e) => setCopies(Number(e.target.value))}
                    disabled={!printLabel}
                  >
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <Button type="submit" disabled={mutation.isPending || !selected}>
                {mutation.isPending
                  ? "Registering…"
                  : printLabel
                    ? "Register & Print Label"
                    : "Register specimen"}
              </Button>
            </>
          )}
        </form>

        <div className="order-1 lg:order-2">{previewPanel}</div>
      </div>

      {mutation.isError && !confirmPayload && (
        <p className="text-sm text-lab-danger">
          {mutation.error instanceof ApiError
            ? mutation.error.message
            : "Registration failed — is edge-engine running?"}
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
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-lg">
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

        <div className="mt-5 flex flex-col gap-2">
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
