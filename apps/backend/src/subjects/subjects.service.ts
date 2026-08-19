import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { AppPolicyMode, ExamStatus, QuestionType, Role } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreateExamDto, CreateSubjectDto } from "./dto/subjects.dto";

@Injectable()
export class SubjectsService {
  constructor(private prisma: PrismaService) {}
  async create(teacherId: string, dto: CreateSubjectDto) {
    const subject = await this.prisma.subject.create({
      data: {
        code: dto.code.trim().toUpperCase(),
        name: dto.name.trim(),
        teacherId,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: teacherId,
        action: "SUBJECT_CREATED",
        targetType: "Subject",
        targetId: subject.id,
      },
    });
    return subject;
  }
  mine(userId: string, role: Role) {
    return role === Role.TEACHER
      ? this.prisma.subject.findMany({
          where: { teacherId: userId },
          include: { _count: { select: { enrollments: true, exams: true } } },
          orderBy: { createdAt: "desc" },
        })
      : this.prisma.subject.findMany({
          where: { enrollments: { some: { studentId: userId } } },
          select: {
            id: true,
            code: true,
            name: true,
            teacher: { select: { fullName: true } },
          },
          orderBy: { name: "asc" },
        });
  }
  private async owned(subjectId: string, teacherId: string) {
    const subject = await this.prisma.subject.findUnique({
      where: { id: subjectId },
    });
    if (!subject) throw new NotFoundException("Subject not found");
    if (subject.teacherId !== teacherId)
      throw new ForbiddenException("You do not own this subject");
    return subject;
  }
  async students(subjectId: string, teacherId: string) {
    await this.owned(subjectId, teacherId);
    return this.prisma.enrollment.findMany({
      where: { subjectId },
      select: {
        student: {
          select: {
            id: true,
            fullName: true,
            email: true,
            studentProfile: {
              select: { studentId: true, program: true, yearLevel: true },
            },
          },
        },
      },
      orderBy: { student: { fullName: "asc" } },
    });
  }
  async availableStudents(subjectId: string, teacherId: string, search = "") {
    await this.owned(subjectId, teacherId);
    return this.prisma.user.findMany({
      where: {
        role: Role.STUDENT,
        enrollments: { none: { subjectId } },
        OR: [
          { fullName: { contains: search, mode: "insensitive" } },
          {
            studentProfile: {
              is: { studentId: { contains: search, mode: "insensitive" } },
            },
          },
        ],
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        studentProfile: {
          select: { studentId: true, program: true, yearLevel: true },
        },
      },
      take: 50,
      orderBy: { fullName: "asc" },
    });
  }
  async enroll(subjectId: string, studentId: string, teacherId: string) {
    await this.owned(subjectId, teacherId);
    const student = await this.prisma.user.findFirst({
      where: { id: studentId, role: Role.STUDENT },
    });
    if (!student) throw new NotFoundException("Student not found");
    try {
      return await this.prisma.enrollment.create({
        data: { subjectId, studentId },
      });
    } catch {
      throw new ConflictException("Student is already enrolled");
    }
  }
  async createExam(subjectId: string, teacherId: string, dto: CreateExamDto) {
    await this.owned(subjectId, teacherId);
    for (const question of dto.questions) {
      if (
        question.type === "MULTIPLE_CHOICE" &&
        (!question.options?.length ||
          !question.options.some((option) => option.isCorrect))
      )
        throw new ConflictException(
          "Multiple-choice questions need options and one correct answer",
        );
      if (
        (question.type === "ENUMERATION" ||
          question.type === "IDENTIFICATION") &&
        !question.correctAnswer
      )
        throw new ConflictException(
          "This question type requires a correct answer",
        );
    }
    const exam = await this.prisma.exam.create({
      data: {
        subjectId,
        title: dto.title.trim(),
        instructions: dto.instructions?.trim(),
        totalPoints: dto.questions.reduce(
          (sum, question) => sum + question.points,
          0,
        ),
        durationMinutes: dto.durationMinutes,
        roomCode: crypto
          .randomUUID()
          .replaceAll("-", "")
          .slice(0, 8)
          .toUpperCase(),
        requireCamera: dto.requireCamera,
        requireMicrophone: dto.requireMicrophone,
        appPolicyMode: dto.appPolicyMode as AppPolicyMode,
        appPolicyList: dto.appPolicyList,
        status: ExamStatus.DRAFT,
        questions: {
          create: dto.questions.map((question, index) => ({
            type: question.type as QuestionType,
            order: index + 1,
            points: question.points,
            prompt: question.prompt.trim(),
            correctAnswer:
              question.type === "MULTIPLE_CHOICE" || question.type === "ESSAY"
                ? undefined
                : JSON.parse(question.correctAnswer!),
            rubric: question.rubric?.trim(),
            options:
              question.type === "MULTIPLE_CHOICE"
                ? { create: question.options }
                : undefined,
          })),
        },
      },
      include: { questions: { include: { options: true } } },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: teacherId,
        action: "EXAM_CREATED",
        targetType: "Exam",
        targetId: exam.id,
      },
    });
    return exam;
  }
  async exams(subjectId: string, teacherId: string) {
    await this.owned(subjectId, teacherId);
    return this.prisma.exam.findMany({
      where: { subjectId },
      include: { _count: { select: { questions: true } } },
      orderBy: { createdAt: "desc" },
    });
  }
}
