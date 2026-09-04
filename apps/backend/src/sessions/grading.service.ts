import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  GradeStatus,
  QuestionType,
  SessionStatus,
  SubmissionMode,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateResultReleaseDto } from './dto/result-release.dto';

type SubmittedAnswer = {
  questionId: string;
  responseText?: string;
  selectedOptionIds?: string[];
};

const superscriptDigits: Record<number, string> = {
  0x2070: '0',
  0x00b9: '1',
  0x00b2: '2',
  0x00b3: '3',
  0x2074: '4',
  0x2075: '5',
  0x2076: '6',
  0x2077: '7',
  0x2078: '8',
  0x2079: '9',
};

const normalizeObjectiveText = (input: unknown) =>
  String(input ?? '')
    .replace(/[\u2070\u00b9\u00b2\u00b3\u2074-\u2079]+/gu, (digits) =>
      `^${[...digits].map((digit) => superscriptDigits[digit.codePointAt(0)!]).join('')}`
    )
    .normalize('NFKC')
    .toLocaleLowerCase()
    .trim()
    .replace(/[\u2010-\u2015]/gu, '-')
    .replace(/\s*([/\\*^#!+=<>%])\s*/gu, '$1')
    .replace(/([\p{L}])\s*-\s*(?=\p{L})/gu, '$1')
    .replace(/([\p{L}])\s+(?=\p{L})/gu, '$1')
    .replace(/\s+/gu, ' ');

const enumerationValues = (responseText?: string) => {
  if (!responseText?.trim()) return [];
  try {
    const parsed: unknown = JSON.parse(responseText);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
    // Compatibility with enumeration responses saved before separate fields.
  }
  return responseText.split(/\r?\n/gu);
};

@Injectable()
export class GradingService implements OnModuleInit, OnModuleDestroy {
  private timeoutTimer?: NodeJS.Timeout;
  constructor(private prisma: PrismaService) {}

  onModuleInit() {
    this.timeoutTimer = setInterval(
      () => void this.finishExpiredSessions(),
      10_000
    );
  }

  onModuleDestroy() {
    if (this.timeoutTimer) clearInterval(this.timeoutTimer);
  }

  private objectivePoints(
    question: {
      type: QuestionType;
      points: number;
      correctAnswer: unknown;
      options: { id: string; isCorrect: boolean }[];
    },
    answer: SubmittedAnswer
  ) {
    if (question.type === QuestionType.ESSAY) return null;
    if (question.type === QuestionType.MULTIPLE_CHOICE) {
      const expected = question.options
        .filter((option) => option.isCorrect)
        .map((option) => option.id)
        .sort();
      const actual = [...(answer.selectedOptionIds ?? [])].sort();
      return expected.length === actual.length &&
        expected.every((id, index) => id === actual[index])
        ? question.points
        : 0;
    }
    const expected = Array.isArray(question.correctAnswer)
      ? question.correctAnswer
      : [question.correctAnswer];
    if (question.type === QuestionType.ENUMERATION) {
      const normalizedExpected = expected
        .map(normalizeObjectiveText)
        .filter(Boolean)
        .sort();
      const normalizedActual = enumerationValues(answer.responseText)
        .map(normalizeObjectiveText)
        .filter(Boolean)
        .sort();
      return normalizedExpected.length === normalizedActual.length &&
        normalizedExpected.every(
          (value, index) => value === normalizedActual[index]
        )
        ? question.points
        : 0;
    }
    const actual = normalizeObjectiveText(answer.responseText);
    return expected.some((value) => normalizeObjectiveText(value) === actual)
      ? question.points
      : 0;
  }

  async saveDraft(
    sessionId: string,
    studentId: string,
    answers: SubmittedAnswer[]
  ) {
    const session = await this.prisma.examSession.findFirst({
      where: { id: sessionId, studentId, status: SessionStatus.IN_PROGRESS },
      include: {
        exam: { include: { questions: { include: { options: true } } } },
      },
    });
    if (!session) throw new ForbiddenException();
    const byQuestion = new Map(
      answers.map((answer) => [answer.questionId, answer])
    );
    if (
      byQuestion.size !== answers.length ||
      answers.some(
        (answer) =>
          !session.exam.questions.some(
            (question) => question.id === answer.questionId
          )
      )
    )
      throw new ConflictException('Answers do not belong to this exam');
    const rows = session.exam.questions.map((question) => {
      const answer = byQuestion.get(question.id) ?? { questionId: question.id };
      return {
        questionId: question.id,
        responseText: answer.responseText?.trim() || null,
        selectedOptionIds: answer.selectedOptionIds ?? [],
        awardedPoints: null,
        gradeStatus: GradeStatus.UNGRADED,
      };
    });
    await this.prisma.submission.upsert({
      where: { sessionId },
      create: {
        sessionId,
        submittedAt: null,
        maxScore: session.exam.totalPoints,
        totalScore: null,
        gradeStatus: GradeStatus.UNGRADED,
        answers: { create: rows },
      },
      update: {
        maxScore: session.exam.totalPoints,
        answers: { deleteMany: {}, create: rows },
      },
    });
    return { savedAt: new Date() };
  }

  async heartbeat(sessionId: string, studentId: string) {
    const now = new Date();
    const session = await this.prisma.examSession.findFirst({
      where: { id: sessionId, studentId },
      include: {
        exam: { select: { durationMinutes: true, endsAt: true } },
        submission: true,
      },
    });
    if (!session) throw new ForbiddenException();
    if (session.status === SessionStatus.COMPLETED)
      return {
        expired: true,
        remainingSeconds: 0,
        result: session.submission,
      };

    const elapsed = session.activeStartedAt
      ? Math.max(0, Math.floor((+now - +session.activeStartedAt) / 1000))
      : 0;
    const deadlineRemaining = session.exam.endsAt
      ? Math.max(0, Math.floor((+session.exam.endsAt - +now) / 1000))
      : Number.MAX_SAFE_INTEGER;
    const remainingSeconds = Math.min(
      Math.max(
        0,
        (session.remainingSeconds ?? session.exam.durationMinutes * 60) -
          elapsed
      ),
      deadlineRemaining
    );
    if (remainingSeconds <= 0) {
      const result = await this.autoSubmit(sessionId);
      return { expired: true, remainingSeconds: 0, result };
    }
    await this.prisma.examSession.update({
      where: { id: sessionId },
      data: {
        remainingSeconds,
        activeStartedAt: now,
        lastHeartbeatAt: now,
      },
    });
    return { expired: false, remainingSeconds, serverTime: now };
  }

  private async autoSubmit(sessionId: string) {
    const session = await this.prisma.examSession.findUnique({
      where: { id: sessionId },
      include: { submission: { include: { answers: true } } },
    });
    if (!session || session.status === SessionStatus.COMPLETED)
      return session?.submission ?? null;
    const answers =
      session.submission?.answers.map((answer) => ({
        questionId: answer.questionId,
        responseText: answer.responseText ?? undefined,
        selectedOptionIds: answer.selectedOptionIds,
      })) ?? [];
    return this.submit(
      sessionId,
      session.studentId,
      answers,
      SubmissionMode.AUTO_TIMEOUT
    );
  }

  private async finishExpiredSessions() {
    const sessions = await this.prisma.examSession.findMany({
      where: {
        status: SessionStatus.IN_PROGRESS,
        exam: { endsAt: { lte: new Date() } },
      },
      select: { id: true },
    });
    await Promise.allSettled(
      sessions.map((session) => this.autoSubmit(session.id))
    );
  }

  async submit(
    sessionId: string,
    studentId: string,
    answers: SubmittedAnswer[],
    mode: SubmissionMode = SubmissionMode.MANUAL
  ) {
    const session = await this.prisma.examSession.findFirst({
      where: { id: sessionId, studentId },
      include: {
        exam: { include: { questions: { include: { options: true } } } },
      },
    });
    if (!session) throw new ForbiddenException();
    if (session.status === SessionStatus.COMPLETED)
      throw new ConflictException('This exam has already been submitted');
    const byQuestion = new Map(
      answers.map((answer) => [answer.questionId, answer])
    );
    if (
      byQuestion.size !== answers.length ||
      answers.some(
        (answer) =>
          !session.exam.questions.some(
            (question) => question.id === answer.questionId
          )
      )
    )
      throw new ConflictException('Answers do not belong to this exam');
    const rows = session.exam.questions.map((question) => {
      const answer = byQuestion.get(question.id) ?? { questionId: question.id };
      const awardedPoints = this.objectivePoints(question, answer);
      return {
        questionId: question.id,
        responseText: answer.responseText?.trim() || null,
        selectedOptionIds: answer.selectedOptionIds ?? [],
        awardedPoints,
        gradeStatus:
          awardedPoints === null
            ? GradeStatus.UNGRADED
            : GradeStatus.AUTO_GRADED,
      };
    });
    const totalScore = rows.reduce(
      (total, answer) => total + (answer.awardedPoints ?? 0),
      0
    );
    const hasEssay = session.exam.questions.some(
      (question) => question.type === QuestionType.ESSAY
    );
    const submission = await this.prisma.$transaction(async (tx) => {
      const record = await tx.submission.upsert({
        where: { sessionId },
        create: {
          sessionId,
          submittedAt: new Date(),
          maxScore: session.exam.totalPoints,
          totalScore,
          gradeStatus: hasEssay
            ? GradeStatus.UNGRADED
            : GradeStatus.TEACHER_CONFIRMED,
          mode,
          deletedAt: null,
          answers: { create: rows },
        },
        update: {
          submittedAt: new Date(),
          maxScore: session.exam.totalPoints,
          totalScore,
          gradeStatus: hasEssay
            ? GradeStatus.UNGRADED
            : GradeStatus.TEACHER_CONFIRMED,
          mode,
          deletedAt: null,
          answers: { deleteMany: {}, create: rows },
        },
        include: { answers: true },
      });
      const endedAt = new Date();
      await tx.examSession.update({
        where: { id: sessionId },
        data: { status: SessionStatus.COMPLETED, endedAt },
      });
      await tx.recording.updateMany({
        where: { sessionId },
        data: {
          status: 'COMPLETE',
          durationSec: Math.max(
            0,
            Math.round((+endedAt - +session.startedAt) / 1000)
          ),
        },
      });
      return record;
    });
    return submission;
  }

  async submitted(
    teacherId: string,
    filters: {
      search?: string;
      academicPeriodId?: string;
      term?: string;
      sort?: string;
      page?: string;
      pageSize?: string;
      archive?: string;
    }
  ) {
    const page = Math.max(1, Number.parseInt(filters.page ?? '1', 10) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, Number.parseInt(filters.pageSize ?? '15', 10) || 15)
    );
    const search = filters.search?.trim();
    const terms = ['PRELIMINARY', 'MIDTERM', 'SEMI_FINAL', 'FINAL'];
    const where: any = {
      deletedAt: filters.archive === 'archived' ? { not: null } : null,
      submittedAt: { not: null },
      session: {
        exam: {
          subject: { teacherId },
          ...(filters.academicPeriodId
            ? { academicPeriodId: filters.academicPeriodId }
            : {}),
          ...(filters.term && terms.includes(filters.term)
            ? { term: filters.term }
            : {}),
        },
      },
      ...(search
        ? {
            OR: [
              { session: { student: { fullName: { contains: search, mode: 'insensitive' } } } },
              { session: { student: { studentProfile: { studentId: { contains: search, mode: 'insensitive' } } } } },
              { session: { exam: { title: { contains: search, mode: 'insensitive' } } } },
              { session: { exam: { subject: { OR: [
                { code: { contains: search, mode: 'insensitive' } },
                { name: { contains: search, mode: 'insensitive' } },
              ] } } } },
            ],
          }
        : {}),
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.submission.count({ where }),
      this.prisma.submission.findMany({
        where,
        select: {
          id: true,
          submittedAt: true,
          totalScore: true,
          maxScore: true,
          gradeStatus: true,
          mode: true,
          deletedAt: true,
          session: {
            select: {
              endedAt: true,
              student: {
                select: {
                  id: true,
                  fullName: true,
                  profilePicture: true,
                  studentProfile: { include: { section: true } },
                },
              },
              exam: {
                select: {
                  id: true,
                  title: true,
                  assessmentType: true,
                  term: true,
                  subject: { select: { code: true, name: true } },
                  academicPeriod: true,
                },
              },
            },
          },
        },
        orderBy: {
          session: {
            student: { fullName: filters.sort === 'desc' ? 'desc' : 'asc' },
          },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { items, total, page, pageSize };
  }

  async submissionDetail(submissionId: string, teacherId: string) {
    const submission = await this.prisma.submission.findFirst({
      where: {
        id: submissionId,
        submittedAt: { not: null },
        session: { exam: { subject: { teacherId } } },
      },
      include: {
        session: {
          include: {
            student: {
              select: {
                id: true,
                fullName: true,
                profilePicture: true,
                studentProfile: { include: { section: true } },
              },
            },
            exam: { include: { subject: true, academicPeriod: true } },
          },
        },
        answers: {
          include: { question: { include: { options: true } } },
          orderBy: { question: { order: 'asc' } },
        },
      },
    });
    if (!submission) throw new NotFoundException('Submission not found');
    return submission;
  }

  async removeSubmission(submissionId: string, teacherId: string) {
    const submission = await this.prisma.submission.findFirst({
      where: {
        id: submissionId,
        deletedAt: null,
        session: { exam: { subject: { teacherId } } },
      },
      select: { id: true },
    });
    if (!submission) throw new NotFoundException('Submission not found');
    await this.prisma.$transaction([
      this.prisma.submission.update({
        where: { id: submissionId },
        data: { deletedAt: new Date() },
      }),
      this.prisma.auditLog.create({
        data: {
          actorId: teacherId,
          action: 'SUBMISSION_ARCHIVED',
          targetType: 'Submission',
          targetId: submissionId,
        },
      }),
    ]);
    return { deleted: true };
  }
  async restoreSubmission(submissionId: string, teacherId: string) {
    const submission = await this.prisma.submission.findFirst({
      where: {
        id: submissionId,
        deletedAt: { not: null },
        session: { exam: { subject: { teacherId } } },
      },
      select: { id: true },
    });
    if (!submission) throw new NotFoundException('Archived submission not found');
    await this.prisma.$transaction([
      this.prisma.submission.update({
        where: { id: submissionId },
        data: { deletedAt: null },
      }),
      this.prisma.auditLog.create({
        data: {
          actorId: teacherId,
          action: 'SUBMISSION_RESTORED',
          targetType: 'Submission',
          targetId: submissionId,
        },
      }),
    ]);
    return { restored: true };
  }
  async listForExam(examId: string, teacherId: string) {
    const exam = await this.prisma.exam.findFirst({
      where: { id: examId, subject: { teacherId } },
    });
    if (!exam) throw new ForbiddenException();
    return this.prisma.submission.findMany({
      where: { session: { examId }, deletedAt: null },
      include: {
        session: { include: { student: { select: { fullName: true } } } },
        answers: {
          include: {
            question: {
              select: { prompt: true, points: true, type: true, rubric: true },
            },
          },
        },
      },
      orderBy: { submittedAt: 'desc' },
    });
  }

  async updateResultRelease(
    submissionId: string,
    teacherId: string,
    input: UpdateResultReleaseDto
  ) {
    const submission = await this.prisma.submission.findFirst({
      where: {
        id: submissionId,
        session: { exam: { subject: { teacherId } } },
      },
      select: { id: true, session: { select: { examId: true } } },
    });
    if (!submission) throw new NotFoundException('Submission not found');
    const feedback = input.teacherFeedback?.trim() || null;
    await this.prisma.$transaction([
      this.prisma.submission.update({
        where: { id: submissionId },
        data: { teacherFeedback: feedback },
      }),
      this.prisma.exam.update({
        where: { id: submission.session.examId },
        data: { showCorrectAnswers: input.showCorrectAnswers },
      }),
      this.prisma.auditLog.create({
        data: {
          actorId: teacherId,
          action: 'RESULT_RELEASE_SETTINGS_UPDATED',
          targetType: 'Submission',
          targetId: submissionId,
          metadata: { showCorrectAnswers: input.showCorrectAnswers },
        },
      }),
    ]);
    return this.submissionDetail(submissionId, teacherId);
  }

  async confirmAnswer(answerId: string, teacherId: string, points: number) {
    const answer = await this.prisma.answer.findUnique({
      where: { id: answerId },
      include: {
        question: true,
        submission: {
          include: {
            session: { include: { exam: { include: { subject: true } } } },
          },
        },
      },
    });
    if (!answer) throw new NotFoundException('Answer not found');
    if (answer.submission.session.exam.subject.teacherId !== teacherId)
      throw new ForbiddenException();
    if (
      !Number.isInteger(points) ||
      points < 0 ||
      points > answer.question.points
    )
      throw new ConflictException("Points must be within the question's range");
    await this.prisma.answer.update({
      where: { id: answerId },
      data: {
        awardedPoints: points,
        gradeStatus: GradeStatus.TEACHER_CONFIRMED,
      },
    });
    const answers = await this.prisma.answer.findMany({
      where: { submissionId: answer.submissionId },
    });
    const pending = answers.some(
      (item) =>
        item.gradeStatus === GradeStatus.UNGRADED ||
        item.gradeStatus === GradeStatus.AI_SUGGESTED
    );
    return this.prisma.submission.update({
      where: { id: answer.submissionId },
      data: {
        totalScore: answers.reduce(
          (total, item) => total + (item.awardedPoints ?? 0),
          0
        ),
        gradeStatus: pending
          ? GradeStatus.UNGRADED
          : GradeStatus.TEACHER_CONFIRMED,
      },
    });
  }
}
