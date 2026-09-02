import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, useEffect } from "react";
import { ScanLine } from "lucide-react";
import { api } from "../../lib/api";
import {
  orderedTestsForAccession,
  type ParsedOrderedTest,
} from "../../lib/ordered-tests";
import { useScanInput } from "../../lib/use-barcode-scanner";
import { AccessioningShell } from "../../components/accessioning/accessioning-shell";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Badge } from "../../components/ui/badge";

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

function OrdersLookupPage() {
  const navigate = useNavigate();
  const { accession: routeAccession } = Route.useSearch();
  const [query, setQuery] = useState(routeAccession ?? "");
  const active = (routeAccession ?? query).trim();

  useEffect(() => {
    if (routeAccession) setQuery(routeAccession);
  }, [routeAccession]);

  const specimensQ = useQuery({
    queryKey: ["specimens"],
    queryFn: () => api.specimens(),
  });

  const cloudQ = useQuery({
    queryKey: ["requisition", active],
    queryFn: () => api.getRequisitionByAccession(active),
    enabled: Boolean(active),
    retry: false,
  });

  const edgeTests = useMemo(
    () => orderedTestsForAccession(specimensQ.data ?? [], active),
    [specimensQ.data, active],
  );

  const tests: ParsedOrderedTest[] = useMemo(() => {
    if (cloudQ.data?.orderedTests?.length) {
      return cloudQ.data.orderedTests.map((t) => ({
        code: t.code,
        name: t.name,
      }));
    }
    return edgeTests;
  }, [cloudQ.data, edgeTests]);

  useScanInput((value) => {
    const v = value.trim();
    if (!v) return;
    setQuery(v);
    void navigate({ to: "/orders", search: { accession: v } });
  });

  return (
    <AccessioningShell
      title="Ordered tests lookup"
      description="Read-only view of what was ordered for an accession — for phlebotomy and collection."
    >
      <div className="mx-auto max-w-xl space-y-4">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const v = query.trim();
            if (!v) return;
            void navigate({ to: "/orders", search: { accession: v } });
          }}
        >
          <div className="relative flex-1">
            <ScanLine className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Scan or type accession…"
              className="pl-9"
            />
          </div>
          <Button type="submit" variant="secondary">
            Look up
          </Button>
        </form>

        {!active ? (
          <p className="text-sm text-muted-foreground">
            Enter an accession number to see ordered work.
          </p>
        ) : specimensQ.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : tests.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            No ordered tests found for{" "}
            <span className="font-mono">{active}</span>.
          </p>
        ) : (
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="font-mono text-sm font-medium">{active}</p>
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
                <Link to="/labels" search={{ accession: active }}>
                  Labels
                </Link>
              </Button>
              <Button type="button" size="sm" variant="outline" asChild>
                <Link to="/bench" search={{ q: active }}>
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
