import { INestApplicationContext, Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { Server, ServerOptions } from 'socket.io';

const DEFAULT_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
];

export function allowedOrigins() {
  const configured = process.env.CORS_ORIGINS?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  return configured?.length ? configured : DEFAULT_ORIGINS;
}

/**
 * Applies CORS from the environment (gateway decorators are evaluated before
 * .env is loaded) and, when REDIS_URL is set, shares rooms across backend
 * instances so monitoring keeps working behind a load balancer.
 */
export class SocketIoAdapter extends IoAdapter {
  private redisAdapter?: ReturnType<typeof createAdapter>;
  private readonly logger = new Logger(SocketIoAdapter.name);

  constructor(app: INestApplicationContext) {
    super(app);
  }

  async connectToRedis(url: string) {
    const pub = createClient({ url });
    const sub = pub.duplicate();
    pub.on('error', (error) => this.logger.error(`Redis: ${error.message}`));
    sub.on('error', (error) => this.logger.error(`Redis: ${error.message}`));
    await Promise.all([pub.connect(), sub.connect()]);
    this.redisAdapter = createAdapter(pub, sub);
    this.logger.log('Socket.IO is using the Redis adapter.');
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    const server: Server = super.createIOServer(port, {
      ...options,
      cors: { origin: allowedOrigins(), credentials: true },
    });
    if (this.redisAdapter) server.adapter(this.redisAdapter);
    return server;
  }
}
