import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { EdgeBenchRow } from "./bench-cloud-alignment.helpers";

const EDGE_RESULT_QUERY =
  "SELECT id, accessionNumber, testCode, status FROM Result";

const EDGE_ACCESSION_QUERY = `
  SELECT
    a.accessionNumber,
    COALESCE(
      (SELECT s.barcode FROM Specimen s WHERE s.accessionId = a.id LIMIT 1),
      a.accessionNumber
    ) AS barcode,
    a.patientId,
    p.mrn,
    p.firstName,
    p.middleName,
    p.lastName,
    p.dateOfBirth,
    p.sex,
    p.identityOrigin,
    p.syncStatus,
    a.registeredAt
  FROM Accession a
  LEFT JOIN Patient p ON p.id = a.patientId
`;

export type EdgeAccessionRow = {
  accessionNumber: string;
  barcode: string;
  patientId: string | null;
  mrn: string | null;
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  dateOfBirth: string | null;
  sex: string | null;
  identityOrigin: string | null;
  syncStatus: string | null;
  registeredAt: string | null;
};

export function defaultEdgeSqlitePath(): string {
  const configured = process.env.EDGE_SQLITE_PATH?.trim();
  if (configured) return resolve(configured);

  const candidates = [
    resolve(process.cwd(), "apps/edge-engine/prisma/dev.db"),
    resolve(process.cwd(), "../edge-engine/prisma/dev.db"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return candidates[0]!;
}

export function loadEdgeBenchFromSqlite(dbPath?: string): EdgeBenchRow[] {
  const path = dbPath?.trim() || defaultEdgeSqlitePath();
  if (!existsSync(path)) {
    throw new Error(`Edge SQLite database not found at ${path}`);
  }

  const output = execFileSync(
    "sqlite3",
    ["-json", path, EDGE_RESULT_QUERY],
    { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  ).trim();

  if (!output) return [];

  const rows = JSON.parse(output) as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    id: String(row.id ?? ""),
    accessionNumber: String(row.accessionNumber ?? ""),
    testCode: String(row.testCode ?? ""),
    status: String(row.status ?? "pending_review"),
  }));
}

export function loadEdgeAccessionsFromSqlite(
  dbPath?: string,
): EdgeAccessionRow[] {
  const path = dbPath?.trim() || defaultEdgeSqlitePath();
  if (!existsSync(path)) {
    throw new Error(`Edge SQLite database not found at ${path}`);
  }

  const output = execFileSync(
    "sqlite3",
    ["-json", path, EDGE_ACCESSION_QUERY],
    { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  ).trim();

  if (!output) return [];

  const rows = JSON.parse(output) as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    accessionNumber: String(row.accessionNumber ?? ""),
    barcode: String(row.barcode ?? row.accessionNumber ?? ""),
    patientId: row.patientId ? String(row.patientId) : null,
    mrn: row.mrn ? String(row.mrn) : null,
    firstName: row.firstName ? String(row.firstName) : null,
    middleName: row.middleName ? String(row.middleName) : null,
    lastName: row.lastName ? String(row.lastName) : null,
    dateOfBirth: row.dateOfBirth ? String(row.dateOfBirth) : null,
    sex: row.sex ? String(row.sex) : null,
    identityOrigin: row.identityOrigin ? String(row.identityOrigin) : null,
    syncStatus: row.syncStatus ? String(row.syncStatus) : null,
    registeredAt: row.registeredAt ? String(row.registeredAt) : null,
  }));
}

export async function loadEdgeBenchFromApi(
  edgeUrl: string,
): Promise<EdgeBenchRow[]> {
  const response = await fetch(`${edgeUrl.replace(/\/$/, "")}/results`, {
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) {
    throw new Error(`GET /results returned ${response.status}`);
  }
  const rows = (await response.json()) as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    id: String(row.id ?? ""),
    accessionNumber: String(row.accessionNumber ?? ""),
    testCode: String(row.testCode ?? ""),
    status: String(row.status ?? "pending_review"),
  }));
}
