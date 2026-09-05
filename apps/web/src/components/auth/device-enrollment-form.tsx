import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api, ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { FormErrorSummary, FormField } from "../forms/form-field";

/**
 * Shown once per browser after a cloud sign-in when no lab-issued device
 * token is stored yet. The code comes from an edge admin ("Issue cloud
 * device" on the lab PC) — see docs/EDGE_AUTH_AND_STAFF.md.
 */
export function DeviceEnrollmentForm({ onDone }: { onDone: () => void }) {
  const auth = useAuth();
  const [code, setCode] = useState("");
  const [deviceName, setDeviceName] = useState(() =>
    typeof navigator !== "undefined" ? "This computer" : "This device",
  );

  const mutation = useMutation({
    mutationFn: () =>
      api.enrollDevice({ code: code.trim().toUpperCase(), deviceName: deviceName.trim() }),
    onSuccess: async (result) => {
      await auth.completeDeviceEnrollment(result);
      onDone();
    },
  });

  const serverError =
    mutation.error instanceof ApiError
      ? (mutation.error.body as { message?: string } | null)?.message ??
        mutation.error.message
      : mutation.error instanceof Error
        ? mutation.error.message
        : null;

  return (
    <form
      className="space-y-3 rounded-xl border border-border bg-card p-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate();
      }}
    >
      <p className="text-sm text-muted-foreground">
        This browser isn't enrolled yet. Ask a lab admin to generate a code on
        the lab PC (Staff → Issue cloud device), then enter it below. You'll
        only need to do this once.
      </p>
      <FormField label="Lab enrollment code" htmlFor="device-code" required>
        <Input
          id="device-code"
          autoComplete="off"
          autoCapitalize="characters"
          placeholder="e.g. 7K9M2QRT"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
      </FormField>
      <FormField label="Name this device" htmlFor="device-name" required>
        <Input
          id="device-name"
          value={deviceName}
          onChange={(e) => setDeviceName(e.target.value)}
        />
      </FormField>
      <FormErrorSummary message={serverError} />
      <Button
        type="submit"
        className="w-full"
        disabled={mutation.isPending || !code.trim() || !deviceName.trim()}
      >
        {mutation.isPending ? "Enrolling…" : "Enroll this device"}
      </Button>
    </form>
  );
}
