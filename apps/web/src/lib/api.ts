import type {
  CatalogResponse,
  LabRequisition,
  PatientReportPayload,
  ReleaseQueueGroup,
  RegisterSpecimenRequest,
  RequisitionCreate,
  ReviewRequest,
  ReviewRequestCreate,
  StaffCollector,
  StaffMember,
  StaffMemberCreate,
  StaffMemberUpdate,
} from "@drax-lis/contracts";

export type { ReviewRequest, ReviewRequestCreate, CatalogResponse, LabRequisition };
export type { StaffCollector, StaffMember, StaffMemberCreate, StaffMemberUpdate };
export type { PatientReportPayload, ReleaseQueueGroup };

const EDGE_API_URL =
  (typeof import.meta !== "undefined" &&
    import.meta.env?.VITE_LIS_API_URL) ||
  "http://localhost:3101";

const CLOUD_API_URL =
  (typeof import.meta !== "undefined" &&
    import.meta.env?.VITE_CLOUD_API_URL) ||
  "http://localhost:3102";

export const isCloudMode =
  (typeof import.meta !== "undefined" &&
    import.meta.env?.VITE_LIS_MODE === "cloud") ||
  false;

const API_URL = isCloudMode ? CLOUD_API_URL : EDGE_API_URL;

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, statusText: string, path: string, body: unknown) {
    super(`${status} ${statusText} for ${path}`);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

let authTokenProvider: (() => string | null) | null = null;
let authRefreshProvider: (() => Promise<string | null>) | null = null;
let authInvalidatedHandler: (() => void) | null = null;

export function setAuthTokenProvider(fn: () => string | null) {
  authTokenProvider = fn;
}

/** Called from AuthProvider — refresh Supabase session and return a new access token. */
export function setAuthRefreshProvider(fn: () => Promise<string | null>) {
  authRefreshProvider = fn;
}

/** Called when cloud API rejects the session — clear stale local auth state. */
export function setAuthInvalidatedHandler(fn: () => void) {
  authInvalidatedHandler = fn;
}

async function fetchWithAuth(
  url: string,
  init: RequestInit & { auth?: boolean },
  retried = false,
): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  if (init.auth !== false) {
    const token = authTokenProvider?.();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(url, { ...init, headers });

  if (
    res.status === 401 &&
    init.auth !== false &&
    !retried &&
    authRefreshProvider
  ) {
    const fresh = await authRefreshProvider();
    if (fresh) {
      headers.Authorization = `Bearer ${fresh}`;
      const retry = await fetch(url, { ...init, headers });
      if (retry.ok || retry.status !== 401) return retry;
    }
    authInvalidatedHandler?.();
  }

  return res;
}

async function request<T>(
  path: string,
  init?: RequestInit & { baseUrl?: string; auth?: boolean },
): Promise<T> {
  const base = init?.baseUrl ?? API_URL;
  const { baseUrl: _b, auth: _a, ...rest } = init ?? {};
  const res = await fetchWithAuth(`${base}${path}`, {
    ...rest,
    auth: init?.auth,
  });
  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    throw new ApiError(res.status, res.statusText, path, body);
  }
  return res.json() as Promise<T>;
}

export type BenchPatientSummary = {
  id: string;
  mrn: string;
  displayName: string;
  /** Optional: older edge builds only sent displayName. */
  firstName?: string;
  lastName?: string;
  dateOfBirth: string | null;
  sex: string | null;
  status: string;
  identityOrigin: string;
};

export type BenchResult = {
  id: string;
  accessionNumber: string;
  barcode: string;
  analyzerId: string;
  testCode: string;
  instrumentTestCode?: string | null;
  testName: string | null;
  value: string;
  units: string | null;
  referenceLow?: number | null;
  referenceHigh?: number | null;
  flag: string;
  status?: string;
  observedAt: string;
  /** False when result catalog code was not on the accession order. */
  expectedOnOrder?: boolean;
  patient?: BenchPatientSummary | null;
};

