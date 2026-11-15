import { Injectable, OnModuleDestroy } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'

/**
 * Prisma's default pool (2 x CPU + 1 connections, 10 s wait) ran out at ~400
 * concurrent students in the load test and requests failed with "Unable to
 * start a transaction in the given time". Unless DATABASE_URL already sets
 * them, use DB_POOL_SIZE (default 30) connections and a DB_POOL_TIMEOUT
 * (default 20 s) wait. Keep the total across backend instances below
 * Postgres max_connections (100 by default).
 */
export function pooledDatabaseUrl(raw = process.env.DATABASE_URL) {
  if (!raw) return raw
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return raw
  }
  if (!url.searchParams.has('connection_limit'))
    url.searchParams.set('connection_limit', process.env.DB_POOL_SIZE ?? '30')
  if (!url.searchParams.has('pool_timeout'))
    url.searchParams.set('pool_timeout', process.env.DB_POOL_TIMEOUT ?? '20')
  return url.toString()
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    const url = pooledDatabaseUrl()
    super(url ? { datasources: { db: { url } } } : undefined)
  }

  async onModuleDestroy() {
    await this.$disconnect()
  }
}
