import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError, api } from "../../lib/api";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select } from "../ui/select";

export type RegisterPatientFormState = {
  firstName: string;
  middleName: string;
  lastName: string;
  dateOfBirth: string;
  sex: "" | "M" | "F" | "O" | "U";
};

export const emptyRegisterPatientForm = (): RegisterPatientFormState => ({
  firstName: "",
  middleName: "",
  lastName: "",
  dateOfBirth: "",
  sex: "",
});

export function RegisterPatientForm({
  initial,
  onSuccess,
  onCancel,
  submitLabel = "Register patient",
}: {
  initial?: Partial<RegisterPatientFormState>;
  onSuccess?: (patientId: string) => void;
  onCancel?: () => void;
  submitLabel?: string;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<RegisterPatientFormState>({
    ...emptyRegisterPatientForm(),
    ...initial,
  });

  const mutation = useMutation({
    mutationFn: () =>
      api.createPatient({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        middleName: form.middleName.trim() || undefined,
        dateOfBirth: form.dateOfBirth.trim() || undefined,
        sex: form.sex || undefined,
      }),
    onSuccess: (patient) => {
      void qc.invalidateQueries({ queryKey: ["patients-all"] });
      void qc.invalidateQueries({ queryKey: ["patients"] });
      void qc.invalidateQueries({ queryKey: ["syncStatus"] });
      onSuccess?.(patient.id);
    },
  });

  return (
    <form
      className="space-y-4 px-5 py-4"
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate();
      }}
    >
      <p className="text-sm text-muted-foreground">
        Creates a local TEMP MRN for accessioning. Syncs upstream when the
        registry link is online.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-xs font-medium">First name</span>
          <Input
            value={form.firstName}
            onChange={(e) =>
              setForm((f) => ({ ...f, firstName: e.target.value }))
            }
            required
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium">Middle name</span>
          <Input
            value={form.middleName}
            onChange={(e) =>
              setForm((f) => ({ ...f, middleName: e.target.value }))
            }
          />
        </label>
        <label className="block space-y-1 sm:col-span-2">
          <span className="text-xs font-medium">Last name</span>
          <Input
            value={form.lastName}
            onChange={(e) =>
              setForm((f) => ({ ...f, lastName: e.target.value }))
            }
            required
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium">Date of birth</span>
          <Input
            type="date"
            value={form.dateOfBirth}
            onChange={(e) =>
              setForm((f) => ({ ...f, dateOfBirth: e.target.value }))
            }
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium">Sex</span>
          <Select
            value={form.sex}
            onValueChange={(v) =>
              setForm((f) => ({
                ...f,
                sex: v as RegisterPatientFormState["sex"],
              }))
            }
            placeholder="—"
            aria-label="Sex"
            options={[
              { value: "", label: "—" },
              { value: "F", label: "F" },
              { value: "M", label: "M" },
              { value: "O", label: "O" },
              { value: "U", label: "U" },
            ]}
          />
        </label>
      </div>

      {mutation.isError && (
        <p className="text-sm text-lab-danger">
          {mutation.error instanceof ApiError
            ? mutation.error.message
            : "Could not register patient"}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          disabled={
            mutation.isPending ||
            !form.firstName.trim() ||
            !form.lastName.trim()
          }
        >
          {mutation.isPending ? "Registering…" : submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