export type CloudResult = {
  id: string;
  edge_result_id?: string | null;
  accession_number: string;
  barcode: string;
  analyzer_id: string;
  test_code: string;
  test_name?: string | null;
  value: string;
  units?: string | null;
  reference_low?: number | null;
  reference_high?: number | null;
  flag: string;
  status: string;
  urgency?: string | null;
  observed_at: string;
  released_by?: string | null;
  released_at?: string | null;
};

export type AnalyzerStatus = {
  analyzerId: string;
  transport: "tcp" | "serial";
  protocol: string;
  listening: boolean;
  listenTarget?: string;
  lastConnectAt?: string;
  lastMessageAt?: string;
  lastAccession?: string;
  lastParseError?: string;
  connectedClients: number;
};

export type SyncStatus = {
  pending: number;
  syncing: number;
  acked: number;
  failed: number;
};

export type SpecimenRow = {
  id: string;
  accessionNumber: string;
  barcode: string;
  patientId?: string | null;
  patientJson: string | null;
  identityConfirmationJson?: string | null;
  specimenType?: string;
  orderedTestsJson?: string;
  requisitionId?: string | null;
  status: string;
  registeredAt: string;
};

export type LabelPreviewFields = {
  accessionNumber: string;
  patientName: string;
  barcode: string;
  dateOfBirth: string;
  orderedTests: string;
  specimenType: string;
  mrn?: string;
  printedAt: string;
  widthDots?: number;
  heightDots?: number;
};

export type PrintResult = {
  ok: boolean;
  error?: string;
  zpl?: string;
  copies?: number;
  fields?: LabelPreviewFields;
};

export type PatientListItem = {
  id: string;
  mrn: string;
  externalId: string | null;
  firstName: string;
  middleName: string | null;
  lastName: string;
  dateOfBirth: string | null;
  sex: string | null;
  status: string;
  identityOrigin?: string;
  syncStatus?: string;
  suspectGroupId: string | null;
  requiresIdentityConfirmation: boolean;
  displayName: string;
  siblings: Array<{
    id: string;
    mrn: string;
    displayName: string;
  }>;
};

export type IdentityConfirmation = {
  decision: "distinct_people" | "possible_duplicate_acknowledged";
  suspectGroupId: string;
  confirmedAt?: string;
  confirmedBy?: string;
};

export type IdentityConfirmationRequired = {
  statusCode: 409;
  error: "IDENTITY_CONFIRMATION_REQUIRED";
  message: string;
  patient: {
    id: string;
    mrn: string;
    displayName: string;
    dateOfBirth: string | null;
    sex: string | null;
    suspectGroupId: string | null;
  };
  siblings: Array<{
    id: string;
    mrn: string;
    displayName: string;
    dateOfBirth: string | null;
    sex: string | null;
  }>;
};

export type CreatePatientBody = {
  firstName: string;
  lastName: string;
  middleName?: string;
  dateOfBirth?: string;
  sex?: "M" | "F" | "O" | "U";
};

