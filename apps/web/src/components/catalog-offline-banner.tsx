import { cn } from "../lib/utils";

export function CatalogOfflineBanner({ className }: { className?: string }) {
  return (
    <p
      className={cn(
        "rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-950 dark:text-amber-100",
        className,
      )}
    >
      Using bundled catalog defaults while offline. Saved lab routing will apply
      when the cloud is reachable.
    </p>
  );
}
