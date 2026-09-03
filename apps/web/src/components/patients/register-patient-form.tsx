import { useForm } from "react-hook-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  RegisterPatientFormSchema,
  toCreatePatientRequest,
  type RegisterPatientFormValues,
} from "@drax-lis/contracts";
import { ApiError, api } from "../../lib/api";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select } from "../ui/select";
import {
  FormErrorSummary,
  FormField,
} from "../forms/form-field";

export type RegisterPatientFormState = RegisterPatientFormValues;

export const emptyRegisterPatientForm = (): RegisterPatientFormValues => ({
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
  initial?: Partial<RegisterPatientFormValues>;
  onSuccess?: (patientId: string) => void;
  onCancel?: () => void;
  submitLabel?: string;
}) {
  const qc = useQueryClient();
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<RegisterPatientFormValues>({
    resolver: zodResolver(RegisterPatientFormSchema),
    defaultValues: {
      ...emptyRegisterPatientForm(),
      ...initial,
    },
    mode: "onBlur",
    reValidateMode: "onChange",
  });

  const sex = watch("sex") ?? "";

  const mutation = useMutation({
    mutationFn: (values: RegisterPatientFormValues) => {
      const payload = toCreatePatientRequest(
        RegisterPatientFormSchema.parse(values),
      );
      return api.createPatient(payload);
    },
    onSuccess: (patient) => {
      void qc.invalidateQueries({ queryKey: ["patients-all"] });
      void qc.invalidateQueries({ queryKey: ["patients"] });
      void qc.invalidateQueries({ queryKey: ["syncStatus"] });
      onSuccess?.(patient.id);
    },
  });

  const serverError =
    mutation.error instanceof ApiError
      ? mutation.error.message
      : mutation.error instanceof Error
        ? mutation.error.message
        : null;

  return (
    <form
      className="space-y-4 px-5 py-4"
      noValidate
      onSubmit={handleSubmit((values) => mutation.mutate(values))}
    >
      <p className="text-sm text-muted-foreground">
        Creates a local TEMP MRN for accessioning. Syncs upstream when the
        registry link is online.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField
          label="First name"
          htmlFor="patient-first-name"
          error={errors.firstName}
          required
        >
          <Input
            id="patient-first-name"
            autoComplete="given-name"
            aria-invalid={Boolean(errors.firstName)}
            {...register("firstName")}
          />
        </FormField>
        <FormField
          label="Middle name"
          htmlFor="patient-middle-name"
          error={errors.middleName}
        >
          <Input
            id="patient-middle-name"
            autoComplete="additional-name"
            aria-invalid={Boolean(errors.middleName)}
            {...register("middleName")}
          />
        </FormField>
        <FormField
          label="Last name"
          htmlFor="patient-last-name"
          error={errors.lastName}
          required
          className="sm:col-span-2"
        >
          <Input
            id="patient-last-name"
            autoComplete="family-name"
            aria-invalid={Boolean(errors.lastName)}
            {...register("lastName")}
          />
        </FormField>
        <FormField
          label="Date of birth"
          htmlFor="patient-dob"
          error={errors.dateOfBirth}
          description="Optional. Format YYYY-MM-DD."
        >
          <Input
            id="patient-dob"
            type="date"
            aria-invalid={Boolean(errors.dateOfBirth)}
            {...register("dateOfBirth")}
          />
        </FormField>
        <FormField label="Sex" error={errors.sex}>
          <Select
            value={sex}
            onValueChange={(v) =>
              setValue("sex", v as RegisterPatientFormValues["sex"], {
                shouldValidate: true,
                shouldDirty: true,
              })
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
        </FormField>
      </div>

      <FormErrorSummary message={serverError} />

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={isSubmitting || mutation.isPending}>
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
