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
import { runExclusive } from '../common/job-lock';
import { UpdateResultReleaseDto } from './dto/result-release.dto';
import { isPastGrace, sessionRemainingSeconds } from './session-timing';
import {
  round2,
  scoreAnswer,
  type ScorableQuestion,
  type SubmittedAnswer as ScoringAnswer,
} from './scoring';

const HEARTBEAT_WRITE_INTERVAL_MS = 60_000;

type SubmittedAnswer = ScoringAnswer;

@Injectable()
export class GradingService implements OnModuleInit, OnModuleDestroy {
  private timeoutTimer?: NodeJS.Timeout;
  constructor(private prisma: PrismaService) {}

  onModuleInit() {
    this.timeoutTimer = setInterval(
      () =>
        void runExclusive(this.prisma, 'finish-expired-sessions', () =>
          this.finishExpiredSessions()
        ).catch(() => undefined),
      10_000
    );
  }

  onModuleDestroy() {
    if (this.timeoutTimer) clearInterval(this.timeoutTimer);
  }

  /** Points for one answer, or null when the teacher must grade it. */
  private objectivePoints(question: ScorableQuestion, answer: SubmittedAnswer) {
    return scoreAnswer(question, answer);
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
        submission: { include: { answers: true } },
      },
    });
    if (!session) throw new ForbiddenException();
    if (session.isLocked)
      throw new ForbiddenException('Your teacher has locked this attempt');
    if (isPastGrace(session, session.exam))
      throw new ConflictException('Time is up for this assessment');
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
    const draft = session.submission;
    if (!draft) {
      await this.prisma.submission.create({
        data: {
          sessionId,
          submittedAt: null,
          maxScore: session.exam.totalPoints,
          totalScore: null,
          gradeStatus: GradeStatus.UNGRADED,
          answers: { create: rows },
        },
      });
      return { savedAt: new Date() };
    }
    // Autosave runs after every edit; write only the answers that changed
    // (usually one) instead of deleting and re-inserting the whole draft.
    const saved = new Map(draft.answers.map((answer) => [answer.questionId, answer]));
    const changed = rows.filter((row) => {
      const previous = saved.get(row.questionId);
      return (
        !previous ||
        previous.responseText !== row.responseText ||
        previous.selectedOptionIds.length !== row.selectedOptionIds.length ||
        previous.selectedOptionIds.some(
          (id, index) => id !== row.selectedOptionIds[index]
        )
      );
    });
    if (changed.length)
      await this.prisma.$transaction(
        changed.map((row) =>
          this.prisma.answer.upsert({
            where: {
              submissionId_questionId: {
                submissionId: draft.id,
                questionId: row.questionId,
              },
            },
            create: { ...row, submissionId: draft.id },
            update: {
              responseText: row.responseText,
              selectedOptionIds: row.selectedOptionIds,
            },
          })
        )
      );
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
        result: this.studentReceipt(session.submission),
      };

    const remainingSeconds = sessionRemainingSeconds(session, session.exam, now);
    if (remainingSeconds <= 0) {
      const result = this.studentReceipt(await this.finalizeSession(sessionId));
      return { expired: true, remainingSeconds: 0, result };
    }
    // The countdown is computed from the wall clock, so these columns are only
    // "last seen" bookkeeping. Writing them every 5 s per student was the
    // largest source of database commits in the load test; once a minute is
    // plenty.
    if (
      !session.lastHeartbeatAt ||
      +now - +session.lastHeartbeatAt >= HEARTBEAT_WRITE_INTERVAL_MS
    )
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

  /**
   * What a student is told right after submitting: no score and no
   * per-question marks. Results are released only after the exam closes, so
   * an early finisher cannot tell classmates which answers were right.
   */
  studentReceipt(
    submission: { id: string; submittedAt: Date | null; maxScore: number; mode?: string } | null
  ) {
    if (!submission) return null;
    return {
      id: submission.id,
      submittedAt: submission.submittedAt,
      maxScore: submission.maxScore,
      mode: submission.mode,
      resultsPending: true as const,
    };
  }

  /**
   * Grades whatever the student last saved and closes the attempt. Used when
   * time runs out, when the exam window closes, and when a teacher stops the
   * exam, so an unsubmitted attempt is never left without a score.
   */
  async finalizeSession(
    sessionId: string,
    mode: SubmissionMode = SubmissionMode.AUTO_TIMEOUT
  ) {
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
    try {
      return await this.submit(sessionId, session.studentId, answers, mode);
    } catch (error) {
      // Another path (manual submit, heartbeat, expiry job) finished first.
      if (error instanceof ConflictException)
        return this.prisma.submission.findUnique({
          where: { sessionId },
          include: { answers: true },
        });
      throw error;
    }
  }

  /** Finalizes every open attempt for an exam (window closed or stopped). */
  async finalizeExam(examId: string) {
    const sessions = await this.prisma.examSession.findMany({
      where: {
        examId,
        status: { in: [SessionStatus.IN_PROGRESS, SessionStatus.DISCONNECTED] },
      },
      select: { id: true },
    });
    await Promise.allSettled(
      sessions.map((session) => this.finalizeSession(session.id))
    );
  }

  private async finishExpiredSessions() {
    const now = new Date();
    const sessions = await this.prisma.examSession.findMany({
      where: {
        status: { in: [SessionStatus.IN_PROGRESS, SessionStatus.DISCONNECTED] },
      },
      select: {
        id: true,
        startedAt: true,
        timerStartedAt: true,
        extraTimeSeconds: true,
        exam: { select: { durationMinutes: true, endsAt: true } },
      },
    });
    // Students who never come back are finalized once their grace window has
    // passed, so an in-flight manual submission still wins the race.
    await Promise.allSettled(
      sessions
        .filter((session) => isPastGrace(session, session.exam, now))
        .map((session) => this.finalizeSession(session.id))
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
    if (mode === SubmissionMode.MANUAL) {
      if (session.isLocked)
        throw new ForbiddenException('Your teacher has locked this attempt');
      if (isPastGrace(session, session.exam)) {
        // Too late to accept new answers: grade the last saved draft instead.
        await this.finalizeSession(sessionId);
        throw new ConflictException(
          'Time is up. Your last saved answers were submitted automatically.'
        );
      }
    }
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
    const totalScore = round2(
      rows.reduce((total, answer) => total + (answer.awardedPoints ?? 0), 0)
    );
    const hasEssay = session.exam.questions.some(
      (question) => question.type === QuestionType.ESSAY
    );
    const submission = await this.prisma.$transaction(async (tx) => {
      const endedAt = new Date();
      // Claim the attempt first; only one finalize path can win.
      const claimed = await tx.examSession.updateMany({
        where: { id: sessionId, status: { not: SessionStatus.COMPLETED } },
        data: { status: SessionStatus.COMPLETED, endedAt },
      });
      if (!claimed.count)
        throw new ConflictException('This exam has already been submitted');
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
              {
                session: {
                  student: {
                    fullName: { contains: search, mode: 'insensitive' },
                  },
                },
              },
              {
                session: {
                  student: {
                    studentProfile: {
                      studentId: { contains: search, mode: 'insensitive' },
                    },
                  },
                },
              },
              {
                session: {
                  exam: { title: { contains: search, mode: 'insensitive' } },
                },
              },
              {
                session: {
                  exam: {
                    subject: {
                      OR: [
                        { code: { contains: search, mode: 'insensitive' } },
                        { name: { contains: search, mode: 'insensitive' } },
                      ],
                    },
                  },
                },
              },
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
    if (!submission)
      throw new NotFoundException('Archived submission not found');
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
    // Partial credit allows up to two decimals (e.g. 1.5 or 1.33).
    if (
      !Number.isFinite(points) ||
      points < 0 ||
      points > answer.question.points ||
      Math.abs(round2(points) - points) > 1e-9
    )
      throw new ConflictException(
        "Points must be within the question's range, with at most two decimals"
      );
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
        totalScore: round2(
          answers.reduce((total, item) => total + (item.awardedPoints ?? 0), 0)
        ),
        gradeStatus: pending
          ? GradeStatus.UNGRADED
          : GradeStatus.TEACHER_CONFIRMED,
      },
    });
  }
}
