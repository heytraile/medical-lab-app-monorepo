import type { PrismaService } from "../prisma/prisma.service";

const TERMINAL_ACCESSION_STATUSES = new Set(["cancelled"]);

/**
 * Keep accession + specimen status aligned with bench results. Ingestion sets
 * in_progress when analyzers connect; demo seed, manual entry, submit, and
 * release must stay in sync too.
 */
export async function syncAccessionStatusFromResults(
  prisma: PrismaService,
  accessionNumber: string,
): Promise<void> {
  const accession = accessionNumber.trim();
  if (!accession) return;

  const row = await prisma.accession.findUnique({
    where: { accessionNumber: accession },
    select: { status: true },
  });
  if (!row || row.status === "cancelled") return;

  const results = await prisma.result.findMany({
    where: { accessionNumber: accession },
    select: { status: true },
  });
  const active = results.filter((r) => r.status !== "cancelled");
  if (active.length === 0) return;

  const allReleased = active.every((r) => r.status === "released");

  if (allReleased) {
    if (row.status !== "released") {
      await prisma.accession.update({
        where: { accessionNumber: accession },
        data: { status: "released" },
      });
    }
    await prisma.specimen.updateMany({
      where: {
        accessionNumber: accession,
        status: { not: "cancelled" },
      },
      data: { status: "released" },
    });
    return;
  }

  if (row.status === "released") {
    await prisma.accession.update({
      where: { accessionNumber: accession },
      data: { status: "in_progress" },
    });
    await prisma.specimen.updateMany({
      where: { accessionNumber: accession, status: "released" },
      data: { status: "in_progress" },
    });
    return;
  }

  if (TERMINAL_ACCESSION_STATUSES.has(row.status)) return;

  if (row.status === "registered" || row.status === "collected") {
    await prisma.accession.update({
      where: { accessionNumber: accession },
      data: { status: "in_progress" },
    });
  }

  await prisma.specimen.updateMany({
    where: {
      accessionNumber: accession,
      status: { in: ["registered", "collected"] },
    },
    data: { status: "in_progress" },
  });
}

/** Repair drift after demo reseed or legacy rows. */
export async function syncAllAccessionStatusesFromResults(
  prisma: PrismaService,
): Promise<number> {
  const rows = await prisma.result.findMany({
    select: { accessionNumber: true },
    distinct: ["accessionNumber"],
  });
  for (const { accessionNumber } of rows) {
    await syncAccessionStatusFromResults(prisma, accessionNumber);
  }
  return rows.length;
}
