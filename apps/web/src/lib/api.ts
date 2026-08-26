const API_URL =
  (typeof import.meta !== "undefined" &&
    import.meta.env?.VITE_LIS_API_URL) ||
  "http://localhost:3101";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText} for ${path}`);
  }
  return res.json() as Promise<T>;
}

export type BenchResult = {
  id: string;
  accessionNumber: string;
  barcode: string;
  analyzerId: string;
  testCode: string;
  testName: string | null;
  value: string;
  units: string | null;
  flag: string;
  observedAt: string;
};

export type SpecimenRow = {
  id: string;
  accessionNumber: string;
  barcode: string;
  patientJson: string | null;
  status: string;
  registeredAt: string;
};

export type SyncStatus = {
  pending: number;
  syncing: number;
  acked: number;
  failed: number;
};

export const api = {
  health: () => request<{ ok: boolean; service: string }>("/health"),
  results: () => request<BenchResult[]>("/results"),
  specimens: () => request<SpecimenRow[]>("/specimens"),
  syncStatus: () => request<SyncStatus>("/sync/status"),
  registerSpecimen: (body: {
    patientName: string;
    orderedTests?: Array<{ code: string; name?: string }>;
    printLabel?: boolean;
  }) =>
    request<{
      specimen: SpecimenRow;
      printResult?: { ok: boolean; error?: string; zpl?: string };
    }>("/specimens", {
      method: "POST",
      body: JSON.stringify(body),
    }),
};

export function getWsBaseUrl() {
  return (
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_WS_URL) ||
    API_URL
  );
}
