import { existsSync } from "node:fs";
import { join } from "node:path";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { Request, Response, NextFunction } from "express";

const API_PREFIXES = [
  "/health",
  "/sync",
  "/specimens",
  "/print",
  "/demo",
  "/patients",
  "/analyzers",
  "/ingest",
  "/results",
  "/socket.io",
];

function isApiPath(pathname: string): boolean {
  return API_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function resolveUiRoot(): string {
  if (process.env.WEB_UI_PATH) return process.env.WEB_UI_PATH;
  return join(__dirname, "public", "ui");
}

/** Serve lab SPA from the same origin when SERVE_WEB_UI=true (production mini PC). */
export function configureLabUi(app: NestExpressApplication): void {
  if (process.env.SERVE_WEB_UI !== "true") return;

  const uiRoot = resolveUiRoot();
  if (!existsSync(uiRoot)) {
    // eslint-disable-next-line no-console
    console.warn(`[edge-engine] SERVE_WEB_UI=true but UI bundle missing at ${uiRoot}`);
    return;
  }

  app.useStaticAssets(uiRoot, { index: false });

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    if (isApiPath(req.path)) return next();
    if (req.path.includes(".")) return next();

    res.sendFile(join(uiRoot, "index.html"), (err) => {
      if (err) next(err);
    });
  });

  // eslint-disable-next-line no-console
  console.log(`[edge-engine] serving lab UI from ${uiRoot}`);
}
