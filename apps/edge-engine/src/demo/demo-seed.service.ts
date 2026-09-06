import { Injectable, Logger } from "@nestjs/common";
import { readFile } from "fs/promises";
import { join } from "path";
import {
  getCatalogItem,
  instrumentToCatalogCodes,
  normalizeCode,
  type AnalyzerId,
} from "@drax-lis/catalog";
import { PrismaService } from "../prisma/prisma.service";
import { PatientsSeedService } from "../patients/patients-seed.service";
import { displayName, normalizeMrn } from "../patients/patient-normalize";

type DemoResult = {
  analyzerId: AnalyzerId;
  testCode: string;
  testName?: string;
  value: string;
  units?: string;
  flag: string;
  status?: string;
  referenceLow?: number;
  referenceHigh?: number;
};

type DemoCase = {
  mrn: string;
  accessionNumber: string;
  orderedTests?: Array<{ code: string; name?: string }>;
  results: DemoResult[];
};

@Injectable()
export class DemoSeedService {
  private readonly logger = new Logger(DemoSeedService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly patientsSeed: PatientsSeedService,
  ) {}

  async seedBench() {
    const cases = await this.loadFixture();
    this.validateFixture(cases);

    const patientSeed = await this.patientsSeed.seed();
    const demoAccessions = cases.map((c) => c.accessionNumber);
    const purgedOrphans = await this.purgePatientlessPending();

    const releasedRows = await this.prisma.result.findMany({
      where: {
        accessionNumber: { in: demoAccessions },
        status: "released",
      },
      select: { accessionNumber: true },
      distinct: ["accessionNumber"],
    });
    const releasedAccessions = new Set(
      releasedRows.map((row) => row.accessionNumber),
    );

    // Deterministically repair only fixture-owned accessions. Released rows
    // retain their IDs and audit history; stale nonreleased duplicates do not.
    const deleted = await this.prisma.result.deleteMany({
      where: {
        accessionNumber: { in: demoAccessions },
        status: { not: "released" },
      },
    });
    const extraDupes = await this.dedupeNonDemoResults();

    let specimens = 0;
    let results = 0;
    let releasedAccessionsPreserved = 0;
    const skipped: string[] = [];

    for (const demo of cases) {
      const mrn = normalizeMrn(demo.mrn);
      const patient = await this.prisma.patient.findUnique({ where: { mrn } });
      if (!patient) {
        skipped.push(demo.mrn);
        this.logger.warn(`Demo case skipped — patient not found: ${demo.mrn}`);
        continue;
      }

      const patientPayload = {
        id: patient.id,
        mrn: patient.mrn,
        firstName: patient.firstName,
        middleName: patient.middleName,
        lastName: patient.lastName,
        dateOfBirth: patient.dateOfBirth,
        sex: patient.sex,
        identityOrigin: patient.identityOrigin,
        syncStatus: patient.syncStatus,
        status: patient.status,
      };

      const accessionNumber = demo.accessionNumber;
      const barcode = accessionNumber;
      const hasReleasedResults = releasedAccessions.has(accessionNumber);

      await this.prisma.specimen.upsert({
        where: { accessionNumber },
        create: {
          accessionNumber,
          barcode,
          patientId: patient.id,
          patientJson: JSON.stringify(patientPayload),
          orderedTestsJson: JSON.stringify(demo.orderedTests ?? []),
          status: "registered",
        },
        update: hasReleasedResults
          ? {
              barcode,
              patientId: patient.id,
              patientJson: JSON.stringify(patientPayload),
              orderedTestsJson: JSON.stringify(demo.orderedTests ?? []),
            }
          : {
              barcode,
              patientId: patient.id,
              patientJson: JSON.stringify(patientPayload),
              orderedTestsJson: JSON.stringify(demo.orderedTests ?? []),
              status: "registered",
            },
      });
      specimens += 1;

      if (hasReleasedResults) {
        releasedAccessionsPreserved += 1;
        this.logger.log(
          `Demo bench: preserved released accession ${accessionNumber}`,
        );
        continue;
      }

      const observedAt = new Date();
      for (const r of demo.results) {
        const catalogTestCode = this.resolveResultCatalogCode(demo, r);
        const instrumentTestCode = normalizeCode(r.testCode);
        await this.prisma.result.create({
          data: {
            accessionNumber,
            barcode,
            analyzerId: r.analyzerId,
            testCode: catalogTestCode,
            orderedTestCode: catalogTestCode,
            instrumentTestCode:
              instrumentTestCode === catalogTestCode
                ? null
                : instrumentTestCode,
            testName: r.testName ?? null,
            value: r.value,
            units: r.units ?? null,
            referenceLow: r.referenceLow ?? null,
            referenceHigh: r.referenceHigh ?? null,
            flag: r.flag,
            status: r.status ?? "pending_review",
            observedAt,
          },
        });
        results += 1;
      }

      this.logger.log(
        `Demo bench: ${displayName(patient)} (${patient.mrn}) → ${accessionNumber}`,
      );
    }

    return {
      ok: true,
      patientsSeeded: patientSeed.processed,
      specimens,
      results,
      purgedOrphanResults: purgedOrphans.results,
      purgedOrphanSpecimens: purgedOrphans.specimens,
      clearedPendingOnDemoAccessions: deleted.count,
      releasedAccessionsPreserved,
      dedupedOther: extraDupes,
      skipped,
    };
  }

