import type { SupabaseClient } from "@supabase/supabase-js";
import { loadEdgeAccessionsFromSqlite } from "./edge-bench-loader";

/** Re-point cloud specimens/patients at the current edge bench after a reseed. */
export async function repairSpecimenPatientLinks(
  client: SupabaseClient,
): Promise<number> {
  let repaired = 0;

  for (const accession of loadEdgeAccessionsFromSqlite()) {
    if (!accession.accessionNumber || !accession.patientId) continue;

    const { data: cloudSpec } = await client
      .from("specimens")
      .select("accession_number")
      .eq("accession_number", accession.accessionNumber)
      .maybeSingle();
    if (!cloudSpec) continue;

    const edgePatientId = accession.patientId;
    const mrn = String(accession.mrn ?? `EDGE-${edgePatientId.slice(0, 8)}`);
    const patientPatch = {
      edge_patient_id: edgePatientId,
      mrn,
      first_name: String(accession.firstName ?? "Unknown"),
      middle_name: accession.middleName,
      last_name: String(accession.lastName ?? ""),
      date_of_birth: accession.dateOfBirth,
      sex: accession.sex,
      identity_origin: accession.identityOrigin ?? "upstream",
      sync_status: accession.syncStatus ?? "n_a",
      status: "active",
      updated_at: new Date().toISOString(),
    };
    const patientJson = {
      id: edgePatientId,
      mrn,
      firstName: patientPatch.first_name,
      middleName: patientPatch.middle_name,
      lastName: patientPatch.last_name,
      dateOfBirth: patientPatch.date_of_birth,
      sex: patientPatch.sex,
      identityOrigin: patientPatch.identity_origin,
      syncStatus: patientPatch.sync_status,
      status: "active",
    };

    let patientUuid: string | null = null;
    const { data: byEdge } = await client
      .from("patients")
      .select("id")
      .eq("edge_patient_id", edgePatientId)
      .maybeSingle();
    if (byEdge?.id) {
      patientUuid = byEdge.id as string;
    } else {
      const { data: byMrn } = await client
        .from("patients")
        .select("id")
        .eq("mrn", mrn)
        .maybeSingle();
      if (byMrn?.id) {
        const { error: updateErr } = await client
          .from("patients")
          .update(patientPatch)
          .eq("id", byMrn.id);
        if (updateErr) throw updateErr;
        patientUuid = byMrn.id as string;
      } else {
        const { data: inserted, error: insertErr } = await client
          .from("patients")
          .upsert(patientPatch, { onConflict: "edge_patient_id" })
          .select("id")
          .single();
        if (insertErr) throw insertErr;
        patientUuid = inserted.id as string;
      }
    }

    const { error: specErr } = await client.from("specimens").upsert(
      {
        accession_number: accession.accessionNumber,
        barcode: accession.barcode,
        patient_id: patientUuid,
        patient_json: patientJson,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "accession_number" },
    );
    if (specErr) throw specErr;
    repaired += 1;
  }

  return repaired;
}
