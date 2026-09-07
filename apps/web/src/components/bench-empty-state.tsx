import { Link } from "@tanstack/react-router";
import { missingManualResultRequirements } from "@drax-lis/catalog";
import type { SpecimenRow } from "../lib/api";
import {
  parseOrderedTests,
  patientDisplayNameFromJson,
} from "../lib/specimen-display";
import { ManualResultEntryButton } from "./manual-result-entry";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";

type Props = {
  tab: "all" | "pending" | "flagged" | "released";
  q?: string;
  analyzer?: string;
  /** Specimen matching `q` (accession / barcode), if any. */
  matchedSpecimen: SpecimenRow | null;
  /** True when any result rows already exist for that accession (unfiltered). */
  resultsExistForAccession: boolean;
  onClearSearch: () => void;
};

function orderedCodes(row: SpecimenRow): string[] {
  const tests = row.orderedTests?.length
    ? row.orderedTests
    : parseOrderedTests(row.orderedTestsJson);
  return tests.map((t) => t.code);
}

export function BenchEmptyState({
  tab,
  q,
  analyzer,
  matchedSpecimen,
  resultsExistForAccession,
  onClearSearch,
}: Props) {
  if (tab === "released" && !q && !analyzer) {
    return (
      <div className="rounded-xl border border-border bg-card px-3 py-12 text-center text-muted-foreground">
        No released results yet. After sign-off, results appear here.
      </div>
    );
  }

  const hasUrlFilter = Boolean(q?.trim() || analyzer);
  const waiting = Boolean(
    q?.trim() && matchedSpecimen && !resultsExistForAccession,
  );

  if (waiting && matchedSpecimen) {
    const patientName =
      matchedSpecimen.patientDisplayName?.trim() ||
      patientDisplayNameFromJson(matchedSpecimen.patientJson);
    const tests = matchedSpecimen.orderedTests?.length
      ? matchedSpecimen.orderedTests
      : parseOrderedTests(matchedSpecimen.orderedTestsJson);
    const missingManual = missingManualResultRequirements(
      orderedCodes(matchedSpecimen),
      [],
    );

    return (
      <div className="space-y-4 rounded-xl border border-border bg-card px-4 py-8 text-center sm:px-6">
        <div className="space-y-2">
          <p className="font-display text-lg font-semibold tracking-tight">
            Waiting for results
          </p>
          <p className="mx-auto max-w-lg text-sm text-muted-foreground">
            Accession{" "}
            <span className="font-mono text-foreground">
              {matchedSpecimen.accessionNumber}
            </span>
            {patientName !== "—" ? (
              <>
                {" "}
                for <span className="font-medium text-foreground">{patientName}</span>
              </>
            ) : null}{" "}
            is registered, but nothing has posted to Bench yet. Instrument
            results appear when analyzers send data; manual tests need entry
            below.
          </p>
        </div>

        {tests.length > 0 ? (
          <div className="mx-auto max-w-md text-left">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Ordered ({tests.length})
            </p>
            <ul className="divide-y divide-border rounded-lg border border-border text-sm">
              {tests.map((t) => (
                <li key={t.code} className="flex items-center gap-2 px-3 py-2">
                  <span className="font-mono text-xs text-muted-foreground">
                    {t.code}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {t.name ?? t.code}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {missingManual.length > 0 ? (
          <div className="mx-auto max-w-md space-y-2 text-left">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Awaiting manual result
            </p>
            <ul className="space-y-2">
              {missingManual.map((item) => (
                <li
                  key={`${item.orderedTestCode}-${item.componentCode}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2"
                >
                  <div className="min-w-0 text-sm">
                    <span className="font-mono text-xs">
                      {item.orderedTestCode}
                    </span>{" "}
                    <span className="font-medium">{item.orderedTestName}</span>
                    {item.componentName !== "Manual result" ? (
                      <span className="text-muted-foreground">
                        {" "}
                        — {item.componentName}
                      </span>
                    ) : null}
                    <Badge variant="warn" className="ml-1.5 text-[10px]">
                      Manual
                    </Badge>
                  </div>
                  <ManualResultEntryButton
                    accessionNumber={matchedSpecimen.accessionNumber}
                    testCode={item.orderedTestCode}
                    testName={item.orderedTestName}
                    resultComponentCode={item.componentCode}
                    resultComponentName={item.componentName}
                  />
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button type="button" variant="outline" onClick={onClearSearch}>
            Clear search
          </Button>
          <Button type="button" variant="outline" asChild>
            <Link
              to="/labels"
              search={{ accession: matchedSpecimen.accessionNumber }}
            >
              Open in Labels
            </Link>
          </Button>
          <Button type="button" variant="outline" asChild>
            <Link
              to="/accession"
              search={{
                tab: "history",
                accession: matchedSpecimen.accessionNumber,
              }}
            >
              Accession History
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  if (hasUrlFilter) {
    return (
      <div className="space-y-3 rounded-xl border border-border bg-card px-4 py-12 text-center">
        <p className="font-medium">No matching results for this search</p>
        <p className="mx-auto max-w-md text-sm text-muted-foreground">
          {q ? (
            <>
              Nothing on Bench matches{" "}
              <span className="font-mono text-foreground">“{q}”</span>
              {analyzer ? ` on ${analyzer}` : ""}. If you just accessioned, the
              specimen may be registered but results have not arrived yet.
            </>
          ) : (
            <>No results for the selected analyzer filter.</>
          )}
        </p>
        <Button type="button" variant="outline" onClick={onClearSearch}>
          Clear search
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card px-3 py-12 text-center text-muted-foreground">
      {tab === "pending"
        ? "No results pending review."
        : tab === "flagged"
          ? "No flagged results in this view."
          : "No results for this view."}
    </div>
  );
}
