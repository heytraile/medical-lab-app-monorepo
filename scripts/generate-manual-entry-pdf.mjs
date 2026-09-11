#!/usr/bin/env node
/**
 * Generates docs/MANUAL_RESULT_ENTRY_LAB_GUIDE.pdf for lab review.
 * Usage: node scripts/generate-manual-entry-pdf.mjs
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const result = spawnSync(
  "npx",
  [
    "-y",
    "md-to-pdf",
    "docs/MANUAL_RESULT_ENTRY_LAB_GUIDE.md",
    "--config-file",
    "docs/pdf/manual-result-entry-lab-guide.config.json",
  ],
  { cwd: root, stdio: "inherit", shell: true },
);

process.exit(result.status ?? 1);
