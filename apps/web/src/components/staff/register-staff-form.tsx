import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { StaffJobTitle, StaffRole } from "@drax-lis/contracts";
import { ApiError, api } from "../../lib/api";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select } from "../ui/select";
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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<StaffRole>("tech");
  const [jobTitle, setJobTitle] = useState<StaffJobTitle>("phlebotomist");

  const mutation = useMutation({
    mutationFn: () =>
      api.createStaff({
        email: email.trim(),
        password,
        fullName: fullName.trim(),
        role,
        jobTitle,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["staff"] });
      void qc.invalidateQueries({ queryKey: ["staff-collectors"] });
      onSuccess?.();
    },
  });

  const error =
    mutation.error instanceof ApiError
      ? mutation.error.message
      : mutation.error instanceof Error
        ? mutation.error.message
        : null;

  return (
    <form
      className="space-y-4 px-5 py-4"
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate();
      }}
    >
      <p className="text-sm text-muted-foreground">
        Creates a lab login with a job title for accessioning and bench
        workflows. Share the temporary password securely.
      </p>
      <label className="block space-y-1">
        <span className="text-xs font-medium">Full name</span>
        <Input
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
          autoComplete="name"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-medium">Email</span>
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="off"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-medium">Temporary password</span>
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-xs font-medium">Permission role</span>
          <Select
            value={role}
            onValueChange={(v) => setRole(v as StaffRole)}
            aria-label="Permission role"
            options={ROLE_OPTIONS.map((r) => ({
              value: r,
              label: ROLE_LABELS[r],
            }))}
          />
          <p className="text-xs text-muted-foreground">
            Authorizer and Admin can release results. Only Admin can manage this
            staff registry.
          </p>
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium">Job title</span>
          <Select
            value={jobTitle}
            onValueChange={(v) => setJobTitle(v as StaffJobTitle)}
            aria-label="Job title"
            options={JOB_TITLE_OPTIONS.map((t) => ({
              value: t,
              label: JOB_TITLE_LABELS[t],
            }))}
          />
        </label>
      </div>
      {error && <p className="text-sm text-lab-danger">{error}</p>}
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "Creating…" : "Add staff"}
        </Button>
      </div>
    </form>
  );
}
