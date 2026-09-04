import { useForm } from "react-hook-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  RegisterStaffFormSchema,
  type RegisterStaffFormValues,
} from "@drax-lis/contracts";
import type { StaffJobTitle, StaffRole } from "@drax-lis/contracts";
import { ApiError, api } from "../../lib/api";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select } from "../ui/select";
import {
  FormErrorSummary,
  FormField,
} from "../forms/form-field";
import {
  JOB_TITLE_LABELS,
  JOB_TITLE_OPTIONS,
  ROLE_LABELS,
  ROLE_OPTIONS,
} from "./staff-labels";

export function RegisterStaffForm({
  onSuccess,
  onCancel,
}: {
  onSuccess?: () => void;
  onCancel?: () => void;
}) {
  const qc = useQueryClient();
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<RegisterStaffFormValues>({
    resolver: zodResolver(RegisterStaffFormSchema),
    defaultValues: {
      email: "",
      password: "",
      fullName: "",
      role: "tech",
      jobTitle: "phlebotomist",
    },
    mode: "onBlur",
    reValidateMode: "onChange",
  });

  const role = watch("role");
  const jobTitle = watch("jobTitle");

  const mutation = useMutation({
    mutationFn: (values: RegisterStaffFormValues) =>
      api.createStaff(RegisterStaffFormSchema.parse(values)),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["staff"] });
      void qc.invalidateQueries({ queryKey: ["staff-collectors"] });
      onSuccess?.();
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
        Creates a lab login with a job title for accessioning and bench
        workflows. Share the temporary password securely.
      </p>
      <FormField
        label="Full name"
        htmlFor="staff-full-name"
        error={errors.fullName}
        required
      >
        <Input
          id="staff-full-name"
          autoComplete="name"
          aria-invalid={Boolean(errors.fullName)}
          {...register("fullName")}
        />
      </FormField>
      <FormField
        label="Email"
        htmlFor="staff-email"
        error={errors.email}
        required
      >
        <Input
          id="staff-email"
          type="email"
          autoComplete="off"
          aria-invalid={Boolean(errors.email)}
          {...register("email")}
        />
      </FormField>
      <FormField
        label="Temporary password"
        htmlFor="staff-password"
        error={errors.password}
        description="At least 8 characters."
        required
      >
        <Input
          id="staff-password"
          type="password"
          autoComplete="new-password"
          aria-invalid={Boolean(errors.password)}
          {...register("password")}
        />
      </FormField>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Permission role" error={errors.role} required>
          <Select
            value={role}
            onValueChange={(v) =>
              setValue("role", v as StaffRole, {
                shouldValidate: true,
                shouldDirty: true,
              })
            }
            aria-label="Permission role"
            options={ROLE_OPTIONS.map((r) => ({
              value: r,
              label: ROLE_LABELS[r],
            }))}
          />
          <p className="text-xs text-muted-foreground">
            Sign-off staff and Admin can release results. Only Admin can manage
            this staff registry.
          </p>
        </FormField>
        <FormField label="Job title" error={errors.jobTitle} required>
          <Select
            value={jobTitle}
            onValueChange={(v) =>
              setValue("jobTitle", v as StaffJobTitle, {
                shouldValidate: true,
                shouldDirty: true,
              })
            }
            aria-label="Job title"
            options={JOB_TITLE_OPTIONS.map((t) => ({
              value: t,
              label: JOB_TITLE_LABELS[t],
            }))}
          />
        </FormField>
      </div>
      <FormErrorSummary message={serverError} />
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={isSubmitting || mutation.isPending}>
          {mutation.isPending ? "Creating…" : "Add staff"}
        </Button>
      </div>
    </form>
  );
}
