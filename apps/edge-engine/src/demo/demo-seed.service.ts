import { Injectable, Logger } from "@nestjs/common";
import { readFile } from "fs/promises";
import { join } from "path";
import { PrismaService } from "../prisma/prisma.service";
import { PatientsSeedService } from "../patients/patients-seed.service";
import { displayName, normalizeMrn } from "../patients/patient-normalize";

type DemoResult = {
  analyzerId: string;
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
    const patientSeed = await this.patientsSeed.seed();
    const cases = await this.loadFixture();
    const demoAccessions = cases.map((c) => c.accessionNumber);

    const purgedOrphans = await this.purgePatientlessPending();

    // Drop piled simulator duplicates for demo accessions before re-seed.
    // Keep released rows if any; delete everything else on these accessions.
    const deleted = await this.prisma.result.deleteMany({
      where: {
        accessionNumber: { in: demoAccessions },
        status: { not: "released" },
      },
    });
    // Also prune other accession duplicate keys
    const extraDupes = await this.dedupeNonDemoResults();

    let specimens = 0;
    let results = 0;
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
        update: {
          barcode,
          patientId: patient.id,
          patientJson: JSON.stringify(patientPayload),
          orderedTestsJson: JSON.stringify(demo.orderedTests ?? []),
          status: "registered",
        },
      });
      specimens += 1;

      const observedAt = new Date();
      for (const r of demo.results) {
        await this.prisma.result.create({
          data: {
            accessionNumber,
            barcode,
            analyzerId: r.analyzerId,
            testCode: r.testCode,
            orderedTestCode: r.testCode,
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
      dedupedOther: extraDupes,
      skipped,
    };
  }

  /**
   * Remove leftover bridge/smoke/sim results that were never registered to a patient.
   * Keeps released rows; keeps all patient-linked specimens.
   */
  private async purgePatientlessPending(): Promise<{
    results: number;
    specimens: number;
  }> {
    const orphanSpecimens = await this.prisma.specimen.findMany({
      where: { patientId: null },
      select: { accessionNumber: true },
    });
    const patientlessAccessions = orphanSpecimens.map((s) => s.accessionNumber);

    const allSpecimens = await this.prisma.specimen.findMany({
      select: { accessionNumber: true },
    });
    const knownAccessions = new Set(allSpecimens.map((s) => s.accessionNumber));

    const pending = await this.prisma.result.findMany({
      where: { status: { not: "released" } },
      select: { id: true, accessionNumber: true },
    });

    const orphanResultIds = pending
      .filter(
        (r) =>
          patientlessAccessions.includes(r.accessionNumber) ||
          !knownAccessions.has(r.accessionNumber),
      )
      .map((r) => r.id);

    let resultsDeleted = 0;
    if (orphanResultIds.length) {
      const res = await this.prisma.result.deleteMany({
        where: { id: { in: orphanResultIds } },
      });
      resultsDeleted = res.count;
    }

    let specimensDeleted = 0;
    if (patientlessAccessions.length) {
      const remaining = await this.prisma.result.findMany({
        where: { accessionNumber: { in: patientlessAccessions } },
        select: { accessionNumber: true },
        distinct: ["accessionNumber"],
      });
      const keep = new Set(remaining.map((r) => r.accessionNumber));
      const toDelete = patientlessAccessions.filter((a) => !keep.has(a));
      if (toDelete.length) {
        const res = await this.prisma.specimen.deleteMany({
          where: { accessionNumber: { in: toDelete }, patientId: null },
        });
        specimensDeleted = res.count;
      }
    }

    this.logger.log(
      `Purged patientless pending: ${resultsDeleted} results, ${specimensDeleted} specimens`,
    );
    return { results: resultsDeleted, specimens: specimensDeleted };
  }

  /**
   * For non-demo accessions, keep only the latest row per
   * (accessionNumber, testCode, analyzerId); delete older pending duplicates.
   */
  private async dedupeNonDemoResults(): Promise<number> {
    const pending = await this.prisma.result.findMany({
      where: { status: { not: "released" } },
      orderBy: { observedAt: "desc" },
      select: {
        id: true,
        accessionNumber: true,
        testCode: true,
        analyzerId: true,
        observedAt: true,
      },
    });

    const keep = new Set<string>();
    const remove: string[] = [];
    for (const row of pending) {
      const key = `${row.accessionNumber}|${row.testCode}|${row.analyzerId}`;
      if (keep.has(key)) {
        remove.push(row.id);
      } else {
        keep.add(key);
      }
    }

    if (!remove.length) return 0;
    const res = await this.prisma.result.deleteMany({
      where: { id: { in: remove } },
    });
    return res.count;
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
