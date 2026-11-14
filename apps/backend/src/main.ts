import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { allowedOrigins, SocketIoAdapter } from "./common/socket-io.adapter";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
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
