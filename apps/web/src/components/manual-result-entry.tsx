import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Select } from "./ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { ConfirmAccessionActionDialog } from "./confirm-accession-action-dialog";

const FLAG_OPTIONS = [
  { value: "unknown", label: "Unknown" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "low", label: "Low" },
  { value: "critical", label: "Critical" },
];

function flagOptionValue(flag: string | undefined): string {
  if (!flag) return "unknown";
  return FLAG_OPTIONS.some((option) => option.value === flag)
    ? flag
    : "unknown";
}

export function ManualResultEntryDialog({
  accessionNumber,
  testCode,
  testName,
  resultComponentCode,
  resultComponentName,
  resultId,
  open,
  onOpenChange,
  isEdit = false,
  initialValue,
  initialUnits,
  initialFlag,
  initialReferenceLow,
  initialReferenceHigh,
}: {
  accessionNumber: string;
  testCode: string;
  testName: string;
  resultComponentCode?: string;
  resultComponentName?: string;
  resultId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isEdit?: boolean;
  initialValue?: string;
  initialUnits?: string | null;
  initialFlag?: string;
  initialReferenceLow?: number | null;
  initialReferenceHigh?: number | null;
}) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [value, setValue] = useState(initialValue ?? "");
  const [units, setUnits] = useState(initialUnits ?? "");
  const [flag, setFlag] = useState(flagOptionValue(initialFlag));
  const [referenceLow, setReferenceLow] = useState(
    initialReferenceLow != null ? String(initialReferenceLow) : "",
  );
  const [referenceHigh, setReferenceHigh] = useState(
    initialReferenceHigh != null ? String(initialReferenceHigh) : "",
  );
  const [error, setError] = useState<string | null>(null);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);

  // Always hydrate from the saved result when the dialog opens so edits
  // never start from a blank form after a prior enter/cancel cycle.
  useEffect(() => {
    if (!open) return;
    setValue(initialValue ?? "");
    setUnits(initialUnits ?? "");
    setFlag(flagOptionValue(initialFlag));
    setReferenceLow(
      initialReferenceLow != null ? String(initialReferenceLow) : "",
    );
    setReferenceHigh(
      initialReferenceHigh != null ? String(initialReferenceHigh) : "",
    );
    setError(null);
    setClearConfirmOpen(false);
  }, [
    open,
    initialValue,
    initialUnits,
    initialFlag,
    initialReferenceLow,
    initialReferenceHigh,
  ]);

  const invalidateAfterWrite = async () => {
    void queryClient.invalidateQueries({ queryKey: ["results"] });
    void queryClient.invalidateQueries({ queryKey: ["specimens"] });
    void queryClient.invalidateQueries({ queryKey: ["syncStatus"] });
    try {
      await api.drainSync();
    } catch {
      /* cron retries */
    }
  };

  const save = useMutation({
    mutationFn: () =>
      api.enterManualResult({
        accessionNumber,
        orderedTestCode: testCode,
        resultComponentCode,
        testCode,
        value: value.trim(),
        units: units.trim() || undefined,
        flag,
        referenceLow: referenceLow.trim()
          ? Number(referenceLow)
          : undefined,
        referenceHigh: referenceHigh.trim()
          ? Number(referenceHigh)
          : undefined,
      }),
    onSuccess: async () => {
      setError(null);
      onOpenChange(false);
      await invalidateAfterWrite();
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Could not save result");
      }
    },
  });

  const clear = useMutation({
    mutationFn: () => {
      if (!resultId) {
        throw new Error("Missing result id");
      }
      return api.clearManualResult({ resultId });
    },
    onSuccess: async () => {
      setError(null);
      setClearConfirmOpen(false);
      onOpenChange(false);
      await invalidateAfterWrite();
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Could not clear result");
      }
    },
  });

  const busy = save.isPending || clear.isPending;
  const canClear = Boolean(isEdit && resultId && auth.accessToken);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isEdit ? "Edit manual result" : "Enter manual result"}
            </DialogTitle>
            <DialogDescription>
              <span className="text-base font-medium">
                <span className="font-mono">{testCode}</span> — {testName}
              </span>
              {resultComponentName &&
              resultComponentName !== "Manual result" ? (
                <>
                  <br />
                  Required observation: {resultComponentName}
                </>
              ) : null}
              <br />
              Accession <span className="font-mono">{accessionNumber}</span>
            </DialogDescription>
          </DialogHeader>

          <form
            className="space-y-3 px-4 pb-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!value.trim()) {
                setError("Value is required");
                return;
              }
              save.mutate();
            }}
          >
            <div className="space-y-1.5">
              <label htmlFor="manual-value" className="text-sm font-medium">
                Value
              </label>
              <Input
                id="manual-value"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="e.g. 12, O Positive, No growth"
                autoFocus
                disabled={!auth.accessToken || busy}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="manual-units" className="text-sm font-medium">
                Units (optional)
              </label>
              <Input
                id="manual-units"
                value={units}
                onChange={(e) => setUnits(e.target.value)}
                placeholder="e.g. mm/hr, %"
                disabled={!auth.accessToken || busy}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="manual-flag" className="text-sm font-medium">
                Flag
              </label>
              <Select
                id="manual-flag"
                value={flag}
                onValueChange={setFlag}
                options={FLAG_OPTIONS}
                disabled={!auth.accessToken || busy}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <label htmlFor="manual-ref-low" className="text-sm font-medium">
                  Ref low (optional)
                </label>
                <Input
                  id="manual-ref-low"
                  type="number"
                  step="any"
                  value={referenceLow}
                  onChange={(e) => setReferenceLow(e.target.value)}
                  disabled={!auth.accessToken || busy}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="manual-ref-high" className="text-sm font-medium">
                  Ref high (optional)
                </label>
                <Input
                  id="manual-ref-high"
                  type="number"
                  step="any"
                  value={referenceHigh}
                  onChange={(e) => setReferenceHigh(e.target.value)}
                  disabled={!auth.accessToken || busy}
                />
              </div>
            </div>

            {error ? (
              <p className="text-sm text-lab-danger" role="alert">
                {error}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-2 px-0 pb-0 pt-2">
              {canClear ? (
                <Button
                  type="button"
                  variant="outline"
                  className="border-destructive/40 text-destructive hover:bg-destructive/10"
                  onClick={() => setClearConfirmOpen(true)}
                  disabled={busy}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                  Clear result
                </Button>
              ) : (
                <span />
              )}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={busy}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={!auth.accessToken || busy || !value.trim()}
                >
                  {save.isPending ? (
                    <Loader2
                      className="mr-1.5 size-3.5 animate-spin"
                      aria-hidden
                    />
                  ) : (
                    <Pencil className="mr-1.5 size-3.5" aria-hidden />
                  )}
                  {isEdit ? "Update result" : "Save result"}
                </Button>
              </div>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmAccessionActionDialog
        open={clearConfirmOpen}
        onOpenChange={setClearConfirmOpen}
        title="Clear this manual result?"
        description="Remove this manual result? The test will show as not entered, and you can enter it again later."
        confirmLabel="Clear result"
        pending={clear.isPending}
        onConfirm={() => clear.mutate()}
      />
    </>
  );
}

