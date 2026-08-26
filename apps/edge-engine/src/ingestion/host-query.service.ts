import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

export type HostQueryResult = {
  found: boolean;
  barcode: string;
  accessionNumber?: string;
  orderedTests: Array<{ code: string; name?: string }>;
  patientName?: string;
};

/**
 * Minimal host-query: look up Specimen by barcode and return ordered tests.
 */
@Injectable()
export class HostQueryService {
  private readonly logger = new Logger(HostQueryService.name);

  constructor(private readonly prisma: PrismaService) {}

  async ordersByBarcode(barcode: string): Promise<HostQueryResult> {
    const specimen = await this.prisma.specimen.findFirst({
      where: {
        OR: [{ barcode }, { accessionNumber: barcode }],
      },
    });

    if (!specimen) {
      this.logger.debug(`Host query miss for barcode=${barcode}`);
      return { found: false, barcode, orderedTests: [] };
    }

    let orderedTests: Array<{ code: string; name?: string }> = [];
    try {
      orderedTests = JSON.parse(specimen.orderedTestsJson) as Array<{
        code: string;
        name?: string;
      }>;
    } catch {
      orderedTests = [];
    }

    let patientName: string | undefined;
    if (specimen.patientJson) {
      try {
        const p = JSON.parse(specimen.patientJson) as {
          firstName?: string;
          lastName?: string;
        };
        patientName = [p.firstName, p.lastName].filter(Boolean).join(" ");
      } catch {
        /* ignore */
      }
    }

    return {
      found: true,
      barcode: specimen.barcode,
      accessionNumber: specimen.accessionNumber,
      orderedTests,
      patientName,
    };
  }
}
