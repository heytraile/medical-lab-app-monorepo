import { useMemo, useState } from "react";
import type { CatalogResponse } from "@drax-lis/contracts";
import type { OrderSelection } from "@drax-lis/catalog";
import { ClearableInput } from "../ui/clearable-input";
import { ScrollContainer } from "../ui/scroll-container";
import { CategoryPill } from "./category-pill";
import { FulfillmentBadge } from "./fulfillment-badge";
import { cn } from "../../lib/utils";

export const ALL_TESTS_CATEGORY = "__all__";

export function IndividualTestsSection({
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
  const [testSearch, setTestSearch] = useState("");
  const [tab, setTab] = useState<string>(ALL_TESTS_CATEGORY);

  const selectedTestCodes = new Set(
    selections.filter((s) => s.kind === "test").map((s) => s.code),
  );

  const itemByCode = useMemo(
    () => new Map(catalog.items.map((i) => [i.code, i])),
    [catalog.items],
  );

  const selectedCountByCategory = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const sel of selections) {
      if (sel.kind !== "test") continue;
      const item = itemByCode.get(sel.code);
      if (!item) continue;
      counts[item.category] = (counts[item.category] ?? 0) + 1;
    }
    return counts;
  }, [selections, itemByCode]);

  const totalIndividual = selections.filter((s) => s.kind === "test").length;

  const activeCategoryLabel =
    tab === ALL_TESTS_CATEGORY
      ? "all tests"
      : (catalog.categories.find((c) => c.id === tab)?.label ?? tab);

  const q = testSearch.trim().toLowerCase();
  const baseItems =
    tab === ALL_TESTS_CATEGORY
      ? catalog.items
      : catalog.items.filter((i) => i.category === tab);

  const filteredItems = baseItems.filter(
    (i) =>
      !q ||
      i.name.toLowerCase().includes(q) ||
      i.code.toLowerCase().includes(q),
  );

  function toggleTest(code: string) {
    const has = selectedTestCodes.has(code);
    onChange(
      has
        ? selections.filter((s) => !(s.kind === "test" && s.code === code))
        : [...selections, { kind: "test", code }],
    );
  }

  return (
    <section className={cn("flex min-h-0 flex-col", className)}>
      <p className="mb-2 text-base font-semibold">Individual tests</p>

      <ScrollContainer className="mb-3 max-h-24">
        <div className="flex flex-wrap gap-1.5">
        <CategoryPill
          label="All"
          active={tab === ALL_TESTS_CATEGORY}
          count={totalIndividual}
          onClick={() => setTab(ALL_TESTS_CATEGORY)}
        />
        {catalog.categories.map((c) => (
          <CategoryPill
            key={c.id}
            label={c.label}
            active={tab === c.id}
            count={selectedCountByCategory[c.id] ?? 0}
            onClick={() => setTab(c.id)}
          />
        ))}
        </div>
      </ScrollContainer>

      <ClearableInput
        value={testSearch}
        onChange={(e) => setTestSearch(e.target.value)}
        placeholder={`Search ${activeCategoryLabel}…`}
        wrapperClassName="mb-3"
        className="h-10"
      />

      <ScrollContainer className="min-h-0 flex-1 rounded-lg border border-border">
        {filteredItems.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">
            No tests match your search.
          </p>
        ) : (
          <ul className="divide-y divide-border/60">
            {filteredItems.map((item) => {
              const checked = selectedTestCodes.has(item.code);
              return (
                <li key={item.code}>
                  <label
                    className={cn(
                      "flex cursor-pointer items-start gap-3 px-3 py-2.5 transition-colors hover:bg-muted/40",
                      checked && "bg-primary/5",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleTest(item.code)}
                      className="mt-0.5 size-[1.125rem] shrink-0 rounded border-border"
                    />
                    <span className="min-w-0 text-sm">
                      <span className="font-mono text-xs text-muted-foreground">
                        {item.code}
                      </span>{" "}
                      <span className="font-medium">{item.name}</span>
                      <FulfillmentBadge code={item.code} />
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </ScrollContainer>
    </section>
  );
}
