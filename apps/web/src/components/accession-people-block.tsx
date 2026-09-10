import {
  buildAccessionStaffRoster,
  formatPersonLine,
  type AccessionStaffRoster,
} from "../lib/accession-staff-roster";
import type { BenchResult, SpecimenRow } from "../lib/api";
import { formatAttributionTime } from "../lib/result-attribution";

function PeopleLine({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <p className="text-xs leading-relaxed text-muted-foreground">
      <span className="font-medium text-foreground/85">{label}</span> {value}
    </p>
  );
}

export function AccessionPeopleBlock({
  roster,
  className,
}: {
  roster: AccessionStaffRoster;
  className?: string;
}) {
  const manualNames = roster.manualContributors.map((person) =>
    formatPersonLine(person),
  );
  const hasContent =
    roster.collectedBy ||
    roster.accessionedBy ||
    manualNames.length > 0 ||
    roster.submittedBy ||
    roster.instruments.length > 0;

  if (!hasContent) return null;

  return (
    <div className={className}>
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        People
      </p>
      <div className="space-y-1">
        {roster.collectedBy ? (
          <PeopleLine
            label="Sample collected by"
            value={formatPersonLine(roster.collectedBy)}
          />
        ) : null}
        {roster.accessionedBy ? (
          <PeopleLine
            label="Accession entered by"
            value={formatPersonLine(roster.accessionedBy)}
          />
        ) : null}
        {manualNames.length > 0 ? (
          <PeopleLine
            label="Manual entries by"
            value={manualNames.join(", ")}
          />
        ) : null}
        {roster.submittedBy ? (
          <PeopleLine
            label="Submitted for release by"
            value={`${formatPersonLine(roster.submittedBy)} · ${formatAttributionTime(roster.submittedBy.at)}`}
          />
        ) : null}
        {roster.instruments.length > 0 ? (
          <PeopleLine
            label="Instruments"
            value={roster.instruments.join(", ")}
          />
        ) : null}
      </div>
    </div>
  );
}

export function AccessionPeopleBlockForAccession({
  accessionNumber,
  specimens,
  results,
  className,
}: {
  accessionNumber: string;
  specimens: SpecimenRow[];
  results: BenchResult[];
  className?: string;
}) {
  const roster = buildAccessionStaffRoster(
    accessionNumber,
    specimens,
    results,
  );
  return <AccessionPeopleBlock roster={roster} className={className} />;
}
