import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { ActorSnapshot } from "@drax-lis/contracts";
import { PrismaService } from "../prisma/prisma.service";
import { SyncService } from "../sync/sync.service";
import { PatientsImportService } from "./patients-import.service";
import { AuditService } from "../audit/audit.service";
import {
  displayName,
  normalizeMrn,
  normalizeSex,
} from "./patient-normalize";

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
  identityOrigin: string;
  syncStatus: string;
  suspectGroupId: string | null;
  requiresIdentityConfirmation: boolean;
  displayName: string;
  siblings: Array<{
    id: string;
    mrn: string;
    displayName: string;
  }>;
};

export type IdentityReviewListItem = {
  id: string;
  suspectGroupId: string;
  status: "pending" | "resolved_distinct" | "merged";
  flaggedAt: string;
  flaggedFromAccessionNumber: string | null;
  preferredSurvivorPatientId: string | null;
  patients: Array<{
    id: string;
    mrn: string;
    displayName: string;
    dateOfBirth: string | null;
    sex: string | null;
    status: string;
  }>;
  resolvedAt?: string | null;
  survivorPatientId?: string | null;
  loserPatientId?: string | null;
  resolutionNote?: string | null;
};

@Injectable()
export class PatientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly imports: PatientsImportService,
    private readonly sync: SyncService,
    private readonly audit: AuditService,
  ) {}

  async list(opts: {
    q?: string;
    includeQuarantined?: boolean;
  }): Promise<PatientListItem[]> {
    const q = opts.q?.trim();
    const patients = await this.prisma.patient.findMany({
      where: {
        ...(opts.includeQuarantined ? {} : { status: "active" }),
        ...(q
          ? {
              OR: [
                { mrn: { contains: q.toUpperCase().replace(/[\s._-]+/g, "") } },
                { firstName: { contains: q } },
                { lastName: { contains: q } },
                { middleName: { contains: q } },
                { externalId: { contains: q } },
              ],
            }
          : {}),
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: 50,
    });

    return this.toListItems(patients);
  }

  async get(id: string): Promise<PatientListItem> {
    const found = (await this.list({ includeQuarantined: true })).find(
      (p) => p.id === id,
    );
    if (found) return found;

    const p = await this.prisma.patient.findUnique({ where: { id } });
    if (!p) throw new NotFoundException(`Patient ${id} not found`);
    const items = await this.toListItems([p]);
    return items[0]!;
  }

  async createProvisional(input: {
    firstName: string;
    lastName: string;
    middleName?: string;
    dateOfBirth?: string;
    sex?: string;
  }): Promise<PatientListItem> {
    const firstName = input.firstName?.trim();
    const lastName = input.lastName?.trim();
    if (!firstName || !lastName) {
      throw new BadRequestException("firstName and lastName are required");
    }

    const middleName = input.middleName?.trim() || null;
    const dateOfBirth = input.dateOfBirth?.trim() || null;
    const sex = normalizeSex(input.sex) || null;
    const mrn = await this.allocateProvisionalMrn();

    const created = await this.prisma.patient.create({
      data: {
        mrn,
        firstName,
        middleName,
        lastName,
        dateOfBirth,
        sex,
        status: "active",
        identityOrigin: "local_provisional",
        syncStatus: "pending_upstream",
        source: "local_provisional",
        rawImportJson: JSON.stringify({
          ...input,
          provisionalMrn: mrn,
        }),
      },
    });

    await this.imports.recomputeSuspectGroups();

    await this.sync.enqueue({
      type: "patient.provisional_created",
      payload: {
        patientId: created.id,
        mrn: created.mrn,
        firstName: created.firstName,
        middleName: created.middleName,
        lastName: created.lastName,
        dateOfBirth: created.dateOfBirth,
        sex: created.sex,
        identityOrigin: created.identityOrigin,
        syncStatus: created.syncStatus,
        createdAt: created.createdAt.toISOString(),
      },
    });

    return this.get(created.id);
  }

  /**
   * Upsert a pending Identity review row when accession flags a possible duplicate.
   * One pending item per suspectGroupId.
   */
  async upsertPendingIdentityReview(input: {
    suspectGroupId: string;
    patientIds: string[];
    preferredSurvivorPatientId: string;
    flaggedFromAccessionNumber?: string | null;
    actor?: ActorSnapshot | null;
  }) {
    const patientIds = [...new Set(input.patientIds)].sort();
    if (patientIds.length < 2) return null;

    const existing = await this.prisma.identityReviewItem.findFirst({
      where: { suspectGroupId: input.suspectGroupId, status: "pending" },
    });

    const data = {
      patientIdsJson: JSON.stringify(patientIds),
      flaggedAt: new Date(),
      flaggedBy: input.actor?.userId ?? null,
      flaggedBySnapshot: input.actor ? JSON.stringify(input.actor) : null,
      flaggedFromAccessionNumber: input.flaggedFromAccessionNumber ?? null,
      preferredSurvivorPatientId: input.preferredSurvivorPatientId,
    };

    const row = existing
      ? await this.prisma.identityReviewItem.update({
          where: { id: existing.id },
          data,
        })
      : await this.prisma.identityReviewItem.create({
          data: {
            suspectGroupId: input.suspectGroupId,
            status: "pending",
            ...data,
          },
        });

    await this.audit.log({
      eventType: "identity_review.flagged",
      entityType: "identity_review",
      entityId: row.id,
      actor: input.actor ?? null,
      payload: {
        suspectGroupId: input.suspectGroupId,
        patientIds,
        preferredSurvivorPatientId: input.preferredSurvivorPatientId,
        flaggedFromAccessionNumber: input.flaggedFromAccessionNumber ?? null,
      },
    });

    return row;
  }

  async listIdentityReviews(opts?: {
    status?: "pending" | "resolved_distinct" | "merged" | "all";
  }): Promise<{ items: IdentityReviewListItem[]; pendingCount: number }> {
    const status = opts?.status ?? "pending";
    const [rows, pendingCount] = await Promise.all([
      this.prisma.identityReviewItem.findMany({
        where: status === "all" ? {} : { status },
        orderBy: { flaggedAt: "desc" },
        take: 100,
      }),
      this.prisma.identityReviewItem.count({ where: { status: "pending" } }),
    ]);

    const allIds = new Set<string>();
    for (const row of rows) {
      for (const id of JSON.parse(row.patientIdsJson) as string[]) {
        allIds.add(id);
      }
    }
    const patients = allIds.size
      ? await this.prisma.patient.findMany({
          where: { id: { in: [...allIds] } },
        })
      : [];
    const byId = new Map(patients.map((p) => [p.id, p]));

    const items: IdentityReviewListItem[] = rows.map((row) => {
      const ids = JSON.parse(row.patientIdsJson) as string[];
      return {
        id: row.id,
        suspectGroupId: row.suspectGroupId,
        status: row.status as IdentityReviewListItem["status"],
        flaggedAt: row.flaggedAt.toISOString(),
        flaggedFromAccessionNumber: row.flaggedFromAccessionNumber,
        preferredSurvivorPatientId: row.preferredSurvivorPatientId,
        patients: ids
          .map((id) => byId.get(id))
          .filter(Boolean)
          .map((p) => ({
            id: p!.id,
            mrn: p!.mrn,
            displayName: displayName(p!),
            dateOfBirth: p!.dateOfBirth,
            sex: p!.sex,
            status: p!.status,
          })),
        resolvedAt: row.resolvedAt?.toISOString() ?? null,
        survivorPatientId: row.survivorPatientId,
        loserPatientId: row.loserPatientId,
        resolutionNote: row.resolutionNote,
      };
    });

    return { items, pendingCount };
  }

  async resolveIdentityReviewDistinct(
    reviewItemId: string,
    actor: ActorSnapshot,
    note?: string,
  ): Promise<IdentityReviewListItem> {
    const row = await this.prisma.identityReviewItem.findUnique({
      where: { id: reviewItemId },
    });
    if (!row) throw new NotFoundException(`Review item ${reviewItemId} not found`);
    if (row.status !== "pending") {
      throw new BadRequestException(`Review item is already ${row.status}`);
    }

    await this.prisma.identityReviewItem.update({
      where: { id: row.id },
      data: {
        status: "resolved_distinct",
        resolvedAt: new Date(),
        resolvedBy: actor.userId,
        resolvedBySnapshot: JSON.stringify(actor),
        resolutionNote: note?.trim() || null,
      },
    });

    await this.audit.log({
      eventType: "identity_review.resolved_distinct",
      entityType: "identity_review",
      entityId: row.id,
      actor,
      payload: { suspectGroupId: row.suspectGroupId, note: note ?? null },
    });

    const listed = await this.listIdentityReviews({ status: "all" });
    const item = listed.items.find((i) => i.id === reviewItemId);
    if (!item) throw new NotFoundException(`Review item ${reviewItemId} not found`);
    return item;
  }

  async mergePatients(
    input: {
      survivorPatientId: string;
      loserPatientId: string;
      reviewItemId?: string;
      reason?: string;
    },
    actor: ActorSnapshot,
  ): Promise<{
    survivor: PatientListItem;
    loser: PatientListItem;
    specimensMoved: number;
    reviewItemId: string | null;
  }> {
    const survivorId = input.survivorPatientId.trim();
    const loserId = input.loserPatientId.trim();
    if (!survivorId || !loserId || survivorId === loserId) {
      throw new BadRequestException(
        "survivorPatientId and loserPatientId must be different patients",
      );
    }

    const [survivor, loser] = await Promise.all([
      this.prisma.patient.findUnique({ where: { id: survivorId } }),
      this.prisma.patient.findUnique({ where: { id: loserId } }),
    ]);
    if (!survivor) throw new NotFoundException(`Patient ${survivorId} not found`);
    if (!loser) throw new NotFoundException(`Patient ${loserId} not found`);
    if (survivor.status !== "active") {
      throw new BadRequestException(
        `Survivor ${survivor.mrn} must be active (is ${survivor.status})`,
      );
    }
    if (loser.status === "quarantined" && loser.suspectGroupId == null) {
      // Already merged/quarantined without an open suspect link — refuse double-merge noise
      const stillHasSpecimens = await this.prisma.specimen.count({
        where: { patientId: loser.id },
      });
      if (stillHasSpecimens === 0) {
        throw new BadRequestException(
          `Patient ${loser.mrn} is already quarantined with no specimens to move`,
        );
      }
    }

    if (input.reviewItemId) {
      const review = await this.prisma.identityReviewItem.findUnique({
        where: { id: input.reviewItemId },
      });
      if (!review) {
        throw new NotFoundException(`Review item ${input.reviewItemId} not found`);
      }
      if (review.status !== "pending") {
        throw new BadRequestException(`Review item is already ${review.status}`);
      }
    }

    const moved = await this.prisma.$transaction(async (tx) => {
      const specimens = await tx.specimen.findMany({
        where: { patientId: loser.id },
        select: { id: true, accessionNumber: true },
      });

      if (specimens.length) {
        await tx.specimen.updateMany({
          where: { patientId: loser.id },
          data: { patientId: survivor.id },
        });
      }

      await tx.patient.update({
        where: { id: loser.id },
        data: { status: "quarantined", suspectGroupId: null },
      });

      await tx.patient.update({
        where: { id: survivor.id },
        data: { status: "active" },
      });

      let reviewItemId: string | null = input.reviewItemId ?? null;
      if (reviewItemId) {
        await tx.identityReviewItem.update({
          where: { id: reviewItemId },
          data: {
            status: "merged",
            resolvedAt: new Date(),
            resolvedBy: actor.userId,
            resolvedBySnapshot: JSON.stringify(actor),
            survivorPatientId: survivor.id,
            loserPatientId: loser.id,
            resolutionNote: input.reason?.trim() || null,
          },
        });
      } else {
        const pendingRows = await tx.identityReviewItem.findMany({
          where: { status: "pending" },
          take: 50,
        });
        const pending = pendingRows.find((r) => {
          const ids = JSON.parse(r.patientIdsJson) as string[];
          return ids.includes(survivor.id) && ids.includes(loser.id);
        });
        if (pending) {
          reviewItemId = pending.id;
          await tx.identityReviewItem.update({
            where: { id: pending.id },
            data: {
              status: "merged",
              resolvedAt: new Date(),
              resolvedBy: actor.userId,
              resolvedBySnapshot: JSON.stringify(actor),
              survivorPatientId: survivor.id,
              loserPatientId: loser.id,
              resolutionNote: input.reason?.trim() || null,
            },
          });
        }
      }

      return {
        specimens,
        reviewItemId,
      };
    });

    await this.imports.recomputeSuspectGroups();

    await this.sync.enqueue({
      type: "patient.merged",
      payload: {
        survivorPatientId: survivor.id,
        survivorMrn: survivor.mrn,
        loserPatientId: loser.id,
        loserMrn: loser.mrn,
        accessionNumbers: moved.specimens.map((s) => s.accessionNumber),
        reviewItemId: moved.reviewItemId,
        reason: input.reason?.trim() || null,
        mergedBy: actor.userId,
        mergedBySnapshot: actor,
        mergedAt: new Date().toISOString(),
      },
    });

    await this.audit.log({
      eventType: "patient.merged",
      entityType: "patient",
      entityId: survivor.id,
      actor,
      payload: {
        survivorPatientId: survivor.id,
        survivorMrn: survivor.mrn,
        loserPatientId: loser.id,
        loserMrn: loser.mrn,
        specimensMoved: moved.specimens.length,
        reviewItemId: moved.reviewItemId,
        reason: input.reason?.trim() || null,
      },
    });

    return {
      survivor: await this.get(survivor.id),
      loser: await this.get(loser.id),
      specimensMoved: moved.specimens.length,
      reviewItemId: moved.reviewItemId,
    };
  }

  private async allocateProvisionalMrn(): Promise<string> {
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    for (let attempt = 0; attempt < 30; attempt++) {
      const suffix = String(Math.floor(Math.random() * 9000) + 1000);
      const mrn = normalizeMrn(`TEMP-${day}-${suffix}`);
      const exists = await this.prisma.patient.findUnique({ where: { mrn } });
      if (!exists) return mrn;
    }
    throw new BadRequestException("Could not allocate a provisional MRN");
  }

  private async toListItems(
    patients: Array<{
      id: string;
      mrn: string;
      externalId: string | null;
      firstName: string;
      middleName: string | null;
      lastName: string;
      dateOfBirth: string | null;
      sex: string | null;
      status: string;
      identityOrigin: string;
      syncStatus: string;
      suspectGroupId: string | null;
    }>,
  ): Promise<PatientListItem[]> {
    const groupIds = [
      ...new Set(
        patients
          .map((p) => p.suspectGroupId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    const siblingsByGroup = new Map<string, typeof patients>();
    if (groupIds.length) {
      const allInGroups = await this.prisma.patient.findMany({
        where: { suspectGroupId: { in: groupIds }, status: "active" },
      });
      for (const p of allInGroups) {
        if (!p.suspectGroupId) continue;
        const list = siblingsByGroup.get(p.suspectGroupId) ?? [];
        list.push(p);
        siblingsByGroup.set(p.suspectGroupId, list);
      }
    }

    return patients.map((p) => {
      const group = p.suspectGroupId
        ? (siblingsByGroup.get(p.suspectGroupId) ?? [])
        : [];
      return {
        id: p.id,
        mrn: p.mrn,
        externalId: p.externalId,
        firstName: p.firstName,
        middleName: p.middleName,
        lastName: p.lastName,
        dateOfBirth: p.dateOfBirth,
        sex: p.sex,
        status: p.status,
        identityOrigin: p.identityOrigin,
        syncStatus: p.syncStatus,
        suspectGroupId: p.suspectGroupId,
        requiresIdentityConfirmation: Boolean(
          p.suspectGroupId && group.length >= 2,
        ),
        displayName: displayName(p),
        siblings: group
          .filter((s) => s.id !== p.id)
          .map((s) => ({
            id: s.id,
            mrn: s.mrn,
            displayName: displayName(s),
          })),
      };
    });
  }
}
