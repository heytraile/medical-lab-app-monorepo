import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { formatSpecimenNumber } from "./specimen-number";

@Injectable()
export class SpecimenBackfillService implements OnModuleInit {
  private readonly logger = new Logger(SpecimenBackfillService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.backfillSpecimenNumbers();
  }

  /** Assign specimenNumber + per-tube barcode for rows created before this feature. */
  async backfillSpecimenNumbers() {
    const missing = await this.prisma.specimen.findMany({
      where: { specimenNumber: null },
      orderBy: [{ accessionId: "asc" }, { departmentKey: "asc" }, { id: "asc" }],
    });
    if (!missing.length) return;

    const byAccession = new Map<string, typeof missing>();
    for (const row of missing) {
      const list = byAccession.get(row.accessionId) ?? [];
      list.push(row);
      byAccession.set(row.accessionId, list);
    }

    let updated = 0;
    for (const [, rows] of byAccession) {
      const sorted = [...rows].sort((a, b) => {
        const dept = a.departmentKey.localeCompare(b.departmentKey);
        if (dept !== 0) return dept;
        return a.id.localeCompare(b.id);
      });
      for (let i = 0; i < sorted.length; i++) {
        const row = sorted[i]!;
        const specimenNumber = formatSpecimenNumber(row.accessionNumber, i + 1);
        await this.prisma.specimen.update({
          where: { id: row.id },
          data: {
            specimenNumber,
            barcode: specimenNumber,
            tubeSequence: row.tubeSequence > 0 ? row.tubeSequence : 1,
          },
        });
        updated += 1;
      }
    }

    if (updated) {
      this.logger.log(`Backfilled specimenNumber on ${updated} specimen row(s)`);
    }
  }
}
