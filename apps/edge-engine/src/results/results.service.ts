import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  ActorSnapshot,
  ManualResultEntry,
  RecallAccessionRequest,
  ReleaseAccessionRequest,
  SubmitResultsRequest,
} from "@drax-lis/contracts";
import {
  getCatalogDisplayName,
  getTestResultRequirement,
  isResultExpectedOnOrder,
  missingManualResultRequirements,
  normalizeCode,
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
        expectedOnOrder: isResultExpectedOnOrder(
          result.orderedTestCode ?? result.testCode,
          orderedCodes,
        ),
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

    const allAccessionResults = await this.prisma.result.findMany({
      where: {
        accessionNumber: { in: accessionNumbers },
      },
    });
    const candidates = allAccessionResults.filter((result) =>
      ["pending_review", "pending_authorization"].includes(result.status),
    );

    if (candidates.length === 0) {
      throw new NotFoundException(
        "No pending results found for those accessions",
      );
    }

    const specimens = await this.prisma.specimen.findMany({
      where: { accessionNumber: { in: accessionNumbers } },
      include: { patient: true },
    });
    const missingExpectedByAccession: Record<string, unknown[]> = {};
    for (const specimen of specimens) {
      missingExpectedByAccession[specimen.accessionNumber] =
        missingManualResultRequirements(
          parseOrderedTestCodes(specimen.orderedTestsJson),
          allAccessionResults.filter(
            (result) =>
              result.accessionNumber === specimen.accessionNumber &&
              result.status !== "cancelled",
          ),
        );
    }
    const missingCount = Object.values(missingExpectedByAccession).reduce(
      (total, rows) => total + rows.length,
      0,
    );
    if (missingCount > 0 && !body.acknowledgeMissingManual) {
      throw new BadRequestException({
        message:
          "Manual results are still required. Review them or choose Submit anyway.",
        code: "MISSING_EXPECTED_RESULTS",
        missingExpectedByAccession,
      });
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

    const specimensByAccession: Record<string, unknown> = {};
    for (const spec of specimens) {
      const missingSnapshot =
        missingExpectedByAccession[spec.accessionNumber] ?? [];
      await this.prisma.specimen.update({
        where: { accessionNumber: spec.accessionNumber },
        data: {
          submitMissingExpectedJson: JSON.stringify(missingSnapshot),
        },
      });
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
        orderedTestsJson: spec.orderedTestsJson,
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
        missingExpectedByAccession,
        incompleteAcknowledged: missingCount > 0,
        incompleteAcknowledgedAt:
          missingCount > 0 ? now.toISOString() : null,
        incompleteAcknowledgedBy:
          missingCount > 0 ? actor : null,
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
        missingExpectedByAccession,
        incompleteAcknowledged: missingCount > 0,
      },
    });

    return {
      submitted: updated.length,
      accessionNumbers,
      results: updated,
    };
  }

  async enterManualResult(body: ManualResultEntry, actor: ActorSnapshot) {
    const accessionNumber = body.accessionNumber.trim();
    const orderedTestCode = normalizeCode(
      body.orderedTestCode ?? body.testCode,
    );

    const specimen = await this.prisma.specimen.findUnique({
      where: { accessionNumber },
      include: { patient: true },
    });
    if (!specimen) {
      throw new NotFoundException(`Accession ${accessionNumber} not found`);
    }

    const orderedCodes = parseOrderedTestCodes(specimen.orderedTestsJson);
    if (!isResultExpectedOnOrder(orderedTestCode, orderedCodes)) {
      throw new BadRequestException(
        `${orderedTestCode} is not on the order for ${accessionNumber}`,
      );
    }

    const requirement = getTestResultRequirement(orderedTestCode);
    const requestedComponent = body.resultComponentCode
      ? normalizeCode(body.resultComponentCode)
      : null;
    const component =
      requirement.manualComponents.find(
        (item) => normalizeCode(item.code) === requestedComponent,
      ) ??
      (!requestedComponent && requirement.manualComponents.length === 1
        ? requirement.manualComponents[0]
        : undefined);
    if (!component) {
      throw new BadRequestException(
        requirement.manualComponents.length === 0
          ? `${orderedTestCode} is an instrument-only test`
          : `Choose a valid manual component for ${orderedTestCode}`,
      );
    }

    const resultComponentCode = normalizeCode(component.code);
    const isLegacySingleResult =
      requirement.manualComponents.length === 1 &&
      resultComponentCode === "RESULT";
    const testCode = isLegacySingleResult
      ? orderedTestCode
      : `${orderedTestCode}:${resultComponentCode}`;
    const orderedTestName = getCatalogDisplayName(orderedTestCode);
    const testName = isLegacySingleResult
      ? orderedTestName
      : `${orderedTestName} — ${component.name}`;
    const observedAt = body.observedAt ? new Date(body.observedAt) : new Date();
    const flag = body.flag ?? "unknown";

    const existing = await this.prisma.result.findFirst({
      where: {
        accessionNumber,
        orderedTestCode,
        resultComponentCode,
        analyzerId: "manual",
      },
      orderBy: { observedAt: "desc" },
    });

    let result;
    if (existing) {
      if (existing.status === "released") {
        throw new BadRequestException(
          `Manual result for ${testCode} is already released and cannot be edited`,
        );
      }
      result = await this.prisma.result.update({
        where: { id: existing.id },
        data: {
          barcode: specimen.barcode,
          orderedTestCode,
          resultComponentCode,
          testName,
          value: body.value,
          units: body.units ?? null,
          referenceLow: body.referenceLow ?? null,
          referenceHigh: body.referenceHigh ?? null,
          flag,
          status: existing.status || "pending_review",
        },
      });
    } else {
      result = await this.prisma.result.create({
        data: {
          accessionNumber,
          barcode: specimen.barcode,
          analyzerId: "manual",
          testCode,
          orderedTestCode,
          resultComponentCode,
          testName,
          value: body.value,
          units: body.units ?? null,
          referenceLow: body.referenceLow ?? null,
          referenceHigh: body.referenceHigh ?? null,
          flag,
          status: "pending_review",
          observedAt,
        },
      });
    }

    await this.sync.enqueue({
      type: "result.batch",
      payload: {
        analyzerId: "manual",
        accessionNumber,
        barcode: specimen.barcode,
        results: [
          {
            id: result.id,
            testCode: result.testCode,
            orderedTestCode: result.orderedTestCode,
            resultComponentCode: result.resultComponentCode,
            testName: result.testName,
            value: result.value,
            units: result.units,
            referenceLow: result.referenceLow,
            referenceHigh: result.referenceHigh,
            flag: result.flag,
            status: result.status,
            observedAt: result.observedAt.toISOString(),
          },
        ],
      },
    });

    await this.audit.log({
      eventType: "result.manual_entered",
      entityType: "result",
      entityId: result.id,
      actor,
      payload: {
        accessionNumber,
        testCode: orderedTestCode,
        resultComponentCode,
        value: result.value,
        units: result.units,
        flag: result.flag,
        updated: Boolean(existing),
      },
    });

    return {
      id: result.id,
      accessionNumber: result.accessionNumber,
      testCode: result.testCode,
      orderedTestCode: result.orderedTestCode,
      resultComponentCode: result.resultComponentCode,
      testName: result.testName,
      value: result.value,
      units: result.units,
      flag: result.flag,
      status: result.status,
      observedAt: result.observedAt.toISOString(),
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
    await this.prisma.specimen.updateMany({
      where: { accessionNumber: { in: accessionNumbers } },
      data: { submitMissingExpectedJson: null },
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
    orderedTestCode: string | null;
    resultComponentCode: string | null;
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
      orderedTestCode: r.orderedTestCode,
      resultComponentCode: r.resultComponentCode,
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
