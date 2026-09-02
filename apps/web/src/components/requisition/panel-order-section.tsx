import { useState } from "react";
import type { CatalogResponse } from "@drax-lis/contracts";
import type { OrderSelection } from "@drax-lis/catalog";
import { Input } from "../ui/input";
import { PanelCard } from "./panel-card";
import { cn } from "../../lib/utils";

export function PanelOrderSection({
  catalog,
  selections,
  onChange,
  className,
}: {
  catalog: CatalogResponse;
  selections: OrderSelection[];
  onChange: (next: OrderSelection[]) => void;
  className?: string;
}) {
  const [panelSearch, setPanelSearch] = useState("");

  const selectedPanelCodes = new Set(
    selections.filter((s) => s.kind === "panel").map((s) => s.code),
  );

  function togglePanel(code: string) {
    const has = selectedPanelCodes.has(code);
    onChange(
      has
        ? selections.filter((s) => !(s.kind === "panel" && s.code === code))
        : [...selections, { kind: "panel", code }],
    );
  }

  return (
    <section className={cn("flex h-full min-h-0 flex-col", className)}>
      <p className="mb-2 text-base font-semibold">Test profiles & panels</p>
      <Input
        value={panelSearch}
        onChange={(e) => setPanelSearch(e.target.value)}
        placeholder="Search panels…"
        className="mb-3 h-10"
      />
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {catalog.panels.map((panel) => (
          <PanelCard
            key={panel.code}
            panel={panel}
            selected={selectedPanelCodes.has(panel.code)}
            onToggle={() => togglePanel(panel.code)}
            search={panelSearch}
          />
        ))}
      </div>
    </section>
  );
}
