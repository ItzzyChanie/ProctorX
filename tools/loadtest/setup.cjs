/**
 * Creates load-test fixtures in the database named by DATABASE_URL:
 * one institution (dean + teacher), N students enrolled in one subject, and a
 * published 2-hour exam that requires camera and microphone.
 *
 * Use a throwaway database (see README.md). Writes fixtures.json next to this
 * file for run.cjs.
 *
 *   DATABASE_URL=... STUDENTS=500 node tools/loadtest/setup.cjs
 */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const { writeFileSync } = require('fs');
const { join } = require('path');

const STUDENTS = Number(process.env.STUDENTS ?? 500);
const PASSWORD = 'LoadTest@2026';
const ROOM_CODE = 'LOADTEST';

async function main() {
  if (!/loadtest/i.test(process.env.DATABASE_URL ?? ''))
    throw new Error('Refusing to run: DATABASE_URL must point at a *loadtest* database.');
  const prisma = new PrismaClient();
  // Cost 12 matches production hashes, so login timings are realistic.
  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  const dean = await prisma.user.create({
    data: {
      role: 'DEAN',
      loginId: 'lt-dean',
      email: 'lt-dean@loadtest.local',
      fullName: 'Load Test Dean',
      passwordHash,
      mustChangePassword: false,
    },
  });
  const institutionId = dean.id;
  await prisma.user.update({ where: { id: dean.id }, data: { institutionId } });
  const teacher = await prisma.user.create({
    data: {
      institutionId,
      role: 'TEACHER',
      loginId: 'lt-teacher',
      email: 'lt-teacher@loadtest.local',
      fullName: 'Load Test Teacher',
      passwordHash,
      mustChangePassword: false,
    },
  });
  const period = await prisma.academicPeriod.create({
    data: { institutionId, academicYear: '2026-2027', semester: 'FIRST' },
  });
  const subject = await prisma.subject.create({
    data: {
      code: 'LTSUBJ01',
      subjectCode: 'LT-101',
      name: 'Load Test Subject',
      schedule: 'n/a',
      teacherId: teacher.id,
    },
  });

  const students = Array.from({ length: STUDENTS }, (_, index) => {
    const n = String(index + 1).padStart(4, '0');
    return {
      institutionId,
      role: 'STUDENT',
      loginId: `lt-student-${n}`,
      email: `lt-student-${n}@loadtest.local`,
      fullName: `Load Student ${n}`,
      passwordHash,
      mustChangePassword: false,
    };
  });
  await prisma.user.createMany({ data: students });
  const created = await prisma.user.findMany({
    where: { institutionId, role: 'STUDENT' },
    select: { id: true, loginId: true },
    orderBy: { loginId: 'asc' },
  });
  await prisma.enrollment.createMany({
    data: created.map(({ id }) => ({ subjectId: subject.id, studentId: id })),
  });

  const exam = await prisma.exam.create({
    data: {
      subjectId: subject.id,
      academicPeriodId: period.id,
      term: 'MIDTERM',
      title: 'Load test exam',
      totalPoints: 10,
      durationMinutes: 120,
      roomCode: ROOM_CODE,
      requireCamera: true,
      requireMicrophone: true,
      status: 'PUBLISHED',
      publishedAt: new Date(),
      questions: {
        create: Array.from({ length: 10 }, (_, index) => ({
          type: 'MULTIPLE_CHOICE',
          order: index + 1,
          points: 1,
          prompt: `Question ${index + 1}`,
          options: {
            create: [
              { label: 'A', isCorrect: true },
              { label: 'B', isCorrect: false },
              { label: 'C', isCorrect: false },
            ],
          },
        })),
      },
    },
  });

  const fixtures = {
    roomCode: ROOM_CODE,
    examId: exam.id,
    password: PASSWORD,
    teacher: 'lt-teacher',
    students: created.map(({ loginId }) => loginId),
  };
  writeFileSync(join(__dirname, 'fixtures.json'), JSON.stringify(fixtures, null, 2));
  console.log(`Created ${created.length} students, exam ${exam.id} (room ${ROOM_CODE}).`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
