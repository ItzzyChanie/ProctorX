import bcrypt from "bcrypt";
import { PrismaClient, Role } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const dean = {
    email: process.env.SEED_DEAN_EMAIL,
    password: process.env.SEED_DEAN_PASSWORD,
    fullName: process.env.SEED_DEAN_FULLNAME,
  };
  if (!dean.email || !dean.password || !dean.fullName)
    throw new Error(
      "SEED_DEAN_EMAIL, SEED_DEAN_PASSWORD, and SEED_DEAN_FULLNAME are required",
    );

  const teacher = {
    email: process.env.SEED_TEACHER_EMAIL ?? "teacher@school.edu",
    password: process.env.SEED_TEACHER_PASSWORD ?? "TeacherDemo1!",
    fullName: process.env.SEED_TEACHER_FULLNAME ?? "Prof. Maria Santos",
  };
  const student = {
    loginId: process.env.SEED_STUDENT_LOGIN_ID ?? "2023-01234",
    email: process.env.SEED_STUDENT_EMAIL ?? "student@school.edu",
    password: process.env.SEED_STUDENT_PASSWORD ?? "StudentDemo1!",
    fullName: process.env.SEED_STUDENT_FULLNAME ?? "Alexandra Cruz",
  };

  await prisma.user.upsert({
    where: { loginId: dean.email.toLowerCase() },
    update: {
      email: dean.email.toLowerCase(),
      fullName: dean.fullName,
      role: Role.DEAN,
      passwordHash: await bcrypt.hash(dean.password, 12),
      mustChangePassword: true,
      isActive: true,
      deanProfile: { upsert: { create: {}, update: {} } },
    },
    create: {
      loginId: dean.email.toLowerCase(),
      email: dean.email.toLowerCase(),
      fullName: dean.fullName,
      role: Role.DEAN,
      passwordHash: await bcrypt.hash(dean.password, 12),
      mustChangePassword: true,
      deanProfile: { create: {} },
    },
  });
  await prisma.user.upsert({
    where: { loginId: teacher.email.toLowerCase() },
    update: {
      email: teacher.email.toLowerCase(),
      fullName: teacher.fullName,
      role: Role.TEACHER,
      passwordHash: await bcrypt.hash(teacher.password, 12),
      mustChangePassword: false,
      isActive: true,
      teacherProfile: {
        upsert: { create: { employeeId: "T-2026-001" }, update: {} },
      },
    },
    create: {
      loginId: teacher.email.toLowerCase(),
      email: teacher.email.toLowerCase(),
      fullName: teacher.fullName,
      role: Role.TEACHER,
      passwordHash: await bcrypt.hash(teacher.password, 12),
      mustChangePassword: false,
      teacherProfile: { create: { employeeId: "T-2026-001" } },
    },
  });
  await prisma.user.upsert({
    where: { loginId: student.loginId },
    update: {
      email: student.email.toLowerCase(),
      fullName: student.fullName,
      role: Role.STUDENT,
      passwordHash: await bcrypt.hash(student.password, 12),
      mustChangePassword: false,
      isActive: true,
      studentProfile: {
        upsert: {
          create: {
            studentId: student.loginId,
            yearLevel: "2",
            program: "BSCS",
          },
          update: {},
        },
      },
    },
    create: {
      loginId: student.loginId,
      email: student.email.toLowerCase(),
      fullName: student.fullName,
      role: Role.STUDENT,
      passwordHash: await bcrypt.hash(student.password, 12),
      mustChangePassword: false,
      studentProfile: {
        create: { studentId: student.loginId, yearLevel: "2", program: "BSCS" },
      },
    },
  });

  console.log("Seeded demo accounts:");
  console.log(`Dean: ${dean.email} / ${dean.password}`);
  console.log(`Teacher: ${teacher.email} / ${teacher.password}`);
  console.log(`Student: ${student.loginId} / ${student.password}`);
}
main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
