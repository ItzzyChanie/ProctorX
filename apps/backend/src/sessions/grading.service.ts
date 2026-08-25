import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { GradeStatus, QuestionType, SessionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type SubmittedAnswer = {
  questionId: string;
  responseText?: string;
  selectedOptionIds?: string[];
};

@Injectable()
export class GradingService {
  constructor(private prisma: PrismaService) {}

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
    const actual = (answer.responseText ?? '').trim().toLocaleLowerCase();
    return expected.some(
      (value) => String(value).trim().toLocaleLowerCase() === actual
    )
      ? question.points
      : 0;
  }

  async submit(
    sessionId: string,
    studentId: string,
    answers: SubmittedAnswer[]
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
          answers: { create: rows },
        },
        update: {
          submittedAt: new Date(),
          maxScore: session.exam.totalPoints,
          totalScore,
          gradeStatus: hasEssay
            ? GradeStatus.UNGRADED
            : GradeStatus.TEACHER_CONFIRMED,
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

  async listForExam(examId: string, teacherId: string) {
    const exam = await this.prisma.exam.findFirst({
      where: { id: examId, subject: { teacherId } },
    });
    if (!exam) throw new ForbiddenException();
    return this.prisma.submission.findMany({
      where: { session: { examId } },
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
