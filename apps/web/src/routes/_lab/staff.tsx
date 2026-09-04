import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  EditStaffFormSchema,
  type EditStaffFormValues,
} from "@drax-lis/contracts";
import type { StaffJobTitle, StaffMember, StaffRole } from "@drax-lis/contracts";
import { api } from "../../lib/api";
import { isAdmin, useAuth } from "../../lib/auth";
import { PLACEHOLDER_STAFF } from "../../lib/placeholder-staff";
import { RegisterStaffDialog } from "../../components/staff/register-staff-dialog";
import {
  StaffJobTitleBadge,
  StaffRoleBadge,
} from "../../components/staff/staff-badges";
import {
  JOB_TITLE_LABELS,
  JOB_TITLE_OPTIONS,
  ROLE_LABELS,
  ROLE_OPTIONS,
} from "../../components/staff/staff-labels";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Select } from "../../components/ui/select";
import { FormErrorSummary, FormField } from "../../components/forms/form-field";
import { cn } from "../../lib/utils";

export const Route = createFileRoute("/_lab/staff")({
  component: StaffPage,
});

function StaffPage() {
  const auth = useAuth();
  const qc = useQueryClient();
  const [registerOpen, setRegisterOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const staffQ = useQuery({
    queryKey: ["staff"],
    queryFn: () => api.listStaff(),
    enabled: isAdmin(auth.role),
  });

  const toggleActive = useMutation({
    mutationFn: (member: StaffMember) =>
      api.updateStaff(member.id, { isActive: !member.isActive }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["staff"] });
      void qc.invalidateQueries({ queryKey: ["staff-collectors"] });
    },
  });

  if (!auth.ready) {
    return (
      <div className="text-sm text-muted-foreground">Loading account…</div>
    );
  }

  if (!isAdmin(auth.role)) {
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <h2 className="font-display text-2xl font-semibold tracking-tight">
          Staff
        </h2>
        <p className="text-sm text-muted-foreground">
          Staff management is limited to admin accounts.
        </p>
        <Button asChild variant="secondary">
          <Link to="/profile">View profile</Link>
        </Button>
      </div>
    );
  }

  const usingPlaceholder = staffQ.isError;
  const rows = staffQ.data ?? (usingPlaceholder ? PLACEHOLDER_STAFF : []);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Admin
          </p>
          <h2 className="font-display text-2xl font-semibold sm:text-3xl tracking-tight">
            Staff
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Register lab staff with job titles. Use the{" "}
            <strong className="font-medium text-foreground">Permission role</strong>{" "}
            column to assign who can sign off on results: choose{" "}
            <strong className="font-medium text-foreground">Sign-off</strong> for
            sign-off staff, or{" "}
            <strong className="font-medium text-foreground">Admin</strong> for lab
            managers who can release and manage this registry. Phlebotomists and
            lab technologists appear in the Accession collector dropdown.
          </p>
        </div>
        <Button type="button" onClick={() => setRegisterOpen(true)}>
          Add staff
        </Button>
      </div>

      {usingPlaceholder && (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
          Showing sample staff — we could not load the live roster. Try
          refreshing the page or signing in again.
        </p>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Job title</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {staffQ.isLoading && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  Loading staff…
                </td>
              </tr>
            )}
            {!staffQ.isLoading && rows.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  No staff registered yet.
                </td>
              </tr>
            )}
            {rows.map((member) => (
              <StaffRow
                key={member.id}
                member={member}
                readOnly={usingPlaceholder}
                editing={editingId === member.id}
                onEdit={() => setEditingId(member.id)}
                onCancelEdit={() => setEditingId(null)}
                onSaved={() => {
                  setEditingId(null);
                  void qc.invalidateQueries({ queryKey: ["staff"] });
                  void qc.invalidateQueries({ queryKey: ["staff-collectors"] });
                }}
                onToggleActive={() => toggleActive.mutate(member)}
                togglePending={toggleActive.isPending}
              />
            ))}
          </tbody>
        </table>
      </div>

      <RegisterStaffDialog
        open={registerOpen}
        onOpenChange={setRegisterOpen}
      />
    </div>
  );
}

function StaffRow({
  member,
  readOnly = false,
  editing,
  onEdit,
  onCancelEdit,
  onSaved,
  onToggleActive,
  togglePending,
}: {
  member: StaffMember;
  readOnly?: boolean;
  editing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSaved: () => void;
  onToggleActive: () => void;
  togglePending: boolean;
}) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<EditStaffFormValues>({
    resolver: zodResolver(EditStaffFormSchema),
    defaultValues: {
      fullName: member.fullName ?? "",
      role: member.role,
      jobTitle: member.jobTitle ?? "other",
    },
    mode: "onBlur",
    reValidateMode: "onChange",
  });

  const role = watch("role");
  const jobTitle = watch("jobTitle");

  useEffect(() => {
    if (editing) {
      reset({
        fullName: member.fullName ?? "",
        role: member.role,
        jobTitle: member.jobTitle ?? "other",
      });
    }
  }, [editing, member, reset]);

  const saveMutation = useMutation({
    mutationFn: (values: EditStaffFormValues) =>
      api.updateStaff(member.id, EditStaffFormSchema.parse(values)),
    onSuccess: onSaved,
  });

  const serverError =
    saveMutation.error instanceof Error
      ? saveMutation.error.message
      : null;

  if (editing) {
    return (
      <tr className="border-b border-border">
        <td className="px-4 py-3" colSpan={6}>
          <form
            className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-start"
            noValidate
            onSubmit={handleSubmit((values) => saveMutation.mutate(values))}
          >
            <FormField
              label="Full name"
              htmlFor={`staff-name-${member.id}`}
              error={errors.fullName}
              required
            >
              <Input
                id={`staff-name-${member.id}`}
                aria-invalid={Boolean(errors.fullName)}
                {...register("fullName")}
              />
            </FormField>
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
            <div className="flex flex-wrap gap-2 sm:pt-6">
              <Button
                type="submit"
                size="sm"
                disabled={saveMutation.isPending || isSubmitting}
              >
                Save
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={onCancelEdit}
              >
                Cancel
              </Button>
            </div>
            <div className="sm:col-span-4">
              <p className="text-xs text-muted-foreground">{member.email ?? "—"}</p>
              <FormErrorSummary message={serverError} className="mt-2" />
            </div>
          </form>
        </td>
      </tr>
    );
  }

  return (
    <tr
      className={cn(
        "border-b border-border",
        !member.isActive && "opacity-60",
      )}
    >
      <td className="px-4 py-3 font-medium">{member.fullName ?? "—"}</td>
      <td className="px-4 py-3 text-muted-foreground">{member.email ?? "—"}</td>
      <td className="px-4 py-3">
        <StaffRoleBadge role={member.role} />
      </td>
      <td className="px-4 py-3">
        <StaffJobTitleBadge title={member.jobTitle} />
      </td>
      <td className="px-4 py-3">
        <Badge variant={member.isActive ? "default" : "muted"}>
          {member.isActive ? "Active" : "Inactive"}
        </Badge>
      </td>
      <td className="px-4 py-3">
        {readOnly ? (
          <span className="text-xs text-muted-foreground">Demo</span>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={onEdit}>
              Edit
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={togglePending}
              onClick={onToggleActive}
            >
              {member.isActive ? "Deactivate" : "Activate"}
            </Button>
          </div>
        )}
      </td>
    </tr>
  );
}
