import { cn } from "../../lib/utils";

export function CategoryPill({
  label,
  active,
  count,
  onClick,
}: {
  label: string;
  active: boolean;
  count?: number;
  onClick: () => void;
}) {
  const showBadge = count != null && count > 0;

  return (
    <button
      type="button"
      className={cn(
        "relative inline-flex items-center rounded-full py-1.5 text-xs font-medium transition-colors",
        showBadge ? "pl-3 pr-2" : "px-3",
        active
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-muted-foreground hover:bg-muted/80",
      )}
      onClick={onClick}
    >
      <span>{label}</span>
      {showBadge && (
        <span
          className="ml-1.5 inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-green-800 px-1 text-[10px] font-bold leading-none tabular-nums text-white"
          aria-label={`${count} selected`}
        >
          {count! > 99 ? "99+" : count}
        </span>
      )}
    </button>
  );
}
