import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { RegisterPatientForm } from "./register-patient-form";

export function RegisterPatientDialog({
  open,
  onOpenChange,
  nameSeed,
  onRegistered,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nameSeed?: string;
  onRegistered?: (patientId: string) => void;
}) {
  const initial = (() => {
    if (!nameSeed?.trim()) return undefined;
    const parts = nameSeed.trim().split(/\s+/).filter(Boolean);
    return {
      firstName: parts[0] ?? "",
      lastName: parts.length >= 2 ? parts.slice(1).join(" ") : "",
    };
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0">
        <DialogHeader>
          <DialogTitle>Register patient</DialogTitle>
          <DialogDescription>
            Add a new patient before accessioning a specimen.
          </DialogDescription>
        </DialogHeader>
        <RegisterPatientForm
          initial={initial}
          onSuccess={(id) => {
            onRegistered?.(id);
            onOpenChange(false);
          }}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
