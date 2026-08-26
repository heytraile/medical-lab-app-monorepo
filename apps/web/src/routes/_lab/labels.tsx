import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ScanLine } from "lucide-react";
import { ApiError, api, type LabelPreviewFields } from "../../lib/api";
import {
  buildLabelPreviewFromSpecimen,
  findSpecimenByAccession,
  PRINT_API_UNAVAILABLE_MSG,
  TEST_LABEL_PREVIEW,
} from "../../lib/label-preview-from-specimen";
import { useScanInput } from "../../lib/use-barcode-scanner";
import { AccessioningShell } from "../../components/accessioning/accessioning-shell";
import { LabelPreviewPanel } from "../../components/accessioning/label-preview-panel";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Badge } from "../../components/ui/badge";

type LabelsSearch = {
  accession?: string;
};

export const Route = createFileRoute("/_lab/labels")({
  validateSearch: (search: Record<string, unknown>): LabelsSearch => ({
    accession:
      typeof search.accession === "string" && search.accession.trim()
        ? search.accession.trim()
        : undefined,
  }),
  component: LabelsPage,
});

function patientFromJson(json: string | null): string {
  if (!json) return "—";
  try {
    const p = JSON.parse(json) as {
      firstName?: string;
      lastName?: string;
    };
    return [p.firstName, p.lastName].filter(Boolean).join(" ") || "—";
  } catch {
    return "—";
  }
}

function isPrintApiMissing(err: unknown): boolean {
  return err instanceof ApiError && err.status === 404;
}

