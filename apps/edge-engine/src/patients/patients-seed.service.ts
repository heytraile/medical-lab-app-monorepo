import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { readFile } from "fs/promises";
import { join } from "path";
import { PrismaService } from "../prisma/prisma.service";
import { PatientsImportService } from "./patients-import.service";
import type { UpstreamPatient } from "./patient-normalize";

@Injectable()
export class PatientsSeedService implements OnModuleInit {
  private readonly logger = new Logger(PatientsSeedService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly imports: PatientsImportService,
  ) {}

  async onModuleInit() {
    try {
      const count = await this.prisma.patient.count();
      if (count === 0) {
        const result = await this.seed();
        this.logger.log(
          `Patient registry seeded (${result.processed} upstream records)`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `Patient seed skipped: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async seed() {
    const records = await this.loadFixture();
    let processed = 0;
    for (const record of records) {
      await this.imports.upsertFromUpstream(record, "seed");
      processed += 1;
    }
    return { seeded: true, processed };
  }

  async loadFixture(): Promise<UpstreamPatient[]> {
    const candidates = [
      join(__dirname, "../../fixtures/patients-messy.json"),
      join(process.cwd(), "fixtures/patients-messy.json"),
      join(process.cwd(), "apps/edge-engine/fixtures/patients-messy.json"),
    ];
    let lastErr: unknown;
    for (const path of candidates) {
      try {
        const raw = await readFile(path, "utf8");
        return JSON.parse(raw) as UpstreamPatient[];
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr instanceof Error
      ? lastErr
      : new Error("patients-messy.json not found");
  }
}
