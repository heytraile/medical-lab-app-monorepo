import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ScanLine } from "lucide-react";
import { api, type PatientListItem } from "../../lib/api";
import { ACCESSION_RE } from "../../lib/label-preview-draft";
import { useDebouncedValue } from "../../lib/use-debounced-value";
import { useBarcodeScanner, useScanInput } from "../../lib/use-barcode-scanner";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

function filterPatients(
  patients: PatientListItem[],
  query: string,
): PatientListItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return patients;
  return patients.filter((p) => {
    const haystack = [
      p.displayName,
      p.mrn,
      p.firstName,
      p.lastName,
      p.middleName ?? "",
      p.dateOfBirth ?? "",
      p.externalId ?? "",
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}

type Props = {
  selected: PatientListItem | null;
  onSelect: (patient: PatientListItem | null) => void;
  onAccessionScan: (accession: string) => void;
  showCreate: boolean;
  onShowCreate: (show: boolean) => void;
  onOpenCreateFromSearch: (filterValue: string) => void;
  scanEnabled?: boolean;
};

export function PatientPicker({
  selected,
  onSelect,
  onAccessionScan,
  showCreate,
  onShowCreate,
  onOpenCreateFromSearch,
  scanEnabled = true,
}: Props) {
  const [filter, setFilter] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const debouncedFilter = useDebouncedValue(filter, 150);

  const patientsQ = useQuery({
    queryKey: ["patients-all"],
    queryFn: () => api.patients(),
    staleTime: 30_000,
  });

  const allPatients = patientsQ.data ?? [];
  const filtered = useMemo(
    () => filterPatients(allPatients, debouncedFilter),
    [allPatients, debouncedFilter],
  );

  function resolveScan(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    setHint(null);

    if (ACCESSION_RE.test(trimmed)) {
      onAccessionScan(trimmed);
      return;
    }

    setFilter(trimmed);
    const exact = allPatients.find(
      (p) => p.mrn.toLowerCase() === trimmed.toLowerCase(),
    );
    if (exact) {
      onSelect(exact);
      onShowCreate(false);
      setHint(`Selected ${exact.displayName} (${exact.mrn})`);
      return;
    }
    const matches = filterPatients(allPatients, trimmed);
    if (matches.length === 1) {
      onSelect(matches[0]!);
      onShowCreate(false);
      setHint(`Selected ${matches[0]!.displayName}`);
      return;
    }
    setHint(
      matches.length > 0
        ? `${matches.length} matches — pick from list`
        : "No patient match — register new or adjust filter",
    );
  }

  const scanHandlers = useScanInput((value) => {
    setFilter(value);
    resolveScan(value);
  });

  useBarcodeScanner({
    enabled: scanEnabled && !showCreate,
    onScan: resolveScan,
  });

  const countLabel =
    debouncedFilter.trim() && filtered.length !== allPatients.length
      ? `${allPatients.length} patients · ${filtered.length} matches`
      : `${allPatients.length} patient${allPatients.length === 1 ? "" : "s"}`;

  return (
    <div className="space-y-3">
      <label className="block space-y-1.5">
        <span className="flex items-center gap-2 text-sm font-medium">
          <ScanLine className="size-4" />
          Scan MRN or filter patients
        </span>
        <Input
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setHint(null);
          }}
          placeholder="Type to filter, or scan patient MRN…"
          autoComplete="off"
          autoFocus
          {...scanHandlers}
          onKeyDown={(e) => {
            scanHandlers.onKeyDown(e);
            if (e.key === "Enter" && !e.defaultPrevented) {
              resolveScan(e.currentTarget.value);
            }
          }}
        />
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </label>

      {selected && (
        <div className="rounded-md border border-accent/40 bg-accent/5 px-3 py-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{selected.displayName}</span>
            <Badge variant="muted">{selected.mrn}</Badge>
            {selected.identityOrigin === "local_provisional" && (
              <Badge variant="warn">Provisional</Badge>
            )}
            {selected.requiresIdentityConfirmation && (
              <Badge variant="warn">Suspect duplicate</Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {[selected.dateOfBirth, selected.sex].filter(Boolean).join(" · ") ||
              "No DOB/sex on file"}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-1 px-0"
            onClick={() => onSelect(null)}
          >
            Change patient
          </Button>
        </div>
      )}

      {!selected && (
        <>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">{countLabel}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenCreateFromSearch(filter)}
            >
              Register new patient
            </Button>
          </div>
          <ul className="max-h-72 overflow-auto rounded-md border border-border divide-y divide-border">
            {patientsQ.isLoading && (
              <li className="px-3 py-2 text-sm text-muted-foreground">
                Loading patients…
              </li>
            )}
            {patientsQ.isError && (
              <li className="px-3 py-2 text-sm text-lab-danger">
                Could not load patients. Is edge-engine running?
              </li>
            )}
            {!patientsQ.isLoading &&
              !patientsQ.isError &&
              allPatients.length === 0 && (
                <li className="px-3 py-2 text-sm text-muted-foreground">
                  No patients on file — register a new patient.
                </li>
              )}
            {!patientsQ.isLoading &&
              !patientsQ.isError &&
              allPatients.length > 0 &&
              filtered.length === 0 && (
                <li className="px-3 py-2 text-sm text-muted-foreground">
                  No matches for &ldquo;{debouncedFilter}&rdquo;
                </li>
              )}
            {filtered.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className="flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm hover:bg-muted"
                  onClick={() => {
                    onSelect(p);
                    onShowCreate(false);
                  }}
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{p.displayName}</span>
                    <span className="text-xs text-muted-foreground">
                      {p.mrn}
                    </span>
                    {p.identityOrigin === "local_provisional" && (
                      <Badge variant="warn">Provisional</Badge>
                    )}
                    {p.requiresIdentityConfirmation && (
                      <Badge variant="warn">Suspect</Badge>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {[p.dateOfBirth, p.sex].filter(Boolean).join(" · ")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
