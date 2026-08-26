import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    await this.$connect();
    await this.syncMeta.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", nextSequence: 1 },
      update: {},
    });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /** Enable WAL + busy timeout for concurrent offline buffering. */
  async enableWal() {
    // PRAGMA journal_mode returns a row — use queryRaw, not executeRaw
    await this.$queryRawUnsafe("PRAGMA journal_mode=WAL;");
    await this.$queryRawUnsafe("PRAGMA busy_timeout=5000;");
    await this.$queryRawUnsafe("PRAGMA synchronous=NORMAL;");
    this.logger.log("SQLite WAL mode enabled");
  }
}
