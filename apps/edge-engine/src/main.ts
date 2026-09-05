import { config } from "dotenv";
import { resolve } from "path";
// Local .env is optional fallback; Doppler (`doppler run`) wins when set.
config({ path: resolve(__dirname, "../.env"), override: false });

import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { PrismaService } from "./prisma/prisma.service";
import { configureLabUi } from "./static-ui";
import { getCorsOrigins } from "./config/cors-origins";
import { isProductionHardened } from "./config/production-hardening";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    cors: {
      origin: getCorsOrigins(),
      credentials: true,
    },
  });
  const prisma = app.get(PrismaService);
  await prisma.enableWal();

  if (isProductionHardened()) {
    app.use(
      helmet({
        contentSecurityPolicy: false,
        crossOriginEmbedderPolicy: false,
      }),
    );
  }

  configureLabUi(app);

  // Prefer EDGE_ENGINE_PORT so a flat Doppler config does not clash with API PORT.
  const port = Number(
    process.env.EDGE_ENGINE_PORT ?? process.env.PORT ?? 3101,
  );
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`[edge-engine] listening on http://localhost:${port}`);
}

bootstrap();
