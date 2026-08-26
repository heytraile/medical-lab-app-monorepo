import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import {
  demographicKey,
  demographicsConflict,
  normalizeMrn,
  normalizeSex,
  type UpstreamPatient,
} from "./patient-normalize";

@Injectable()
export class PatientsImportService {
  private readonly logger = new Logger(PatientsImportService.name);

  constructor(private readonly prisma: PrismaService) {}

  async upsertFromUpstream(
    record: UpstreamPatient,
    source = "seed",
  ): Promise<{ id: string; status: string; action: string }> {
    const mrn = normalizeMrn(record.mrn);
    if (!mrn) {
      throw new Error("MRN is required");
    }

    const firstName = record.firstName.trim();
    const lastName = record.lastName.trim();
    const middleName = record.middleName?.trim() || null;
    const dateOfBirth = record.dateOfBirth?.trim() || null;
    const sex = normalizeSex(record.sex) || null;
    const externalId = record.externalId?.trim() || null;
    const rawImportJson = JSON.stringify(record);

    const existing = await this.prisma.patient.findUnique({ where: { mrn } });

    if (existing) {
      if (
        demographicsConflict(existing, {
          firstName,
          middleName,
          lastName,
          dateOfBirth,
          sex,
        })
      ) {
        // Same MRN, incompatible demographics → quarantine local row (not selectable)
        const quarantined = await this.prisma.patient.update({
          where: { id: existing.id },
          data: {
            status: "quarantined",
            rawImportJson: JSON.stringify({
              existingSnapshot: {
                firstName: existing.firstName,
                middleName: existing.middleName,
                lastName: existing.lastName,
                dateOfBirth: existing.dateOfBirth,
                sex: existing.sex,
              },
              rejectedConflict: record,
              reason: "same_mrn_demographics_conflict",
            }),
          },
        });
        this.logger.warn(
          `Quarantined MRN ${mrn} due to upstream demographic conflict`,
        );
        await this.recomputeSuspectGroups();
        return {
          id: quarantined.id,
          status: quarantined.status,
          action: "quarantined_conflict",
        };
      }

      const updated = await this.prisma.patient.update({
        where: { id: existing.id },
        data: {
          externalId: externalId ?? existing.externalId,
          firstName,
          middleName,
          lastName,
          dateOfBirth,
          sex,
          source,
          rawImportJson,
          // Compatible demographics heal a prior quarantine
          status: "active",
          // Upstream refresh does not flip a local provisional into upstream
          // unless it was already upstream-sourced.
          identityOrigin:
            existing.identityOrigin === "local_provisional"
              ? existing.identityOrigin
              : "upstream",
          syncStatus:
            existing.identityOrigin === "local_provisional"
              ? existing.syncStatus
              : "n_a",
        },
      });
      await this.recomputeSuspectGroups();
      return { id: updated.id, status: updated.status, action: "updated" };
    }

    const created = await this.prisma.patient.create({
      data: {
        mrn,
        externalId,
        firstName,
        middleName,
        lastName,
        dateOfBirth,
        sex,
        source,
        rawImportJson,
        status: "active",
        identityOrigin: "upstream",
        syncStatus: "n_a",
      },
    });
    await this.recomputeSuspectGroups();
    return { id: created.id, status: created.status, action: "created" };
  }

  async recomputeSuspectGroups() {
    const active = await this.prisma.patient.findMany({
      where: { status: "active" },
    });

    const byDemo = new Map<string, typeof active>();
    for (const p of active) {
      const key = demographicKey(p);
      // Skip incomplete demographics (can't safely cluster)
      if (!p.dateOfBirth || !normalizeSex(p.sex)) continue;
      const list = byDemo.get(key) ?? [];
      list.push(p);
      byDemo.set(key, list);
    }

    const updates: Array<{ id: string; suspectGroupId: string | null }> = [];

    for (const [, group] of byDemo) {
      const mrns = new Set(group.map((g) => g.mrn));
      if (mrns.size >= 2) {
        const groupId =
          group.find((g) => g.suspectGroupId)?.suspectGroupId ?? randomUUID();
        for (const g of group) {
          updates.push({ id: g.id, suspectGroupId: groupId });
        }
      } else {
        for (const g of group) {
          if (g.suspectGroupId) {
            updates.push({ id: g.id, suspectGroupId: null });
          }
        }
      }
    }

    // Clear suspects for anyone not in a multi-MRN demo group
    const touched = new Set(updates.map((u) => u.id));
    for (const p of active) {
      if (!touched.has(p.id) && p.suspectGroupId) {
        updates.push({ id: p.id, suspectGroupId: null });
      }
    }

    for (const u of updates) {
      await this.prisma.patient.update({
        where: { id: u.id },
        data: { suspectGroupId: u.suspectGroupId },
      });
    }
  }
}
