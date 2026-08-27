import {
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  CheckCircle2,
  CircleAlert,
  Clock,
  ShieldAlert,
  TriangleAlert,
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

/** Human-readable flag name, for labels and announcements. */
export function flagLabel(flag: string | null | undefined): string {
  return flagVisual(flag).label;
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

/**
 * Orders flags worst-first so a collapsed group can advertise the most severe
 * result it is hiding. Higher wins. Keep flag knowledge in this module only.
 */
export function flagSeverity(flag: string | null | undefined): number {
  switch (flag) {
    case "critical_high":
    case "critical_low":
      return 4;
    case "high":
      return 3;
    case "low":
    case "abnormal":
      return 2;
    case "normal":
      return 1;
    default:
      return 0;
  }
}

/** Worst flag across a set of results — what a collapsed group must surface. */
export function worstFlag(
  flags: Array<string | null | undefined>,
): string | undefined {
  let worst: string | undefined;
  for (const flag of flags) {
    if (worst === undefined || flagSeverity(flag) > flagSeverity(worst)) {
      worst = flag ?? undefined;
    }
  }
  return worst;
}

/** Value color — the number itself carries the alarm, not the row. */
export function flagValueClass(flag: string | null | undefined): string {
  switch (flag) {
    case "critical_high":
    case "critical_low":
    case "high":
      return "font-bold tabular-nums text-lab-alarm";
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
 * A red edge bar and a faint wash, never a solid red row — a filled AlarmSign
 * plus the red value carry the urgency without drowning the table.
 */
export function flagRowClass(flag: string | null | undefined): string {
  switch (flag) {
    case "critical_high":
    case "critical_low":
      return "border-l-[3px] border-l-lab-alarm bg-lab-alarm/[0.07]";
    case "high":
      return "border-l-[3px] border-l-lab-alarm bg-lab-alarm/[0.04]";
    case "low":
    case "abnormal":
      return "border-l-2 border-l-amber-500 bg-amber-500/[0.04]";
    case "normal":
      return "border-l-2 border-l-transparent";
    default:
      return "border-l-2 border-l-transparent";
  }
}

/**
 * Filled danger sign for high / critical results. Lucide ships `fill="none"` as
 * a presentation attribute, which a `fill-*` utility class overrides, so the
 * glyph reads as a solid sign with the exclamation knocked out in white.
 *
 * Only icons whose body path is declared before the exclamation survive being
 * filled — OctagonAlert declares it last, so its fill hides the mark.
 */
export function AlarmSign({
  flag,
  className,
}: {
  flag: string | null | undefined;
  className?: string;
}) {
  if (!isAlarmFlag(flag)) return null;
  const critical = isCriticalFlag(flag);
  const Icon = critical ? CircleAlert : TriangleAlert;
  const label = critical ? "Critical result" : "High result";
  return (
    <Icon
      className={cn("size-4 shrink-0 fill-lab-alarm text-white", className)}
      strokeWidth={2.25}
      role="img"
      aria-label={label}
    />
  );
}

/**
 * Background tint only — for callers that paint cells rather than the row and
 * therefore draw the leading bar themselves (see flagBarColor).
 */
export function flagRowTint(flag: string | null | undefined): string {
  switch (flag) {
    case "critical_high":
    case "critical_low":
      return "bg-lab-alarm/[0.07]";
    case "high":
      return "bg-lab-alarm/[0.04]";
    case "low":
    case "abnormal":
      return "bg-amber-500/[0.04]";
    default:
      return "";
  }
}

/**
 * CSS colour for a row's leading bar. Fallbacks are spelled out because
 * Tailwind v4 only emits the palette variables its utilities reference, and
 * nothing in the app uses sky-300 or amber-400 as a utility.
 */
export function flagBarColor(flag: string | null | undefined): string {
  if (isAlarmFlag(flag)) return "var(--color-lab-alarm, #e10600)";
  if (flag === "low" || flag === "abnormal") {
    return "var(--color-lab-warn, #d97706)";
  }
  return "var(--color-sky-300, #7dd3fc)";
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
          ? "border-transparent !bg-lab-alarm font-bold tracking-wide !text-white [&_svg]:opacity-100"
          : "font-normal",
        critical && "ring-2 ring-lab-alarm/25",
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
}: {
  status: string | null | undefined;
  className?: string;
}) {
  const { variant, icon: Icon, label } = statusVisual(status);
  return (
    <Badge
      variant={variant}
      className={cn("gap-1 font-normal", className)}
      title={label}
    >
      <Icon className="size-3 shrink-0 opacity-80" aria-hidden />
      <span className="capitalize">{label}</span>
    </Badge>
  );
}
