import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "../lib/utils";

export type CriticalUrgencyPhase = "authorize" | "send";

export function criticalUrgencyCopy(phase: CriticalUrgencyPhase): string {
  return phase === "authorize"
    ? "Authorize now — send to doctor immediately"
    : "Send to doctor immediately";
}

/** Pulsing ring wrapper — matches the bench emergency submit treatment. */
export function CriticalPulse({
  active,
  className,
  children,
}: {
  active: boolean;
  className?: string;
  children: ReactNode;
}) {
  if (!active) return <>{children}</>;
  return (
    <div className={cn("relative inline-flex", className)}>
      <span
        className="pointer-events-none absolute inset-0 animate-alarm-ring rounded-md bg-lab-danger/45"
        aria-hidden
      />
      <div className="relative w-full">{children}</div>
    </div>
  );
}

export function CriticalUrgencyMark({
  phase,
  className,
}: {
  phase: CriticalUrgencyPhase;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "flex items-start gap-1.5 text-[11px] font-semibold leading-snug text-lab-alarm",
        className,
      )}
    >
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>{criticalUrgencyCopy(phase)}</span>
    </p>
  );
}
