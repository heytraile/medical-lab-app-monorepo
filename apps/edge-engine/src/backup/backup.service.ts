import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { execFile } from "node:child_process";
import { mkdir, readdir, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { isProductionHardened } from "../config/production-hardening";

const execFileAsync = promisify(execFile);

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);
  private running = false;

  @Cron(CronExpression.EVERY_30_MINUTES)
  async scheduledBackup() {
    const intervalMin = Number(process.env.BACKUP_INTERVAL_MINUTES ?? "30");
    if (intervalMin <= 0) return;
    // Cron is fixed at 30m; shorter intervals can call runBackup manually.
    await this.runBackup();
  }

  async runBackup(): Promise<{ path: string; pruned: number }> {
    const backupDir = process.env.BACKUP_DIR?.trim();
    if (!backupDir) {
      if (isProductionHardened()) {
        throw new Error("BACKUP_DIR is required when edge hardening is enabled");
      }
      this.logger.debug("BACKUP_DIR not set — skipping backup");
      return { path: "", pruned: 0 };
    }
    if (this.running) {
      this.logger.warn("Backup already in progress — skipping");
      return { path: "", pruned: 0 };
    }
    this.running = true;
    try {
      const dbPath = resolveDatabasePath();
      await mkdir(backupDir, { recursive: true });

      const stamp = formatTimestamp(new Date());
      const dest = join(backupDir, `edge-${stamp}.db`);

      await execFileAsync("sqlite3", [dbPath, `.backup '${dest.replace(/'/g, "''")}'`]);
      this.logger.log(`SQLite backup written to ${dest}`);

      const pruned = await this.pruneOldBackups(backupDir);
      if (pruned > 0) {
        this.logger.log(`Pruned ${pruned} backup(s) older than retention`);
      }
      return { path: dest, pruned };
    } catch (err) {
      this.logger.error("SQLite backup failed", err instanceof Error ? err.stack : err);
      throw err;
    } finally {
      this.running = false;
    }
  }

  private async pruneOldBackups(backupDir: string): Promise<number> {
    const days = Number(process.env.BACKUP_RETENTION_DAYS ?? "7");
    if (!Number.isFinite(days) || days <= 0) return 0;

    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    let pruned = 0;
    const entries = await readdir(backupDir);
    for (const name of entries) {
      if (!name.startsWith("edge-") || !name.endsWith(".db")) continue;
      const full = join(backupDir, name);
      const info = await stat(full);
      if (info.mtimeMs < cutoff) {
        await unlink(full);
        pruned += 1;
      }
    }
    return pruned;
  }
}

export function resolveDatabasePath(): string {
  const url = process.env.DATABASE_URL ?? "file:./dev.db";
  const path = url.startsWith("file:") ? url.slice("file:".length) : url;
  if (!path.startsWith("/")) {
    return join(process.cwd(), path);
  }
  return path;
}

function formatTimestamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-` +
    `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`
  );
}
