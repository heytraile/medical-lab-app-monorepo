import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { displayName } from "../patients/patient-normalize";

export type BenchPatientSummary = {
  id: string;
  mrn: string;
  displayName: string;
  /** Sent alongside displayName so the bench can sort by surname. */
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  sex: string | null;
  status: string;
  identityOrigin: string;
};

type PatientJsonSnapshot = {
  id?: string;
  mrn?: string;
  firstName?: string;
  middleName?: string | null;
  lastName?: string;
  dateOfBirth?: string | null;
  sex?: string | null;
  identityOrigin?: string;
  syncStatus?: string;
  status?: string;
};

@Injectable()
export class ResultsService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const rows = await this.prisma.result.findMany({
      orderBy: { observedAt: "desc" },
      take: 200,
      include: {
        specimen: {
          include: { patient: true },
        },
      },
    });

    return rows.map(({ specimen, ...result }) => ({
      ...result,
      patient: this.resolvePatient(specimen),
    }));
  }

  private resolvePatient(
    specimen:
      | {
          patientId: string | null;
          patientJson: string | null;
          patient: {
            id: string;
            mrn: string;
            firstName: string;
            middleName: string | null;
            lastName: string;
            dateOfBirth: string | null;
            sex: string | null;
            status: string;
            identityOrigin: string;
          } | null;
        }
      | null
      | undefined,
  ): BenchPatientSummary | null {
    if (!specimen) return null;

    if (specimen.patient) {
      const p = specimen.patient;
      return {
        id: p.id,
        mrn: p.mrn,
        displayName: displayName(p),
        firstName: p.firstName,
        lastName: p.lastName,
        dateOfBirth: p.dateOfBirth,
        sex: p.sex,
        status: p.status,
        identityOrigin: p.identityOrigin,
      };
    }

    return this.fromPatientJson(specimen.patientJson);
  }

  private fromPatientJson(
    raw: string | null | undefined,
  ): BenchPatientSummary | null {
    if (!raw) return null;
    try {
      const snap = JSON.parse(raw) as PatientJsonSnapshot;
      if (!snap.id || !snap.mrn) return null;
      const firstName = snap.firstName ?? "";
      const lastName = snap.lastName ?? "";
      return {
        id: snap.id,
        mrn: snap.mrn,
        displayName: displayName({
          firstName,
          middleName: snap.middleName,
          lastName,
        }),
        firstName,
        lastName,
        dateOfBirth: snap.dateOfBirth ?? null,
        sex: snap.sex ?? null,
        status: snap.status ?? "active",
        identityOrigin: snap.identityOrigin ?? "upstream",
      };
    } catch {
      return null;
    }
  }
}
