import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(__dirname, "../../.env"), override: false });

import { createClient } from "@supabase/supabase-js";
import {
  buildBenchCloudAlignmentPlan,
  summarizeBenchCloudAlignment,
} from "../sync/bench-cloud-alignment.helpers";
import {
  defaultEdgeSqlitePath,
  loadEdgeBenchFromSqlite,
} from "../sync/edge-bench-loader";
import { repairSpecimenPatientLinks } from "../sync/repair-specimen-patient-links";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !key) {
    console.error(
      "[reconcile] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.",
    );
    process.exit(1);
  }

  const dbPath = defaultEdgeSqlitePath();
  const edgeRows = loadEdgeBenchFromSqlite(dbPath);
  const client = createClient(url, key);
  const { data: cloudRows, error } = await client
    .from("results")
    .select("id, edge_result_id, accession_number, test_code, status");
  if (error) {
    console.error("[reconcile] Failed to read cloud results:", error.message);
    process.exit(1);
  }

  const plan = buildBenchCloudAlignmentPlan(
    edgeRows,
    (cloudRows ?? []).map((row) => ({
      id: String(row.id),
      edge_result_id: (row.edge_result_id as string | null) ?? null,
      accession_number: String(row.accession_number ?? ""),
      test_code: String(row.test_code ?? ""),
      status: String(row.status ?? "pending_review"),
    })),
  );
  const summary = summarizeBenchCloudAlignment(
    edgeRows,
    (cloudRows ?? []).map((row) => ({
      id: String(row.id),
      edge_result_id: (row.edge_result_id as string | null) ?? null,
      accession_number: String(row.accession_number ?? ""),
      test_code: String(row.test_code ?? ""),
      status: String(row.status ?? "pending_review"),
    })),
    plan,
  );

  let patientLinksRepaired = 0;
  if (!dryRun) {
    patientLinksRepaired = await repairSpecimenPatientLinks(client);
  }

  if (dryRun || plan.aligned) {
    console.log(
      JSON.stringify(
        {
          mode: dryRun ? "dry-run" : "apply",
          edgeDb: dbPath,
          patientLinksRepaired,
          ...summary,
        },
        null,
        2,
      ),
    );
    process.exit(0);
  }

  const { data, error: rpcErr } = await client.rpc(
    "reconcile_bench_cloud_results",
    {
      p_delete_edge_result_ids: plan.deleteEdgeResultIds,
      p_delete_cloud_ids: plan.deleteCloudIds,
      p_reset_edge_result_ids: plan.resetEdgeResultIds,
    },
  );
  if (rpcErr) {
    console.error("[reconcile] RPC failed:", rpcErr.message);
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        mode: "apply",
        edgeDb: dbPath,
        patientLinksRepaired,
        issuesBefore: plan.issues.length,
        rpc: data,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(
    "[reconcile] Fatal:",
    err instanceof Error ? err.message : String(err),
  );
  process.exit(1);
});
