import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, useEffect, useDeferredValue, useCallback } from "react";
import { ScanLine } from "lucide-react";
import { api } from "../../lib/api";
import {
  filterSpecimensByAccessionQuery,
  findExactSpecimenMatch,
  mergeOrderedTestsLookup,
  parseOrderedTestsJson,
  type ParsedOrderedTest,
} from "../../lib/ordered-tests";
import { useDebouncedValue } from "../../lib/use-debounced-value";
import { useScanInput } from "../../lib/use-barcode-scanner";
import { AccessioningShell } from "../../components/accessioning/accessioning-shell";
import { Button } from "../../components/ui/button";
import { ClearableInput } from "../../components/ui/clearable-input";
import { Badge } from "../../components/ui/badge";
import { ScrollContainer } from "../../components/ui/scroll-container";
import { cn } from "../../lib/utils";

type OrdersSearch = { accession?: string };

export const Route = createFileRoute("/_lab/orders")({
  validateSearch: (search: Record<string, unknown>): OrdersSearch => ({
    accession:
      typeof search.accession === "string" && search.accession.trim()
        ? search.accession.trim()
        : undefined,
  }),
  component: OrdersLookupPage,
});

function patientFromJson(json: string | null): string {
  if (!json) return "—";
  try {
    const p = JSON.parse(json) as { firstName?: string; lastName?: string };
    return [p.firstName, p.lastName].filter(Boolean).join(" ") || "—";
  } catch {
    return "—";
  }
}