export const api = {
  health: () =>
    request<{ ok: boolean; service: string }>("/health", { auth: false }),
  results: () => request<BenchResult[]>("/results", { auth: false }),
  specimens: () => request<SpecimenRow[]>("/specimens", { auth: false }),
  syncStatus: () => request<SyncStatus>("/sync/status", { auth: false }),
  analyzerStatus: () =>
    request<AnalyzerStatus[]>("/analyzers/status", { auth: false }),
  patients: (q?: string) => {
    const qs = q?.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
    return request<PatientListItem[]>(`/patients${qs}`, { auth: false });
  },
  patient: (id: string) =>
    request<PatientListItem>(`/patients/${encodeURIComponent(id)}`, {
      auth: false,
    }),
  createPatient: (body: CreatePatientBody) =>
    request<PatientListItem>("/patients", {
      method: "POST",
      body: JSON.stringify(body),
      auth: false,
    }),
  seedPatients: () =>
    request<{ seeded: boolean; processed: number }>("/patients/seed", {
      method: "POST",
      auth: false,
    }),
  registerSpecimen: (body: RegisterSpecimenRequest) =>
    request<{
      specimen: SpecimenRow;
      printResult?: PrintResult;
      labelPreview?: LabelPreviewFields;
    }>("/specimens", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  printStatus: () =>
    request<{ ok: boolean; host: string; port: number; error?: string }>(
      "/print/status",
      { auth: false },
    ),
  printPreview: (body: {
    accessionNumber: string;
    patientName: string;
    barcode?: string;
    dateOfBirth?: string | null;
    orderedTests?: string[];
    specimenType?: string;
    mrn?: string;
  }) =>
    request<{ zpl: string; fields: LabelPreviewFields }>("/print/preview", {
      method: "POST",
      body: JSON.stringify(body),
      auth: false,
    }),
  printLabel: (body: {
    accessionNumber: string;
    patientName: string;
    barcode?: string;
    dateOfBirth?: string | null;
    orderedTests?: string[];
    specimenType?: string;
    mrn?: string;
    copies?: number;
  }) =>
    request<PrintResult & { fields: LabelPreviewFields }>("/print/label", {
      method: "POST",
      body: JSON.stringify(body),
      auth: false,
    }),
  reprintLabel: (body: { accessionNumber: string; copies?: number }) =>
    request<PrintResult & { fields: LabelPreviewFields; specimenId?: string }>(
      "/print/reprint",
      {
        method: "POST",
        body: JSON.stringify(body),
        auth: false,
      },
    ),
  printTestLabel: (copies?: number) =>
    request<PrintResult & { fields: LabelPreviewFields }>("/print/test", {
      method: "POST",
      body: JSON.stringify({ copies: copies ?? 1 }),
      auth: false,
    }),

  /** Cloud APIs (JWT / dev token required) */
  cloudResults: (status?: string) => {
    const qs = status ? `?status=${encodeURIComponent(status)}` : "";
    return request<CloudResult[]>(`/cloud/results${qs}`, {
      baseUrl: CLOUD_API_URL,
      auth: true,
    });
  },
  releaseQueue: () =>
    request<ReleaseQueueGroup[]>("/cloud/release-queue", {
      baseUrl: CLOUD_API_URL,
      auth: true,
    }),
  cloudSpecimens: () =>
    request<unknown[]>("/cloud/specimens", {
      baseUrl: CLOUD_API_URL,
      auth: true,
    }),
  releaseResult: (id: string) =>
    request<CloudResult>(`/results/${id}/release`, {
      method: "POST",
      baseUrl: CLOUD_API_URL,
      auth: true,
    }),
  releaseAccession: (accessionNumber: string) =>
    request<{ accessionNumber: string; releasedCount: number; resultIds: string[] }>(
      "/results/release-accession",
      {
        method: "POST",
        baseUrl: CLOUD_API_URL,
        auth: true,
        body: JSON.stringify({ accessionNumber }),
      },
    ),
  patientReport: (edgePatientId: string) =>
    request<PatientReportPayload>(
      `/cloud/patients/${encodeURIComponent(edgePatientId)}/report`,
      {
        baseUrl: CLOUD_API_URL,
        auth: true,
      },
    ),
  submitResults: (body: { accessionNumbers?: string[]; patientId?: string }) =>
    request<{ submitted: number; accessionNumbers: string[] }>(
      "/results/submit",
      {
        method: "POST",
        body: JSON.stringify(body),
        auth: true,
      },
    ),
  recallResults: (body: { accessionNumbers: string[]; reason?: string }) =>
    request<{ recalled: number; accessionNumbers: string[] }>(
      "/results/recall",
      {
        method: "POST",
        body: JSON.stringify(body),
        auth: true,
      },
    ),
  markAccessionReleased: (accessionNumber: string) =>
    request<{ accessionNumber: string; releasedCount: number; resultIds: string[] }>(
      "/results/mark-released",
      {
        method: "POST",
        body: JSON.stringify({ accessionNumber }),
        auth: true,
      },
    ),
  drainSync: () =>
    request<{ ok: boolean }>("/sync/drain", {
      method: "POST",
      auth: false,
    }),
  emailPatientReport: (
    edgePatientId: string,
    body: {
      to: string;
      recipientType: "doctor" | "patient";
      pageSize?: "letter" | "legal";
      message?: string;
    },
  ) =>
    request<{ ok: boolean }>(
      `/cloud/patients/${encodeURIComponent(edgePatientId)}/report/email`,
      {
        method: "POST",
        body: JSON.stringify(body),
        baseUrl: CLOUD_API_URL,
        auth: true,
      },
    ),

  /** Review requests — the bench asking an authorizer to sign off. */
  listReviewRequests: (openOnly?: boolean) =>
    request<ReviewRequest[]>(
      `/review-requests${openOnly ? "?open=true" : ""}`,
      { baseUrl: CLOUD_API_URL, auth: true },
    ),
  createReviewRequest: (body: ReviewRequestCreate) =>
    request<ReviewRequest>("/review-requests", {
      method: "POST",
      body: JSON.stringify(body),
      baseUrl: CLOUD_API_URL,
      auth: true,
    }),
  acknowledgeReviewRequest: (id: string) =>
    request<ReviewRequest>(`/review-requests/${id}/ack`, {
      method: "POST",
      baseUrl: CLOUD_API_URL,
      auth: true,
    }),

  /** Test catalog + requisitions (cloud). */
  getCatalog: () =>
    request<CatalogResponse>("/catalog", {
      baseUrl: CLOUD_API_URL,
      auth: false,
    }),
  createRequisition: (body: RequisitionCreate) =>
    request<LabRequisition>("/requisitions", {
      method: "POST",
      body: JSON.stringify(body),
      baseUrl: CLOUD_API_URL,
      auth: true,
    }),
  linkRequisition: (
    id: string,
    body: { accessionNumber: string; edgeSpecimenId: string },
  ) =>
    request<LabRequisition>(`/requisitions/${id}/link`, {
      method: "PATCH",
      body: JSON.stringify(body),
      baseUrl: CLOUD_API_URL,
      auth: true,
    }),
  getRequisitionByAccession: (accession: string) =>
    request<LabRequisition | null>(
      `/requisitions?accession=${encodeURIComponent(accession)}`,
      { baseUrl: CLOUD_API_URL, auth: true },
    ),

  listCollectors: () =>
    request<StaffCollector[]>("/lab/staff/collectors", {
      baseUrl: CLOUD_API_URL,
      auth: true,
    }),
  listStaff: () =>
    request<StaffMember[]>("/lab/staff", {
      baseUrl: CLOUD_API_URL,
      auth: true,
    }),
  createStaff: (body: StaffMemberCreate) =>
    request<StaffMember>("/lab/staff", {
      method: "POST",
      body: JSON.stringify(body),
      baseUrl: CLOUD_API_URL,
      auth: true,
    }),
  updateStaff: (id: string, body: StaffMemberUpdate) =>
    request<StaffMember>(`/lab/staff/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
      baseUrl: CLOUD_API_URL,
      auth: true,
    }),
};

export function getWsBaseUrl() {
  return (
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_WS_URL) ||
    EDGE_API_URL
  );
}

export function isIdentityConfirmationRequired(
  err: unknown,
): err is ApiError & { body: IdentityConfirmationRequired } {
  if (!(err instanceof ApiError) || err.status !== 409) return false;
  const body = err.body as IdentityConfirmationRequired | null;
  return body?.error === "IDENTITY_CONFIRMATION_REQUIRED";
}
