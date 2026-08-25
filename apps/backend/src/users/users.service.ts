import { Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StudentQueryDto } from './dto/student-query.dto';
import { UpdateStudentDto } from './dto/update-student.dto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}
  async listStudents(query: StudentQueryDto, actorId: string, actorRole: Role) {
    const students = await this.prisma.user.findMany({
      where: {
        role: Role.STUDENT,
        studentProfile: {
          is: { program: query.program, yearLevel: query.yearLevel },
        },
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        status: true,
        createdAt: true,
        studentProfile: {
          select: { studentId: true, program: true, yearLevel: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (actorRole !== Role.TEACHER || !students.length) return students;
    const studentIds = students.map(({ id }) => id);
    const enrollments = await this.prisma.enrollment.findMany({
      where: { studentId: { in: studentIds }, subject: { teacherId: actorId } },
      select: { studentId: true, subjectId: true },
    });

    const subjectIds = [
      ...new Set(enrollments.map(({ subjectId }) => subjectId)),
    ];

    const exams = subjectIds.length
      ? await this.prisma.exam.findMany({
          where: { subjectId: { in: subjectIds } },
          select: { id: true, subjectId: true },
          orderBy: { createdAt: 'desc' },
        })
      : [];

    const latestBySubject = new Map<string, string>();
    exams.forEach((exam) => {
      if (!latestBySubject.has(exam.subjectId))
        latestBySubject.set(exam.subjectId, exam.id);
    });

    const latestExamIds = [...latestBySubject.values()];
    const sessions = latestExamIds.length
      ? await this.prisma.examSession.findMany({
          where: {
            examId: { in: latestExamIds },
            studentId: { in: studentIds },
            status: 'COMPLETED',
          },
          select: { examId: true, studentId: true },
        })
      : [];

    const completed = new Set(
      sessions.map(({ studentId, examId }) => `${studentId}:${examId}`)
    );

    return students.map((student) => {
      const relevantExamIds = enrollments
        .filter(({ studentId }) => studentId === student.id)
        .map(({ subjectId }) => latestBySubject.get(subjectId))
        .filter((id): id is string => !!id);
      return {
        ...student,
        assessmentStatus:
          relevantExamIds.length > 0 &&
          relevantExamIds.every((examId) =>
            completed.has(`${student.id}:${examId}`)
          )
            ? 'TAKEN'
            : 'NOT_TAKEN',
      };
    });
  }

  async updateStudent(id: string, input: UpdateStudentDto, actorId: string) {
    const exists = await this.prisma.user.findFirst({
      where: { id, role: Role.STUDENT },
    });

    if (!exists) throw new NotFoundException('Student not found');
    const user = await this.prisma.user.update({
      where: { id },
      data: {
        fullName: input.fullName,
        email: input.email?.toLowerCase(),
        studentProfile: {
          update: { program: input.program, yearLevel: input.yearLevel },
        },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'STUDENT_ACCOUNT_UPDATED',
        targetType: 'User',
        targetId: id,
      },
    });
    return user;
  }

  async deleteStudent(id: string, actorId: string) {
    const exists = await this.prisma.user.findFirst({
      where: { id, role: Role.STUDENT },
    });

    if (!exists) throw new NotFoundException('Student not found');

    await this.prisma.user.delete({ where: { id } });
    
    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'STUDENT_ACCOUNT_DELETED',
        targetType: 'User',
        targetId: id,
      },
    });
    return { success: true };
  }
}
