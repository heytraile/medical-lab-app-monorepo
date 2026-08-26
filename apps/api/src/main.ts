import { config } from "dotenv";
import { resolve } from "path";
// Local .env is optional fallback; Doppler (`doppler run`) wins when set.
config({ path: resolve(__dirname, "../.env"), override: false });

import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });
  // Prefer API_PORT so a flat Doppler config does not clash with edge PORT.
  const port = Number(process.env.API_PORT ?? process.env.PORT ?? 3102);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`[api] listening on http://localhost:${port}`);
}

bootstrap();
