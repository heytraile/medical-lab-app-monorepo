import { AlertTriangle } from "lucide-react";

export function FastingCallout({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div
      className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-950 dark:text-amber-100"
      role="status"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <div>
        <p className="font-medium">Fasting required</p>
        <p className="mt-0.5 text-xs text-amber-900/80 dark:text-amber-100/80">
          Patient must fast 10–14 hours before collection for selected lipid or
          glucose tests (per DHMS requisition instructions).
        </p>
      </div>
    </div>
  );
}
