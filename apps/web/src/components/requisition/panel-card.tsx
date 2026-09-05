import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import type { CatalogPanel } from "@drax-lis/contracts";
import { Badge } from "../ui/badge";
import { FulfillmentBadge } from "./fulfillment-badge";
import { cn } from "../../lib/utils";

export function PanelCard({
  panel,
  selected,
  onToggle,
  search,
}: {
  panel: CatalogPanel;
  selected: boolean;
  onToggle: () => void;
  search: string;
}) {
  const [open, setOpen] = useState(false);
  const q = search.trim().toLowerCase();
  const members = panel.members ?? [];
  const count = panel.memberCodes.length;

  if (
    q &&
    !panel.name.toLowerCase().includes(q) &&
    !panel.code.toLowerCase().includes(q) &&
    !members.some(
      (m) =>
        m.name.toLowerCase().includes(q) || m.code.toLowerCase().includes(q),
    )
  ) {
    return null;
  }

  return (
    <div
      className={cn(
        "rounded-lg border transition-colors",
        selected
          ? "border-primary/50 bg-primary/5"
          : "border-border bg-card hover:border-border/80",
      )}
    >
      <div className="flex items-start gap-2 p-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          className="mt-1 size-4 shrink-0 rounded border-border"
          aria-label={`Select panel ${panel.name}`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="text-left font-medium leading-snug hover:underline"
              onClick={onToggle}
            >
              {panel.name}
            </button>
            <Badge variant="muted" className="text-[10px]">
              {count} test{count === 1 ? "" : "s"}
            </Badge>
          </div>
          {panel.description && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {panel.description}
            </p>
          )}
        </div>
        <button
          type="button"
          className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? "Hide constituents" : "Show constituents"}
        >
          {open ? (
            <ChevronDown className="size-4" />
          ) : (
            <ChevronRight className="size-4" />
          )}
        </button>
      </div>
      {open && members.length > 0 && (
        <ul className="border-t border-border/60 px-3 py-2 text-xs text-muted-foreground">
          {members.map((m) => (
            <li key={m.code} className="py-0.5">
              <span className="font-mono text-[10px]">{m.code}</span> — {m.name}
              <FulfillmentBadge code={m.code} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
