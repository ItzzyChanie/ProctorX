import { PrismaService } from '../prisma/prisma.service';

/**
 * Runs a background job on only one backend instance at a time.
 *
 * A transaction-scoped Postgres advisory lock is held while the job runs, so
 * when several instances share the database (load balancer, or a dev server
 * plus a test server) the expiry, grading and cleanup jobs never run twice
 * concurrently. Returns false when another instance holds the lock.
 */
export async function runExclusive(
  prisma: PrismaService,
  name: string,
  job: () => Promise<unknown>,
  timeoutMs = 10 * 60_000
): Promise<boolean> {
  return prisma.$transaction(
    async (tx) => {
      const [row] = await tx.$queryRaw<{ locked: boolean }[]>`
        SELECT pg_try_advisory_xact_lock(hashtext(${`proctorx:${name}`})) AS locked`;
      if (!row?.locked) return false;
      await job();
      return true;
    },
    { maxWait: 5_000, timeout: timeoutMs }
  );
}
