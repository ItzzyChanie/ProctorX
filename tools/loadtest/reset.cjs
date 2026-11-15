/**
 * Clears attempts from a previous run so every simulated student can join
 * again. Only runs against a *loadtest* database.
 *
 *   DATABASE_URL=... node tools/loadtest/reset.cjs
 */
const { PrismaClient } = require('@prisma/client');

(async () => {
  if (!/loadtest/i.test(process.env.DATABASE_URL ?? ''))
    throw new Error('Refusing to run: DATABASE_URL must point at a *loadtest* database.');
  const prisma = new PrismaClient();
  await prisma.$executeRawUnsafe(`
    TRUNCATE "answers", "submissions", "incidents", "evidence_clips",
             "proctoring_events", "suspicion_score_snapshots", "recordings",
             "raise_hand_requests", "proctor_warnings", "proctor_reviews",
             "exam_sessions", "login_sessions", "notifications" CASCADE`);
  console.log('Load-test attempts cleared.');
  await prisma.$disconnect();
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
