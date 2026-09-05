/**
 * TanStack Start SPA prerender hook does not always emit index.html in our
 * Vite 6 setup. After `build:spa`, spin up preview briefly and capture the
 * client bootstrap document for NestJS static serving.
 */
import { preview } from "vite";
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outFile = join(root, "dist/client/index.html");

const server = await preview({
  root,
  preview: { port: 0, strictPort: false, open: false },
});

try {
  const base = server.resolvedUrls?.local?.[0];
  if (!base) throw new Error("Could not resolve vite preview URL");

  const res = await fetch(`${base}/bench`, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(`Preview fetch failed: ${res.status} ${res.statusText}`);
  }

  const html = await res.text();
  await writeFile(outFile, html, "utf8");
  // eslint-disable-next-line no-console
  console.log(`[build:spa] wrote ${outFile}`);
} finally {
  await server.close();
}
