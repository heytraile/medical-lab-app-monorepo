import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env") });

import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { PrismaService } from "./prisma/prisma.service";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });
  const prisma = app.get(PrismaService);
  await prisma.enableWal();

  const port = Number(process.env.PORT ?? 3101);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`[edge-engine] listening on http://localhost:${port}`);
}

bootstrap();