export function ManualResultEntryButton({
  accessionNumber,
  testCode,
  testName,
  resultComponentCode,
  resultComponentName,
  resultId,
  existingResult,
}: {
  accessionNumber: string;
  testCode: string;
  testName: string;
  resultComponentCode?: string;
  resultComponentName?: string;
  resultId?: string;
  existingResult?: {
    value: string;
    units?: string | null;
    flag?: string;
    referenceLow?: number | null;
    referenceHigh?: number | null;
  };
}) {
  const [open, setOpen] = useState(false);
  const isEdit = Boolean(existingResult);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 text-xs"
        onClick={() => setOpen(true)}
      >
        {isEdit ? "Edit result" : "Enter result"}
      </Button>
      {open ? (
        <ManualResultEntryDialog
          accessionNumber={accessionNumber}
          testCode={testCode}
          testName={testName}
          resultComponentCode={resultComponentCode}
          resultComponentName={resultComponentName}
          resultId={resultId}
          open={open}
          onOpenChange={setOpen}
          isEdit={isEdit}
          initialValue={existingResult?.value}
          initialUnits={existingResult?.units}
          initialFlag={existingResult?.flag}
          initialReferenceLow={existingResult?.referenceLow}
          initialReferenceHigh={existingResult?.referenceHigh}
        />
      ) : null}
    </>
  );
}
