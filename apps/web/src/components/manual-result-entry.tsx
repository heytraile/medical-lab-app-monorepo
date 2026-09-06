import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil } from "lucide-react";
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

const FLAG_OPTIONS = [
  { value: "unknown", label: "Unknown" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "low", label: "Low" },
  { value: "critical", label: "Critical" },
];

export function ManualResultEntryDialog({
  accessionNumber,
  testCode,
  testName,
  resultComponentCode,
  resultComponentName,
  open,
  onOpenChange,
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
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
  const [flag, setFlag] = useState(initialFlag ?? "unknown");
  const [referenceLow, setReferenceLow] = useState(
    initialReferenceLow != null ? String(initialReferenceLow) : "",
  );
  const [referenceHigh, setReferenceHigh] = useState(
    initialReferenceHigh != null ? String(initialReferenceHigh) : "",
  );
  const [error, setError] = useState<string | null>(null);

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
      void queryClient.invalidateQueries({ queryKey: ["results"] });
      void queryClient.invalidateQueries({ queryKey: ["specimens"] });
      void queryClient.invalidateQueries({ queryKey: ["syncStatus"] });
      try {
        await api.drainSync();
      } catch {
        /* cron retries */
      }
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

  const isEdit = Boolean(initialValue);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit manual result" : "Enter manual result"}</DialogTitle>
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
              disabled={!auth.accessToken || save.isPending}
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
              disabled={!auth.accessToken || save.isPending}
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
              disabled={!auth.accessToken || save.isPending}
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
                disabled={!auth.accessToken || save.isPending}
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
                disabled={!auth.accessToken || save.isPending}
              />
            </div>
          </div>

          {error ? (
            <p className="text-sm text-lab-danger" role="alert">
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 px-0 pb-0 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={save.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!auth.accessToken || save.isPending || !value.trim()}
            >
              {save.isPending ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden />
              ) : (
                <Pencil className="mr-1.5 size-3.5" aria-hidden />
              )}
              {isEdit ? "Update result" : "Save result"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ManualResultEntryButton({
  accessionNumber,
  testCode,
  testName,
  resultComponentCode,
  resultComponentName,
  existingResult,
}: {
  accessionNumber: string;
  testCode: string;
  testName: string;
  resultComponentCode?: string;
  resultComponentName?: string;
  existingResult?: {
    value: string;
    units?: string | null;
    flag?: string;
    referenceLow?: number | null;
    referenceHigh?: number | null;
  };
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 text-xs"
        onClick={() => setOpen(true)}
      >
        {existingResult ? "Edit result" : "Enter result"}
      </Button>
      <ManualResultEntryDialog
        key={`${open}-${existingResult?.value ?? ""}`}
        accessionNumber={accessionNumber}
        testCode={testCode}
        testName={testName}
        resultComponentCode={resultComponentCode}
        resultComponentName={resultComponentName}
        open={open}
        onOpenChange={setOpen}
        initialValue={existingResult?.value}
        initialUnits={existingResult?.units}
        initialFlag={existingResult?.flag}
        initialReferenceLow={existingResult?.referenceLow}
        initialReferenceHigh={existingResult?.referenceHigh}
      />
    </>
  );
}
