import { config } from "dotenv";
import { resolve } from "path";
// Local .env is optional fallback; Doppler (`doppler run`) wins when set.
config({ path: resolve(__dirname, "../.env"), override: false });

import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { PrismaService } from "./prisma/prisma.service";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });
  const prisma = app.get(PrismaService);
  await prisma.enableWal();

  // Prefer EDGE_ENGINE_PORT so a flat Doppler config does not clash with API PORT.
  const port = Number(
    process.env.EDGE_ENGINE_PORT ?? process.env.PORT ?? 3101,
  );
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`[edge-engine] listening on http://localhost:${port}`);
}

bootstrap();
