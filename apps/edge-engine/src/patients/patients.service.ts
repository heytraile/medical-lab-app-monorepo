import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SyncService } from "../sync/sync.service";
import { PatientsImportService } from "./patients-import.service";
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

@Injectable()
export class PatientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly imports: PatientsImportService,
    private readonly sync: SyncService,
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
