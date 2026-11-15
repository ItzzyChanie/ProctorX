import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { allowedOrigins, SocketIoAdapter } from "./common/socket-io.adapter";

/** Refuse to boot with missing or weak secrets instead of silently using defaults. */
function assertSecrets() {
  const problems = [
    ["JWT_SECRET", 32],
    ["INTERNAL_API_KEY", 32],
  ]
    .filter(([name, min]) => (process.env[name as string] ?? "").length < (min as number))
    .map(([name, min]) => `${name} must be set to at least ${min} characters`);
  if (problems.length)
    throw new Error(`Invalid configuration:\n- ${problems.join("\n- ")}`);
}

async function bootstrap() {
  // ConfigModule (imported by AppModule) has already loaded .env here.
  assertSecrets();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Behind a reverse proxy, set TRUST_PROXY (e.g. "1") so rate limits see the
  // real client IP instead of the proxy's.
  if (process.env.TRUST_PROXY) {
    const hops = Number(process.env.TRUST_PROXY);
    app.set("trust proxy", Number.isFinite(hops) ? hops : process.env.TRUST_PROXY);
  }
  app.use(helmet());
  app.enableCors({
    origin: allowedOrigins(),
    credentials: true,
  });
  const socketAdapter = new SocketIoAdapter(app);
  if (process.env.REDIS_URL)
    await socketAdapter.connectToRedis(process.env.REDIS_URL);
  app.useWebSocketAdapter(socketAdapter);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.listen(process.env.PORT ?? 4000);
}

void bootstrap();
