import type { FieldError } from "react-hook-form";
import { cn } from "../../lib/utils";

export function fieldErrorMessage(error: FieldError | undefined): string | null {
  return error?.message ?? null;
}

type FormFieldProps = {
  label: string;
  htmlFor?: string;
  description?: string;
  error?: FieldError;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
};

export function FormField({
  label,
  htmlFor,
  description,
  error,
  required,
  className,
  children,
}: FormFieldProps) {
  const message = fieldErrorMessage(error);

  return (
    <label className={cn("block space-y-1.5", className)} htmlFor={htmlFor}>
      <span className="text-xs font-medium text-foreground">
        {label}
        {required ? (
          <span className="text-lab-danger" aria-hidden>
            {" "}
            *
          </span>
        ) : null}
      </span>
      {children}
      {description ? (
        <p className="text-xs text-muted-foreground">{description}</p>
      ) : null}
      {message ? (
        <p
          className="text-xs text-lab-danger motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-0.5"
          role="alert"
        >
          {message}
        </p>
      ) : null}
    </label>
  );
}

export function FormErrorSummary({
  message,
  className,
}: {
  message: string | null;
  className?: string;
}) {
  if (!message) return null;

  return (
    <p
      className={cn(
        "rounded-md border border-lab-danger/30 bg-lab-danger/5 px-3 py-2 text-sm text-lab-danger",
        className,
      )}
      role="alert"
    >
      {message}
    </p>
  );
}

export function FormCharCount({
  value,
  max,
  className,
}: {
  value: string;
  max: number;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "text-right text-[11px] tabular-nums text-muted-foreground",
        value.length > max * 0.9 && "text-amber-700 dark:text-amber-300",
        value.length >= max && "text-lab-danger",
        className,
      )}
      aria-live="polite"
    >
      {value.length}/{max}
    </p>
  );
}
