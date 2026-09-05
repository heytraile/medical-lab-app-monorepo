import { useMutation } from "@tanstack/react-query";
import type { StaffMember } from "@drax-lis/contracts";
import { ApiError, api } from "../../lib/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { FormErrorSummary } from "../forms/form-field";

/**
 * Edge admin action: generate a one-time code so this admin/authorizer can
 * sign into the cloud app on a specific browser. See docs/EDGE_AUTH_AND_STAFF.md.
 */
export function IssueDeviceCodeDialog({
  open,
  onOpenChange,
  staff,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staff: StaffMember | null;
}) {
  const mutation = useMutation({
    mutationFn: (assignToStaffId: string) =>
      api.issueDeviceCode({ assignToStaffId }),
  });

  const serverError =
    mutation.error instanceof ApiError
      ? mutation.error.message
      : mutation.error instanceof Error
        ? mutation.error.message
        : null;

  function handleOpenChange(next: boolean) {
    if (!next) mutation.reset();
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Issue cloud device</DialogTitle>
          <DialogDescription>
            {staff
              ? `One-time code for ${staff.fullName ?? staff.email ?? "this staff member"} to enroll a browser for cloud login. Expires in 10 minutes and can only be used once.`
              : "Select an admin or authorizer first."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-5 py-4">
          {mutation.data ? (
            <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-4 text-center">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                Enrollment code
              </p>
              <p className="font-mono text-3xl font-semibold tracking-widest">
                {mutation.data.code}
              </p>
              <p className="text-xs text-muted-foreground">
                Expires {new Date(mutation.data.expiresAt).toLocaleTimeString()}
                . Have them enter this on the cloud sign-in screen.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              This generates a fresh 8-character code. Read it aloud or write
              it down — it won't be shown again.
            </p>
          )}
          <FormErrorSummary message={serverError} />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => handleOpenChange(false)}
            >
              Close
            </Button>
            {staff && (
              <Button
                type="button"
                disabled={mutation.isPending}
                onClick={() => mutation.mutate(staff.id)}
              >
                {mutation.isPending
                  ? "Generating…"
                  : mutation.data
                    ? "Generate new code"
                    : "Generate code"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