  private async purgePatientlessPending(): Promise<{
    results: number;
    specimens: number;
  }> {
    const orphanSpecimens = await this.prisma.specimen.findMany({
      where: { patientId: null },
      select: { accessionNumber: true },
    });
    const patientlessAccessions = orphanSpecimens.map(
      (specimen) => specimen.accessionNumber,
    );
    const knownSpecimens = await this.prisma.specimen.findMany({
      select: { accessionNumber: true },
    });
    const knownAccessions = new Set(
      knownSpecimens.map((specimen) => specimen.accessionNumber),
    );
    const pending = await this.prisma.result.findMany({
      where: { status: { not: "released" } },
      select: { id: true, accessionNumber: true },
    });
    const orphanResultIds = pending
      .filter(
        (result) =>
          patientlessAccessions.includes(result.accessionNumber) ||
          !knownAccessions.has(result.accessionNumber),
      )
      .map((result) => result.id);

    const resultsDeleted = orphanResultIds.length
      ? (
          await this.prisma.result.deleteMany({
            where: { id: { in: orphanResultIds } },
          })
        ).count
      : 0;

    const remaining = patientlessAccessions.length
      ? await this.prisma.result.findMany({
          where: { accessionNumber: { in: patientlessAccessions } },
          select: { accessionNumber: true },
          distinct: ["accessionNumber"],
        })
      : [];
    const keep = new Set(remaining.map((result) => result.accessionNumber));
    const removableSpecimens = patientlessAccessions.filter(
      (accession) => !keep.has(accession),
    );
    const specimensDeleted = removableSpecimens.length
      ? (
          await this.prisma.specimen.deleteMany({
            where: {
              accessionNumber: { in: removableSpecimens },
              patientId: null,
            },
          })
        ).count
      : 0;

    return { results: resultsDeleted, specimens: specimensDeleted };
  }

  private async dedupeNonDemoResults(): Promise<number> {
    const pending = await this.prisma.result.findMany({
      where: { status: { not: "released" } },
      orderBy: { observedAt: "desc" },
      select: {
        id: true,
        accessionNumber: true,
        testCode: true,
        analyzerId: true,
      },
    });
    const keep = new Set<string>();
    const remove: string[] = [];
    for (const row of pending) {
      const key = `${row.accessionNumber}|${row.testCode}|${row.analyzerId}`;
      if (keep.has(key)) remove.push(row.id);
      else keep.add(key);
    }
    if (!remove.length) return 0;
    return (
      await this.prisma.result.deleteMany({
        where: { id: { in: remove } },
      })
    ).count;
  }

  private validateFixture(cases: DemoCase[]): void {
    for (const demo of cases) {
      const orderedCodes = new Set(
        (demo.orderedTests ?? []).map((test) => {
          const code = normalizeCode(test.code);
          if (!getCatalogItem(code)) {
            throw new Error(
              `Unknown demo ordered test code "${test.code}" on ${demo.accessionNumber}`,
            );
          }
          return code;
        }),
      );

      for (const result of demo.results) {
        const resultCode = this.resolveResultCatalogCode(demo, result);
        if (!orderedCodes.has(resultCode)) {
          throw new Error(
            `Demo result code "${result.testCode}" is not ordered on ${demo.accessionNumber}`,
          );
        }
      }
    }
  }

  private resolveResultCatalogCode(
    demo: DemoCase,
    result: DemoResult,
  ): string {
    const rawCode = normalizeCode(result.testCode);
    const orderedCodes = new Set(
      (demo.orderedTests ?? []).map((test) => normalizeCode(test.code)),
    );
    if (getCatalogItem(rawCode) && orderedCodes.has(rawCode)) return rawCode;

    const mapped = instrumentToCatalogCodes(result.analyzerId, rawCode).find(
      (catalogCode) => orderedCodes.has(normalizeCode(catalogCode)),
    );
    if (mapped) return normalizeCode(mapped);

    throw new Error(
      `Unknown or unordered demo result code "${result.testCode}" on ${demo.accessionNumber}`,
    );
  }

  private async loadFixture(): Promise<DemoCase[]> {
    const candidates = [
      join(__dirname, "../../fixtures/demo-bench.json"),
      join(process.cwd(), "fixtures/demo-bench.json"),
      join(process.cwd(), "apps/edge-engine/fixtures/demo-bench.json"),
    ];
    let lastErr: unknown;
    for (const path of candidates) {
      try {
        const raw = await readFile(path, "utf8");
        return JSON.parse(raw) as DemoCase[];
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr instanceof Error
      ? lastErr
      : new Error("demo-bench.json not found");
  }
}