function LabelsPage() {
  const { accession: accessionFromUrl } = Route.useSearch();
  const navigate = useNavigate();
  const [accessionInput, setAccessionInput] = useState(accessionFromUrl ?? "");
  const [activeAccession, setActiveAccession] = useState(
    accessionFromUrl?.trim() ?? "",
  );
  const [printStatus, setPrintStatus] = useState<{
    ok: boolean;
    error?: string;
  } | null>(null);
  const [copies, setCopies] = useState(1);
  const [testPreview, setTestPreview] = useState<LabelPreviewFields | null>(
    null,
  );

  const specimensQ = useQuery({
    queryKey: ["specimens"],
    queryFn: () => api.specimens(),
  });

  useEffect(() => {
    if (accessionFromUrl) {
      setAccessionInput(accessionFromUrl);
      setActiveAccession(accessionFromUrl.trim());
      setTestPreview(null);
    }
  }, [accessionFromUrl]);

  const specimenRow = useMemo(() => {
    if (!activeAccession.trim() || !specimensQ.data) return undefined;
    return findSpecimenByAccession(specimensQ.data, activeAccession);
  }, [activeAccession, specimensQ.data]);

  const clientPreview = useMemo(
    () => (specimenRow ? buildLabelPreviewFromSpecimen(specimenRow) : null),
    [specimenRow],
  );

  const edgePreviewQ = useQuery({
    queryKey: [
      "label-edge-preview",
      activeAccession,
      specimenRow?.id,
      specimensQ.dataUpdatedAt,
    ],
    queryFn: async () => {
      if (!specimenRow) return null;
      const client = buildLabelPreviewFromSpecimen(specimenRow);
      let orderedTests: string[] = [];
      try {
        const parsed = JSON.parse(specimenRow.orderedTestsJson ?? "[]") as Array<{
          code?: string;
        }>;
        orderedTests = parsed.map((t) => t.code).filter(Boolean) as string[];
      } catch {
        /* ignore */
      }
      try {
        const res = await api.printPreview({
          accessionNumber: specimenRow.accessionNumber,
          patientName: client.patientName,
          barcode: specimenRow.barcode,
          orderedTests,
          specimenType: specimenRow.specimenType ?? "blood",
          mrn: client.mrn,
        });
        return { fields: res.fields, edgeFailed: false as const };
      } catch {
        return { fields: client, edgeFailed: true as const };
      }
    },
    enabled: Boolean(specimenRow),
    staleTime: 30_000,
  });

  const lookupError = useMemo(() => {
    if (!activeAccession.trim()) return null;
    if (specimensQ.isLoading) return null;
    if (specimensQ.isError) {
      return "Could not load specimens — is edge-engine running?";
    }
    if (specimensQ.isSuccess && !specimenRow) {
      return "Accession not found";
    }
    return null;
  }, [
    activeAccession,
    specimensQ.isLoading,
    specimensQ.isError,
    specimensQ.isSuccess,
    specimenRow,
  ]);

  const preview =
    testPreview ??
    edgePreviewQ.data?.fields ??
    clientPreview ??
    null;

  const previewWarning =
    edgePreviewQ.data?.edgeFailed && preview
      ? "Could not reach edge for ZPL preview — showing cached preview."
      : undefined;

  function selectAccession(acc: string) {
    const trimmed = acc.trim();
    setAccessionInput(trimmed);
    setActiveAccession(trimmed);
    setTestPreview(null);
    setPrintStatus(null);
    if (trimmed) {
      void navigate({ to: "/labels", search: { accession: trimmed } });
    } else {
      void navigate({ to: "/labels", search: {} });
    }
  }

  const reprintMutation = useMutation({
    mutationFn: (acc: string) =>
      api.reprintLabel({ accessionNumber: acc, copies }),
    onSuccess: (data) => {
      setTestPreview(null);
      setPrintStatus({ ok: data.ok, error: data.error });
    },
    onError: (err) => {
      setPrintStatus({
        ok: false,
        error: isPrintApiMissing(err)
          ? PRINT_API_UNAVAILABLE_MSG
          : "Reprint failed",
      });
    },
  });

  const testMutation = useMutation({
    mutationFn: () => api.printTestLabel(copies),
    onSuccess: (data) => {
      setActiveAccession("");
      setAccessionInput("");
      setTestPreview(data.fields);
      setPrintStatus({ ok: data.ok, error: data.error });
      void navigate({ to: "/labels", search: {} });
    },
    onError: (err) => {
      if (isPrintApiMissing(err)) {
        setActiveAccession("");
        setAccessionInput("");
        setTestPreview(TEST_LABEL_PREVIEW);
        setPrintStatus({
          ok: false,
          error: PRINT_API_UNAVAILABLE_MSG,
        });
        void navigate({ to: "/labels", search: {} });
        return;
      }
      setPrintStatus({ ok: false, error: "Test label print failed" });
    },
  });

  const scanHandlers = useScanInput((value) => {
    selectAccession(value);
  });

  const recent = (specimensQ.data ?? []).slice(0, 20);

  return (
    <AccessioningShell
      title="Labels"
      description="Reprint tube labels, verify accessions, and check printer alignment."
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="order-2 space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm lg:order-1">
          <label className="block space-y-1.5">
            <span className="flex items-center gap-2 text-sm font-medium">
              <ScanLine className="size-4" />
              Scan or enter accession
            </span>
            <Input
              value={accessionInput}
              onChange={(e) => setAccessionInput(e.target.value)}
              placeholder="Scan barcode or type accession…"
              autoComplete="off"
              autoFocus
              {...scanHandlers}
              onKeyDown={(e) => {
                scanHandlers.onKeyDown(e);
                if (e.key === "Enter" && !e.defaultPrevented) {
                  selectAccession(e.currentTarget.value);
                }
              }}
            />
          </label>

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              Copies
              <select
                className="h-9 rounded-md border border-border bg-background px-2"
                value={copies}
                onChange={(e) => setCopies(Number(e.target.value))}
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <Button
              type="button"
              disabled={!activeAccession.trim() || reprintMutation.isPending}
              onClick={() => reprintMutation.mutate(activeAccession.trim())}
            >
              {reprintMutation.isPending ? "Printing…" : "Reprint label"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={testMutation.isPending}
              onClick={() => testMutation.mutate()}
            >
              Test label
            </Button>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Recent registrations
            </p>
            <ul className="max-h-64 overflow-auto rounded-md border border-border divide-y divide-border">
              {specimensQ.isLoading && (
                <li className="px-3 py-2 text-sm text-muted-foreground">
                  Loading…
                </li>
              )}
              {!specimensQ.isLoading && recent.length === 0 && (
                <li className="px-3 py-3 text-sm text-muted-foreground">
                  No specimens yet.{" "}
                  <Link
                    to="/register"
                    className="font-medium text-foreground underline-offset-4 hover:underline"
                  >
                    Register a new specimen →
                  </Link>
                </li>
              )}
              {recent.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                    onClick={() => selectAccession(s.accessionNumber)}
                  >
                    <span>
                      <span className="font-mono font-medium">
                        {s.accessionNumber}
                      </span>
                      <span className="ml-2 text-muted-foreground">
                        {patientFromJson(s.patientJson)}
                      </span>
                    </span>
                    <Badge variant="muted">{s.status}</Badge>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="order-1 lg:order-2">
          <LabelPreviewPanel
            phase={preview ? "lookup" : "idle"}
            fields={preview}
            emptyContext="labels"
            loading={
              Boolean(specimenRow) &&
              edgePreviewQ.isFetching &&
              !edgePreviewQ.data
            }
            previewWarning={previewWarning}
            printStatus={printStatus}
            accessionNumber={preview?.accessionNumber}
            actions={
              preview && !lookupError ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    void navigate({
                      to: "/bench",
                      search: { q: preview.accessionNumber },
                    })
                  }
                >
                  Open in Bench
                </Button>
              ) : lookupError ? (
                <p className="text-xs text-lab-danger">{lookupError}</p>
              ) : undefined
            }
          />
        </div>
      </div>
    </AccessioningShell>
  );
}
