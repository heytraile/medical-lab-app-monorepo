import { useState } from "react";
import type { CatalogResponse } from "@drax-lis/contracts";
import type { OrderSelection } from "@drax-lis/catalog";
import { ClearableInput } from "../ui/clearable-input";
import { ScrollContainer } from "../ui/scroll-container";
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
      <ClearableInput
        value={panelSearch}
        onChange={(e) => setPanelSearch(e.target.value)}
        placeholder="Search panels…"
        wrapperClassName="mb-3"
        className="h-10"
      />
      <ScrollContainer className="min-h-0 flex-1">
        <div className="space-y-2 pr-1">
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
      </ScrollContainer>
    </section>
  );
}
