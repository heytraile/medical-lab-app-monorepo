import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  AccessionReasonFormSchema,
  type AccessionReasonFormValues,
} from "@drax-lis/contracts";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Textarea } from "./ui/textarea";
import {
  FormCharCount,
  FormField,
} from "./forms/form-field";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  showReason?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  pending?: boolean;
  onConfirm: (reason?: string) => void;
};

export function ConfirmAccessionActionDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  showReason = false,
  reasonLabel = "Reason (optional)",
  reasonPlaceholder = "Why is this being sent back?",
  pending = false,
  onConfirm,
}: Props) {
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<AccessionReasonFormValues>({
    resolver: zodResolver(AccessionReasonFormSchema),
    defaultValues: { reason: "" },
    mode: "onBlur",
    reValidateMode: "onChange",
  });

  const reason = watch("reason");

  useEffect(() => {
    if (!open) reset({ reason: "" });
  }, [open, reset]);

  function submit(values: AccessionReasonFormValues) {
    const parsed = AccessionReasonFormSchema.parse(values);
    onConfirm(parsed.reason || undefined);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4 px-5 pb-5"
          noValidate
          onSubmit={handleSubmit(submit)}
        >
          {showReason ? (
            <FormField
              label={reasonLabel}
              htmlFor="accession-action-reason"
              error={errors.reason}
            >
              <Textarea
                id="accession-action-reason"
                placeholder={reasonPlaceholder}
                rows={3}
                maxLength={2000}
                aria-invalid={Boolean(errors.reason)}
                {...register("reason")}
              />
              <FormCharCount value={reason} max={2000} />
            </FormField>
          ) : null}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-lab-danger text-white hover:bg-lab-danger/90"
              disabled={pending}
            >
              {pending ? "Working…" : confirmLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