function OrdersLookupPage() {
  const navigate = useNavigate();
  const { accession: routeAccession } = Route.useSearch();
  const [query, setQuery] = useState(routeAccession ?? "");
  const [lookupAccession, setLookupAccession] = useState(
    routeAccession?.trim() ?? "",
  );

  useEffect(() => {
    if (routeAccession) {
      setQuery(routeAccession);
      setLookupAccession(routeAccession.trim());
    } else {
      setQuery("");
      setLookupAccession("");
    }
  }, [routeAccession]);

  useEffect(() => {
    const trimmed = query.trim();
    if (
      lookupAccession &&
      trimmed.toLowerCase() !== lookupAccession.toLowerCase()
    ) {
      setLookupAccession("");
    }
  }, [query, lookupAccession]);

  const debouncedQuery = useDebouncedValue(query, 150);
  const deferredFilter = useDeferredValue(debouncedQuery.trim().toLowerCase());

  const clearSearch = useCallback(() => {
    setQuery("");
    setLookupAccession("");
    void navigate({ to: "/orders", search: {}, replace: true });
  }, [navigate]);

  const specimensQ = useQuery({
    queryKey: ["specimens"],
    queryFn: () => api.specimens(),
    staleTime: 10_000,
  });

  const suggestions = useMemo(() => {
    const specimens = specimensQ.data ?? [];
    if (deferredFilter) {
      return filterSpecimensByAccessionQuery(specimens, deferredFilter);
    }
    return specimens.slice(0, 20);
  }, [specimensQ.data, deferredFilter]);

  const confirmLookup = useCallback(
    (acc: string) => {
      const trimmed = acc.trim();
      if (!trimmed) {
        setQuery("");
        setLookupAccession("");
        void navigate({ to: "/orders", search: {} });
        return;
      }
      setQuery(trimmed);
      setLookupAccession(trimmed);
      void navigate({ to: "/orders", search: { accession: trimmed } });
    },
    [navigate],
  );

  const confirmFromInput = useCallback(() => {
    const trimmed = query.trim();
    if (!trimmed) return;
    const exact = findExactSpecimenMatch(specimensQ.data ?? [], trimmed);
    confirmLookup(exact?.accessionNumber ?? trimmed);
  }, [query, specimensQ.data, confirmLookup]);

  useEffect(() => {
    const trimmed = debouncedQuery.trim();
    // Ignore stale debounced value after the user cleared the field.
    if (!query.trim() || !trimmed) return;
    const exact = findExactSpecimenMatch(specimensQ.data ?? [], trimmed);
    if (exact && exact.accessionNumber !== lookupAccession) {
      confirmLookup(exact.accessionNumber);
    }
  }, [
    query,
    debouncedQuery,
    specimensQ.data,
    lookupAccession,
    confirmLookup,
  ]);

  const cloudSpecimenQ = useQuery({
    queryKey: ["cloud-specimen", lookupAccession],
    queryFn: () => api.cloudSpecimenByAccession(lookupAccession),
    enabled: Boolean(lookupAccession),
    retry: false,
  });

  const cloudRequisitionQ = useQuery({
    queryKey: ["requisition", lookupAccession],
    queryFn: () => api.getRequisitionByAccession(lookupAccession),
    enabled: Boolean(lookupAccession),
    retry: false,
  });

  const edgeSpecimenQ = useQuery({
    queryKey: ["edge-specimen", lookupAccession],
    queryFn: () => api.specimenByAccession(lookupAccession),
    enabled: Boolean(lookupAccession),
    retry: false,
  });

  const tests: ParsedOrderedTest[] = useMemo(
    () =>
      mergeOrderedTestsLookup({
        cloudSpecimen: cloudSpecimenQ.data?.orderedTests,
        cloudRequisition: cloudRequisitionQ.data?.orderedTests?.map((t) => ({
          code: t.code,
          name: t.name,
        })),
        edgeSpecimen: parseOrderedTestsJson(
          edgeSpecimenQ.data?.orderedTestsJson,
        ),
      }),
    [cloudSpecimenQ.data, cloudRequisitionQ.data, edgeSpecimenQ.data],
  );

  const isLoading =
    Boolean(lookupAccession) &&
    (cloudSpecimenQ.isLoading ||
      cloudRequisitionQ.isLoading ||
      edgeSpecimenQ.isLoading);

  useScanInput((value) => {
    const v = value.trim();
    if (!v) return;
    confirmLookup(v);
  });

  return (
    <AccessioningShell
      title="Test lookup"
      description="Read-only view of what was ordered for an accession — for phlebotomy and collection."
    >
      <div className="mx-auto max-w-xl space-y-4">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            confirmFromInput();
          }}
        >
          <ClearableInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onClear={clearSearch}
            placeholder="Scan or type accession…"
            wrapperClassName="flex-1"
            leftSlot={<ScanLine className="size-4 text-muted-foreground" />}
          />
          <Button type="submit" variant="secondary">
            Look up
          </Button>
        </form>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {deferredFilter ? "Matching accessions" : "Recent accessions"}
          </p>
            <ScrollContainer className="max-h-64 rounded-md border border-border">
              <ul className="divide-y divide-border">
                {specimensQ.isLoading && (
                  <li className="px-3 py-2 text-sm text-muted-foreground">
                    Loading…
                  </li>
                )}
                {!specimensQ.isLoading && suggestions.length === 0 && (
                  <li className="px-3 py-3 text-sm text-muted-foreground">
                    {deferredFilter
                      ? `No accessions match “${debouncedQuery.trim()}”.`
                      : "No specimens yet."}
                  </li>
                )}
                {suggestions.map((s) => {
                  const isSelected =
                    s.accessionNumber.toUpperCase() ===
                    lookupAccession.trim().toUpperCase();
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        aria-current={isSelected ? "true" : undefined}
                        className={cn(
                          "flex w-full flex-col items-start gap-1 border-l-2 px-3 py-2.5 text-left text-sm transition-colors sm:flex-row sm:items-center sm:justify-between sm:gap-2",
                          isSelected
                            ? "border-l-accent bg-accent/10"
                            : "border-l-transparent hover:bg-muted",
                        )}
                        onClick={() => confirmLookup(s.accessionNumber)}
                      >
                        <span className="min-w-0">
                          <span
                            className={cn(
                              "font-mono font-medium",
                              isSelected && "text-accent",
                            )}
                          >
                            {s.accessionNumber}
                          </span>
                          <span className="ml-2 text-muted-foreground">
                            {patientFromJson(s.patientJson)}
                          </span>
                        </span>
                        <Badge variant="muted">{s.status}</Badge>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </ScrollContainer>
          </div>

        {!lookupAccession ? (
          <p className="text-sm text-muted-foreground">
            Enter or select an accession to see ordered work.
          </p>
        ) : isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : tests.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            No ordered tests found for{" "}
            <span className="font-mono">{lookupAccession}</span>.
          </p>
        ) : (
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="font-mono text-sm font-medium">{lookupAccession}</p>
              <Badge variant="muted">{tests.length} ordered</Badge>
            </div>
            <ul className="space-y-2 text-sm">
              {tests.map((t) => (
                <li
                  key={t.code}
                  className="flex items-baseline justify-between gap-2 border-b border-border/50 pb-2 last:border-0"
                >
                  <span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {t.code}
                    </span>{" "}
                    {t.name ?? t.code}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" asChild>
                <Link to="/labels" search={{ accession: lookupAccession }}>
                  Labels
                </Link>
              </Button>
              <Button type="button" size="sm" variant="outline" asChild>
                <Link to="/bench" search={{ q: lookupAccession }}>
                  Bench
                </Link>
              </Button>
            </div>
          </div>
        )}
      </div>
    </AccessioningShell>
  );
}
