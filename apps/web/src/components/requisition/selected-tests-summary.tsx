import type { ExpandedOrderedTest } from "@drax-lis/catalog";
import { Badge } from "../ui/badge";
import { ScrollContainer } from "../ui/scroll-container";

export function SelectedTestsSummary({
  expanded,
  panelCount,
  individualCount,
}: {
  expanded: ExpandedOrderedTest[];
  panelCount: number;
  individualCount: number;
}) {
  const serum = expanded.filter((t) => t.specimenHint === "serum").length;
  const urine = expanded.filter((t) => t.specimenHint === "urine").length;

  return (
    <div className="space-y-3 min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium">Selected tests</p>
        <p className="text-xs text-muted-foreground shrink-0">
          {expanded.length} test{expanded.length === 1 ? "" : "s"}
          {panelCount > 0 && ` · ${panelCount} panel${panelCount === 1 ? "" : "s"}`}
          {individualCount > 0 &&
            ` · ${individualCount} individual`}
        </p>
      </div>

      {expanded.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
          Select panels or individual tests to build the order.
        </p>
      ) : (
        <ScrollContainer className="max-h-48 min-w-0 rounded-md border border-border bg-muted/20 lg:max-h-64">
        <ul className="space-y-1 p-2 text-sm">
          {expanded.map((t) => (
            <li key={t.code} className="min-w-0 space-y-0.5">
              <p className="min-w-0 break-words leading-snug">
                <span className="font-mono text-xs text-muted-foreground">
                  {t.code}
                </span>{" "}
                {t.name}
              </p>
              {t.sourcePanel && (
                <p className="text-[10px] text-muted-foreground break-words">
                  via {t.sourcePanel}
                </p>
              )}
            </li>
          ))}
        </ul>
        </ScrollContainer>
      )}

      {expanded.length > 0 && (serum > 0 || urine > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {serum > 0 && (
            <Badge variant="muted" className="text-[10px]">
              Serum ({serum})
            </Badge>
          )}
          {urine > 0 && (
            <Badge variant="muted" className="text-[10px]">
              Urine ({urine})
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
