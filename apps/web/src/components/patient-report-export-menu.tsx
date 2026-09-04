import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronDown,
  Download,
  FileJson,
  FileText,
  Loader2,
  Mail,
} from "lucide-react";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import {
  assertReportHasResults,
  downloadPatientReportJson,
  downloadPatientReportPdf,
  PatientReportExportError,
} from "../lib/reports/export-patient-report";
import type { ReportEmailRecipientType, ReportPageSize } from "@drax-lis/contracts";
import {
  EmailPatientReportFormSchema,
  type EmailPatientReportFormValues,
} from "@drax-lis/contracts";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { FormField } from "./forms/form-field";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./ui/popover";
import { cn } from "../lib/utils";

type Props = {
  patientId: string;
  patientLabel?: string;
  /** When false, hide export (e.g. bench has no released results for this patient). */
  releaseEligible?: boolean;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "icon";
  className?: string;
};

export function PatientReportExportMenu({
  patientId,
  patientLabel,
  releaseEligible = true,
  variant = "outline",
  size = "sm",
  className,
}: Props) {
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState<ReportPageSize | "json" | "email" | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [emailRecipientType, setEmailRecipientType] =
    useState<ReportEmailRecipientType | null>(null);

  const emailForm = useForm<EmailPatientReportFormValues>({
    resolver: zodResolver(EmailPatientReportFormSchema),
    defaultValues: { to: "" },
    mode: "onBlur",
    reValidateMode: "onChange",
  });

  useEffect(() => {
    emailForm.reset({ to: "" });
  }, [emailRecipientType, emailForm]);

  const signedIn = Boolean(auth.accessToken);

  // Gates visibility of the export controls: they should only ever appear
  // once an authorizer has released at least one result for this patient.
  // Reuses the same cloud report endpoint the export itself calls, so
  // there's a single source of truth for "released" rather than a second
  // edge-side notion that could drift.
  const reportSummaryQ = useQuery({
    queryKey: ["patient-report-summary", patientId],
    queryFn: () => api.patientReport(patientId),
    enabled: signedIn && releaseEligible && Boolean(patientId),
    staleTime: 15_000,
    retry: false,
  });
  const hasReleasedResults = (reportSummaryQ.data?.summary.resultCount ?? 0) > 0;

  async function runExport(mode: ReportPageSize | "json") {
    if (!signedIn) return;
    setError(null);
    setLoading(mode);
    try {
      const payload = await api.patientReport(patientId);
      assertReportHasResults(payload);
      if (mode === "json") {
        downloadPatientReportJson(payload);
      } else {
        await downloadPatientReportPdf(payload, mode);
      }
      setOpen(false);
    } catch (err) {
      if (err instanceof PatientReportExportError) {
        setError(err.message);
      } else if (err instanceof ApiError && err.status === 404) {
        setError(
          "We could not find this patient yet. Make sure you are signed in and the specimen has been registered.",
        );
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Export failed. Try again.");
      }
    } finally {
      setLoading(null);
    }
  }

  async function runEmail(values: EmailPatientReportFormValues) {
    if (!signedIn || !emailRecipientType) return;
    setError(null);
    setLoading("email");
    try {
      const parsed = EmailPatientReportFormSchema.parse(values);
      const payload = await api.patientReport(patientId);
      assertReportHasResults(payload);
      await api.emailPatientReport(patientId, {
        to: parsed.to,
        recipientType: emailRecipientType,
      });
      setOpen(false);
      setEmailRecipientType(null);
      emailForm.reset({ to: "" });
    } catch (err) {
      if (err instanceof PatientReportExportError) {
        setError(err.message);
      } else if (err instanceof ApiError && err.status === 404) {
        setError(
          "We could not find this patient yet. Make sure the specimen has been registered.",
        );
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Email failed. Try again.");
      }
    } finally {
      setLoading(null);
    }
  }

  if (!signedIn) {
    return (
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        disabled
        title="Sign in to export released patient reports"
      >
        <Download className="size-4 shrink-0" />
        {size !== "icon" ? (
          <span className="ml-1.5">Export report</span>
        ) : null}
      </Button>
    );
  }

  // While we don't yet know the release status, or we know there's nothing
  // released, keep the export options out of view entirely — not just
  // disabled — rather than showing a control that will only error on click.
  if (
    !releaseEligible ||
    reportSummaryQ.isLoading ||
    !hasReleasedResults
  ) {
    return null;
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setEmailRecipientType(null);
          emailForm.reset({ to: "" });
          setError(null);
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant={variant}
          size={size}
          className={cn("gap-1", className)}
          aria-label={
            patientLabel
              ? `Export report for ${patientLabel}`
              : "Export patient report"
          }
        >
          {loading ? (
            <Loader2 className="size-4 shrink-0 animate-spin" />
          ) : (
            <Download className="size-4 shrink-0" />
          )}
          {size !== "icon" ? (
            <>
              <span>Export report</span>
              <ChevronDown className="size-3.5 opacity-60" />
            </>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-1">
        <p className="px-2.5 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Released results only
        </p>
        <ExportOption
          icon={FileText}
          label="PDF — Letter (8.5×11)"
          busy={loading === "letter"}
          disabled={loading !== null}
          onClick={() => void runExport("letter")}
        />
        <ExportOption
          icon={FileText}
          label="PDF — Legal (8.5×14)"
          busy={loading === "legal"}
          disabled={loading !== null}
          onClick={() => void runExport("legal")}
        />
        <ExportOption
          icon={FileJson}
          label="Download data file"
          busy={loading === "json"}
          disabled={loading !== null}
          onClick={() => void runExport("json")}
        />
        <ExportOption
          icon={Mail}
          label="Email to doctor"
          busy={loading === "email" && emailRecipientType === "doctor"}
          disabled={loading !== null}
          onClick={() => {
            setEmailRecipientType("doctor");
            emailForm.reset({ to: "" });
            setError(null);
          }}
        />
        <ExportOption
          icon={Mail}
          label="Email to patient"
          busy={loading === "email" && emailRecipientType === "patient"}
          disabled={loading !== null}
          onClick={() => {
            setEmailRecipientType("patient");
            emailForm.reset({ to: "" });
            setError(null);
          }}
        />
        {emailRecipientType ? (
          <form
            className="mx-2 mb-2 space-y-2 border-t border-border pt-2"
            noValidate
            onSubmit={emailForm.handleSubmit((values) => void runEmail(values))}
          >
            <FormField
              label={
                emailRecipientType === "doctor"
                  ? "Doctor's email"
                  : "Patient's email"
              }
              htmlFor="report-email-to"
              error={emailForm.formState.errors.to}
              className="[&_span:first-child]:text-[10px] [&_span:first-child]:uppercase [&_span:first-child]:tracking-wider [&_span:first-child]:text-muted-foreground [&_p]:text-[11px]"
            >
              <Input
                id="report-email-to"
                type="email"
                placeholder={
                  emailRecipientType === "doctor"
                    ? "doctor@example.com"
                    : "patient@example.com"
                }
                className="h-8 text-sm"
                disabled={loading !== null}
                aria-invalid={Boolean(emailForm.formState.errors.to)}
                {...emailForm.register("to")}
              />
            </FormField>
            <p className="text-[10px] text-muted-foreground">
              This email will show you as{" "}
              <span className="font-medium text-foreground">
                {auth.displayName}
              </span>
              .
            </p>
            <Button
              type="submit"
              size="sm"
              className="w-full"
              disabled={loading !== null}
            >
              {loading === "email" ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden />
              ) : (
                <Mail className="mr-1.5 size-3.5" aria-hidden />
              )}
              Send report
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full"
              disabled={loading !== null}
              onClick={() => {
                setEmailRecipientType(null);
                emailForm.reset({ to: "" });
              }}
            >
              Cancel
            </Button>
            <p className="text-[10px] text-muted-foreground">
              Local dev: view in Mailpit at port 54324. Production uses Resend.
            </p>
          </form>
        ) : null}
        {error ? (
          <p className="mx-2 mb-2 mt-1 rounded-md bg-lab-danger/10 px-2 py-1.5 text-xs text-lab-danger">
            {error}
          </p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function ExportOption({
  icon: Icon,
  label,
  busy,
  disabled,
  onClick,
}: {
  icon: typeof FileText;
  label: string;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-muted/80 disabled:opacity-50"
      disabled={disabled}
      onClick={onClick}
    >
      {busy ? (
        <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
      ) : (
        <Icon className="size-4 shrink-0 text-muted-foreground" />
      )}
      {label}
    </button>
  );
}
