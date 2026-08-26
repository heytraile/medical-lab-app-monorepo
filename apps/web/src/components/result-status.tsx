import {
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  CheckCircle2,
  Clock,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "./ui/badge";
import { cn } from "../lib/utils";

type BadgeVariant = "default" | "ok" | "warn" | "danger" | "muted";

type FlagVisual = {
  variant: BadgeVariant;
  icon: LucideIcon;
  label: string;
};

function flagVisual(flag: string | null | undefined): FlagVisual {
  const raw = (flag ?? "unknown").trim() || "unknown";
  switch (raw) {
    case "critical_high":
      return { variant: "danger", icon: AlertTriangle, label: "Critical high" };
    case "critical_low":
      return { variant: "danger", icon: AlertTriangle, label: "Critical low" };
    case "high":
      return { variant: "danger", icon: ArrowUp, label: "High" };
    case "low":
      return { variant: "warn", icon: ArrowDown, label: "Low" };
    case "abnormal":
      return { variant: "warn", icon: AlertCircle, label: "Abnormal" };
    case "normal":
      return { variant: "ok", icon: Check, label: "Normal" };
    default:
      return { variant: "muted", icon: AlertCircle, label: raw };
  }
}

type StatusVisual = {
  variant: BadgeVariant;
  icon: LucideIcon;
  label: string;
};

function statusVisual(status: string | null | undefined): StatusVisual {
  const raw = (status ?? "pending_review").trim() || "pending_review";
  switch (raw) {
    case "pending_review":
      return { variant: "warn", icon: Clock, label: "Pending review" };
    case "released":
      return { variant: "ok", icon: CheckCircle2, label: "Released" };
    case "quarantined":
    case "blocked":
      return { variant: "danger", icon: ShieldAlert, label: raw === "blocked" ? "Blocked" : "Quarantined" };
    default:
      return {
        variant: "muted",
        icon: Clock,
        label: raw.replaceAll("_", " "),
      };
  }
}

export function isAlarmFlag(flag: string | null | undefined): boolean {
  return (
    flag === "critical_high" ||
    flag === "critical_low" ||
    flag === "high"
  );
}

function isCriticalFlag(flag: string | null | undefined): boolean {
  return flag === "critical_high" || flag === "critical_low";
}

/** Value color — alarm rows sit on solid red, so values go white. */
export function flagValueClass(flag: string | null | undefined): string {
  switch (flag) {
    case "critical_high":
    case "critical_low":
    case "high":
      return "font-bold tabular-nums text-white";
    case "low":
    case "abnormal":
      return "font-medium text-amber-800 dark:text-amber-300";
    case "normal":
      return "text-emerald-700 dark:text-emerald-300";
    default:
      return "text-muted-foreground";
  }
}

/**
 * Solid stop-sign red for high / critical — no pink wash.
 * Uses ! so table hover/selection cannot dilute it.
 */
export function flagRowClass(flag: string | null | undefined): string {
  switch (flag) {
    case "critical_high":
    case "critical_low":
    case "high":
      return cn(
        "!bg-lab-alarm text-white hover:!bg-[#c00500]",
        "[&_.text-muted-foreground]:!text-white/80",
        "[&_.text-foreground]:!text-white",
        "[&_a]:!text-white",
      );
    case "low":
    case "abnormal":
      return "border-l-2 border-l-amber-500 bg-amber-500/[0.04]";
    case "normal":
      return "border-l-2 border-l-transparent";
    default:
      return "border-l-2 border-l-transparent";
  }
}

export function FlagChip({
  flag,
  className,
}: {
  flag: string | null | undefined;
  className?: string;
}) {
  const { variant, icon: Icon, label } = flagVisual(flag);
  const alarm = isAlarmFlag(flag);
  const critical = isCriticalFlag(flag);
  return (
    <Badge
      variant={variant}
      className={cn(
        "gap-1",
        alarm
          ? "border border-white/40 !bg-white font-bold tracking-wide !text-lab-alarm shadow-none [&_svg]:opacity-100"
          : "font-normal",
        critical && "ring-2 ring-white/70",
        className,
      )}
      title={alarm ? `${label} — alert now` : label}
    >
      <Icon className="size-3 shrink-0 opacity-80" aria-hidden />
      <span className="capitalize">{label}</span>
    </Badge>
  );
}

export function WorkflowStatusChip({
  status,
  className,
  onAlarm = false,
}: {
  status: string | null | undefined;
  className?: string;
  /** Solid highlighter yellow so the chip pops on stop-sign red rows. */
  onAlarm?: boolean;
}) {
  const { variant, icon: Icon, label } = statusVisual(status);
  return (
    <Badge
      variant={variant}
      className={cn(
        "gap-1",
        onAlarm
          ? "border border-[#f5d000] !bg-[#ffe600] font-bold tracking-wide !text-[#1a1200] shadow-sm shadow-black/25 [&_svg]:opacity-100"
          : "font-normal",
        className,
      )}
      title={label}
    >
      <Icon className="size-3 shrink-0 opacity-80" aria-hidden />
      <span className="capitalize">{label}</span>
    </Badge>
  );
}
