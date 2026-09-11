import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, PenLine, Pencil, Trash2 } from "lucide-react";
import {
  composeManualResultValue,
  computeAutoFlag,
  getManualEntrySchema,
  parseManualPayload,
  schemaDefaultUnits,
  schemaReferenceRange,
  type ManualEntryField,
  type ManualEntrySchema,
} from "@drax-lis/catalog";
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
import { manualEntryButtonLabel } from "../lib/manual-entry-label";
import { useIsCompactChrome } from "../lib/use-media-query";
import { cn } from "../lib/utils";

const nativeSelectClassName =
  "flex h-9 w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

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

function emptyFieldValues(schema: ManualEntrySchema): Record<string, string> {
  return Object.fromEntries(schema.fields.map((field) => [field.id, ""]));
}

function SchemaField({
  field,
  value,
  onChange,
  disabled,
  useNativeSelect,
}: {
  field: ManualEntryField;
  value: string;
  onChange: (next: string) => void;
  disabled: boolean;
  useNativeSelect: boolean;
}) {
  if (field.type === "select") {
    if (useNativeSelect) {
      return (
        <select
          id={`manual-${field.id}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={nativeSelectClassName}
        >
          <option value="">{`Select ${field.label.toLowerCase()}…`}</option>
          {(field.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
    }

    return (
      <Select
        id={`manual-${field.id}`}
        value={value}
        onValueChange={onChange}
        options={[
          { value: "", label: `Select ${field.label.toLowerCase()}…` },
          ...(field.options ?? []),
        ]}
        disabled={disabled}
        inModal
      />
    );
  }

  if (field.type === "textarea") {
    return (
      <textarea
        id={`manual-${field.id}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
        disabled={disabled}
        rows={3}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
      />
    );
  }

  return (
    <Input
      id={`manual-${field.id}`}
      type={field.type === "number" ? "number" : "text"}
      step={field.type === "number" ? "any" : undefined}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.placeholder}
      disabled={disabled}
    />
  );
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
  initialManualPayloadJson,
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
  initialManualPayloadJson?: string | Record<string, string> | null;
}) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const useNativeSelect = useIsCompactChrome();
  const schema = useMemo(
    () => getManualEntrySchema(testCode, resultComponentCode),
    [testCode, resultComponentCode],
  );

  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
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

  useEffect(() => {
    if (!open) return;
    if (schema) {
      const payload = parseManualPayload(initialManualPayloadJson);
      const next = emptyFieldValues(schema);
      for (const field of schema.fields) {
        next[field.id] = payload[field.id] ?? "";
      }
      if (!Object.values(next).some(Boolean) && initialValue?.trim()) {
        const firstField = schema.fields[0];
        if (firstField && schema.fields.length === 1) {
          next[firstField.id] = initialValue.trim();
        }
      }
      setFieldValues(next);
    } else {
      setValue(initialValue ?? "");
      setUnits(initialUnits ?? "");
      setFlag(flagOptionValue(initialFlag));
      setReferenceLow(
        initialReferenceLow != null ? String(initialReferenceLow) : "",
      );
      setReferenceHigh(
        initialReferenceHigh != null ? String(initialReferenceHigh) : "",
      );
    }
    setError(null);
    setClearConfirmOpen(false);
  }, [
    open,
    schema,
    initialValue,
    initialUnits,
    initialFlag,
    initialReferenceLow,
    initialReferenceHigh,
    initialManualPayloadJson,
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
    mutationFn: () => {
      if (schema) {
        const composedValue = composeManualResultValue(schema, fieldValues);
        const numericField = schema.fields.find(
          (field) => field.type === "number",
        );
        const range = schemaReferenceRange(schema);
        const autoFlag =
          numericField && schema.hideFlag
            ? computeAutoFlag(
                fieldValues[numericField.id] ?? "",
                range.referenceLow,
                range.referenceHigh,
              )
            : "unknown";
        return api.enterManualResult({
          accessionNumber,
          orderedTestCode: testCode,
          resultComponentCode,
          testCode,
          value: composedValue,
          units: schemaDefaultUnits(schema),
          flag: autoFlag,
          referenceLow: range.referenceLow,
          referenceHigh: range.referenceHigh,
          manualPayloadJson: fieldValues,
        });
      }

      return api.enterManualResult({
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
      });
    },
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

  const schemaValid = schema
    ? schema.fields
        .filter((field) => field.required)
        .every((field) => fieldValues[field.id]?.trim())
    : Boolean(value.trim());

  const schemaHasContent = schema
    ? schema.fields.some((field) => fieldValues[field.id]?.trim())
    : Boolean(value.trim());

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (schema) {
      const missing = schema.fields.filter(
        (field) => field.required && !fieldValues[field.id]?.trim(),
      );
      if (missing.length > 0) {
        setError(`${missing[0]?.label ?? "A field"} is required`);
        return;
      }
      if (!schemaHasContent) {
        setError("Enter at least one value");
        return;
      }
    } else if (!value.trim()) {
      setError("Value is required");
      return;
    }
    save.mutate();
  }

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

          <form className="space-y-3 px-4 pb-2" onSubmit={handleSubmit}>
            {schema ? (
              <>
                {schema.fields.map((field) => (
                  <div key={field.id} className="space-y-1.5">
                    <label
                      htmlFor={`manual-${field.id}`}
                      className="text-sm font-medium"
                    >
                      {field.label}
                      {field.required ? (
                        <span className="text-lab-danger"> *</span>
                      ) : null}
                      {field.defaultUnits ? (
                        <span className="ml-1 text-xs font-normal text-muted-foreground">
                          ({field.defaultUnits})
                        </span>
                      ) : null}
                    </label>
                    <SchemaField
                      field={field}
                      value={fieldValues[field.id] ?? ""}
                      onChange={(next) =>
                        setFieldValues((current) => ({
                          ...current,
                          [field.id]: next,
                        }))
                      }
                      disabled={!auth.accessToken || busy}
                      useNativeSelect={useNativeSelect}
                    />
                  </div>
                ))}
              </>
            ) : (
              <>
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
                  {useNativeSelect ? (
                    <select
                      id="manual-flag"
                      value={flag}
                      onChange={(e) => setFlag(e.target.value)}
                      disabled={!auth.accessToken || busy}
                      className={nativeSelectClassName}
                    >
                      {FLAG_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Select
                      id="manual-flag"
                      value={flag}
                      onValueChange={setFlag}
                      options={FLAG_OPTIONS}
                      disabled={!auth.accessToken || busy}
                      inModal
                    />
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <label
                      htmlFor="manual-ref-low"
                      className="text-sm font-medium"
                    >
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
                    <label
                      htmlFor="manual-ref-high"
                      className="text-sm font-medium"
                    >
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
              </>
            )}

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
                  disabled={!auth.accessToken || busy || !schemaValid}
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
  siblingManualCount,
}: {
  accessionNumber: string;
  testCode: string;
  testName: string;
  resultComponentCode?: string;
  resultComponentName?: string;
  resultId?: string;
  /** When >1 manual entry button is shown for this ordered test, labels name the component. */
  siblingManualCount?: number;
  existingResult?: {
    value: string;
    units?: string | null;
    flag?: string;
    referenceLow?: number | null;
    referenceHigh?: number | null;
    manualPayloadJson?: string | Record<string, string> | null;
  };
}) {
  const [open, setOpen] = useState(false);
  const isEdit = Boolean(existingResult);
  const actionLabel = manualEntryButtonLabel({
    isEdit,
    resultComponentName,
    resultComponentCode,
    siblingManualCount,
  });
  const useLongLabel = actionLabel !== "Enter result" && actionLabel !== "Edit result";

  return (
    <>
      <Button
        type="button"
        variant={isEdit ? "outline" : "default"}
        size={isEdit ? "sm" : "default"}
        title={actionLabel}
        aria-label={`${actionLabel} for ${testName}`}
        className={cn(
          isEdit
            ? cn(
                "shrink-0 text-xs",
                useLongLabel
                  ? "h-auto min-h-8 max-w-[18rem] whitespace-normal py-1.5 text-left leading-snug"
                  : "h-8",
              )
            : cn(
                "shrink-0 border border-amber-600/40 bg-amber-400 px-4 text-sm font-semibold text-amber-950 shadow-sm hover:bg-amber-300 dark:border-amber-500/50 dark:bg-amber-500 dark:text-amber-950 dark:hover:bg-amber-400",
                useLongLabel
                  ? "h-auto min-h-9 max-w-[18rem] whitespace-normal py-2 text-left leading-snug"
                  : "h-9 min-w-[9.5rem]",
              ),
        )}
        onClick={() => setOpen(true)}
      >
        {isEdit ? (
          <>
            <Pencil className="size-3.5 shrink-0" aria-hidden />
            {actionLabel}
          </>
        ) : (
          <>
            <PenLine className="size-4 shrink-0" aria-hidden />
            {actionLabel}
          </>
        )}
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
          initialManualPayloadJson={existingResult?.manualPayloadJson}
        />
      ) : null}
    </>
  );
}
