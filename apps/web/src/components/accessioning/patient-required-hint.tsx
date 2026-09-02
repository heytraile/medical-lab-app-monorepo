import { UserRound } from "lucide-react";
import { cn } from "../../lib/utils";

export function PatientRequiredHint({ className }: { className?: string }) {
  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-3 rounded-xl border border-amber-300/70 bg-amber-50 px-4 py-3 shadow-sm",
        "dark:border-amber-800/60 dark:bg-amber-950/35",
        className,
      )}
    >
      <UserRound
        className="mt-0.5 size-5 shrink-0 text-amber-700 dark:text-amber-300"
        aria-hidden
      />
      <div className="min-w-0">
        <p className="text-sm font-medium text-amber-950 dark:text-amber-50">
          Select a patient to continue
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-amber-900/85 dark:text-amber-100/80">
          You&apos;ve built a test order, but accession needs a patient first.
          Search or scan an MRN in the patient panel on the left.
        </p>
      </div>
    </div>
  );
}
