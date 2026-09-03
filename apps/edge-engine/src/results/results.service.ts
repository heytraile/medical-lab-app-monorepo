import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  ActorSnapshot,
  RecallAccessionRequest,
  ReleaseAccessionRequest,
  SubmitResultsRequest,
} from "@drax-lis/contracts";
import {
  isResultExpectedOnOrder,
  parseOrderedTestCodes,
} from "@drax-lis/catalog";
import { PrismaService } from "../prisma/prisma.service";
import { SyncService } from "../sync/sync.service";
import { AuditService } from "../audit/audit.service";
import { displayName } from "../patients/patient-normalize";

export type BenchPatientSummary = {
  id: string;
  mrn: string;
  displayName: string;
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly sync: SyncService,
    private readonly audit: AuditService,
  ) {}

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

    return rows.map(({ specimen, ...result }) => {
      const orderedCodes = parseOrderedTestCodes(specimen?.orderedTestsJson);
      return {
        ...result,
        expectedOnOrder: isResultExpectedOnOrder(result.testCode, orderedCodes),
        patient: this.resolvePatient(specimen),
      };
    });
  }

  async submitForRelease(
    body: SubmitResultsRequest,
    actor: ActorSnapshot,
  ) {
    const accessionNumbers = await this.resolveAccessions(body);
    if (accessionNumbers.length === 0) {
      throw new BadRequestException("No accession numbers to submit");
    }

    const candidates = await this.prisma.result.findMany({
      where: {
        accessionNumber: { in: accessionNumbers },
        status: { in: ["pending_review", "pending_authorization"] },
      },
    });

    if (candidates.length === 0) {
      throw new NotFoundException(
        "No pending results found for those accessions",
      );
    }

    const now = new Date();
    const snapshotJson = JSON.stringify(actor);
    const toPromote = candidates.filter((r) => r.status === "pending_review");

    if (toPromote.length > 0) {
      await this.prisma.result.updateMany({
        where: {
          id: { in: toPromote.map((r) => r.id) },
          status: "pending_review",
        },
        data: {
          status: "pending_authorization",
          submittedAt: now,
          submittedBy: actor.userId,
          submittedBySnapshot: snapshotJson,
        },
      });
    }

    const updated = await this.prisma.result.findMany({
      where: { id: { in: candidates.map((r) => r.id) } },
    });

    const specimens = await this.prisma.specimen.findMany({
      where: { accessionNumber: { in: accessionNumbers } },
      include: { patient: true },
    });

    const specimensByAccession: Record<string, unknown> = {};
    for (const spec of specimens) {
      const patientSummary = this.resolvePatient(spec);
      let registeredBySnapshot: unknown = null;
      if (spec.registeredBySnapshot) {
        try {
          registeredBySnapshot = JSON.parse(spec.registeredBySnapshot);
        } catch {
          registeredBySnapshot = null;
        }
      }
      specimensByAccession[spec.accessionNumber] = {
        barcode: spec.barcode,
        patientId: spec.patientId,
        patient: patientSummary
          ? {
              id: patientSummary.id,
              mrn: patientSummary.mrn,
              firstName: patientSummary.firstName,
              middleName: spec.patient?.middleName ?? null,
              lastName: patientSummary.lastName,
              dateOfBirth: patientSummary.dateOfBirth,
              sex: patientSummary.sex,
              identityOrigin: patientSummary.identityOrigin,
              status: patientSummary.status,
            }
          : null,
        registeredBy: spec.registeredBy,
        registeredBySnapshot,
        registeredAt: spec.registeredAt.toISOString(),
      };
    }

    await this.sync.enqueue({
      type: "result.submitted",
      payload: {
        accessionNumbers,
        submittedBy: actor.userId,
        submittedBySnapshot: actor,
        submittedAt: now.toISOString(),
        results: updated.map((r) => this.toSubmittedSyncRow(r)),
        specimensByAccession,
      },
    });

    await this.audit.log({
      eventType: "result.submitted_for_release",
      entityType: "accession",
      entityId: accessionNumbers.join(","),
      actor,
      payload: {
        accessionNumbers,
        resultCount: updated.length,
        resultIds: updated.map((r) => r.id),
        resyncOnly: toPromote.length === 0,
      },
    });

    return {
      submitted: updated.length,
      accessionNumbers,
      results: updated,
    };
  }

  async recallFromRelease(body: RecallAccessionRequest, actor: ActorSnapshot) {
    const accessionNumbers = [
      ...new Set(body.accessionNumbers.map((a) => a.trim())),
    ].filter(Boolean);
    if (accessionNumbers.length === 0) {
      throw new BadRequestException("No accession numbers to recall");
    }

    const candidates = await this.prisma.result.findMany({
      where: {
        accessionNumber: { in: accessionNumbers },
        status: "pending_authorization",
      },
    });

    if (candidates.length === 0) {
      throw new NotFoundException(
        "No submitted results found for those accessions",
      );
    }

    const now = new Date();
    await this.prisma.result.updateMany({
      where: {
        id: { in: candidates.map((r) => r.id) },
        status: "pending_authorization",
      },
      data: {
        status: "pending_review",
        submittedAt: null,
        submittedBy: null,
        submittedBySnapshot: null,
      },
    });

    const isAuthorizerReject =
      actor.role === "authorizer" || actor.role === "admin";
    const auditEventType = isAuthorizerReject
      ? "result.accession_rejected"
      : "result.accession_recalled";

    await this.sync.enqueue({
      type: "result.recalled",
      payload: {
        accessionNumbers,
        reason: body.reason ?? null,
        recalledBy: actor.userId,
        recalledBySnapshot: actor,
        recalledAt: now.toISOString(),
      },
    });

    await this.audit.log({
      eventType: auditEventType,
      entityType: "accession",
      entityId: accessionNumbers.join(","),
      actor,
      payload: {
        accessionNumbers,
        resultCount: candidates.length,
        resultIds: candidates.map((r) => r.id),
        reason: body.reason ?? null,
      },
    });

    return {
      recalled: candidates.length,
      accessionNumbers,
    };
  }

  async markAccessionReleased(
    body: ReleaseAccessionRequest,
    actor: ActorSnapshot,
  ) {
    const accession = body.accessionNumber.trim();
    if (!accession) {
      throw new BadRequestException("Accession number required");
    }

    const candidates = await this.prisma.result.findMany({
      where: {
        accessionNumber: accession,
        status: "pending_authorization",
      },
    });

    if (candidates.length === 0) {
      throw new NotFoundException(
        "No pending authorization results found for accession",
      );
    }

    const now = new Date();
    const snapshotJson = JSON.stringify(actor);
    await this.prisma.result.updateMany({
      where: {
        id: { in: candidates.map((r) => r.id) },
        status: "pending_authorization",
      },
      data: {
        status: "released",
        releasedAt: now,
        releasedBy: actor.userId,
        releasedBySnapshot: snapshotJson,
        submittedAt: null,
        submittedBy: null,
        submittedBySnapshot: null,
      },
    });

    await this.audit.log({
      eventType: "result.accession_released",
      entityType: "accession",
      entityId: accession,
      actor,
      payload: {
        accessionNumber: accession,
        resultCount: candidates.length,
        resultIds: candidates.map((r) => r.id),
        edgeMirror: true,
      },
    });

    return {
      accessionNumber: accession,
      releasedCount: candidates.length,
      resultIds: candidates.map((r) => r.id),
    };
  }

  private toSubmittedSyncRow(r: {
    id: string;
    accessionNumber: string;
    barcode: string;
    analyzerId: string;
    testCode: string;
    testName: string | null;
    value: string;
    units: string | null;
    referenceLow: number | null;
    referenceHigh: number | null;
    flag: string;
    status: string;
    observedAt: Date;
  }) {
    return {
      id: r.id,
      testCode: r.testCode,
      testName: r.testName,
      value: r.value,
      units: r.units,
      referenceLow: r.referenceLow,
      referenceHigh: r.referenceHigh,
      flag: r.flag,
      status: "pending_authorization",
      observedAt: r.observedAt.toISOString(),
      accessionNumber: r.accessionNumber,
      barcode: r.barcode,
      analyzerId: r.analyzerId,
    };
  }

  private async resolveAccessions(body: SubmitResultsRequest): Promise<string[]> {
    if (body.accessionNumbers?.length) {
      return [...new Set(body.accessionNumbers.map((a) => a.trim()))].filter(
        Boolean,
      );
    }
    if (body.patientId) {
      const specimens = await this.prisma.specimen.findMany({
        where: { patientId: body.patientId },
        select: { accessionNumber: true },
      });
      return specimens.map((s) => s.accessionNumber);
    }
    throw new BadRequestException(
      "Provide accessionNumbers or patientId",
    );
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
