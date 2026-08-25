import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { GradeStatus, ReportFormat, ReportJobStatus } from '@prisma/client';
import { readFile } from 'fs/promises';
import { basename, extname } from 'path';
import { AiService } from '../ai/ai.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReportsService implements OnModuleInit, OnModuleDestroy {
  private syncTimer?: NodeJS.Timeout;
  constructor(
    private prisma: PrismaService,
    private ai: AiService
  ) {}
  onModuleInit() {
    this.syncTimer = setInterval(
      () => void this.syncPendingDeanReports(),
      10_000
    );
  }

  onModuleDestroy() {
    if (this.syncTimer) clearInterval(this.syncTimer);
  }

  private calibratedScore(
    score: { score: number; tier: string } | undefined,
    tabSwitches: number
  ) {
    const minimum = tabSwitches >= 6 ? 70 : tabSwitches >= 3 ? 35 : 0;
    const value = Math.max(score?.score ?? 0, minimum);
    return {
      score: value,
      tier: value >= 70 ? 'HIGH' : value >= 35 ? 'MEDIUM' : 'LOW',
    };
  }

  async export(sessionId: string, teacherId: string) {
    const session = await this.prisma.examSession.findUnique({
      where: { id: sessionId },
      include: {
        student: { select: { fullName: true } },
        exam: { include: { subject: true } },
        events: { orderBy: { occurredAt: 'asc' } },
        scoreHistory: { orderBy: { computedAt: 'desc' }, take: 1 },
      },
    });

    if (!session) throw new NotFoundException('Session not found');
    
    if (session.exam.subject.teacherId !== teacherId)
      throw new ForbiddenException();
    const snapshot = session.scoreHistory[0];
    const score = this.calibratedScore(
      snapshot,
      session.events.filter((event) => event.type === 'TAB_SWITCH').length
    );
    return this.ai.requestReport(
      {
        session_id: session.id,
        student: session.student.fullName,
        exam: `${session.exam.subject.code} — ${session.exam.title}`,
        events: session.events.map((event) => ({
          type: event.type,
          intensity: event.intensity,
          occurred_at: event.occurredAt.toISOString(),
          evidence_path: event.evidencePath,
        })),
        final_score: { ...score, factors: snapshot?.contributingFactors ?? [] },
      },
      'pdf'
    );
  }

  jobStatus(jobId: string) {
    return this.ai.jobStatus(jobId);
  }

  async jobDownload(jobId: string) {
    const job = await this.ai.jobStatus(jobId);
    const path =
      job.status === 'SUCCESS' && typeof job.result?.path === 'string'
        ? job.result.path
        : undefined;

    if (!path || extname(path).toLowerCase() !== '.pdf')
      throw new NotFoundException('PDF report is not available');

    try {
      return { buffer: await readFile(path), filename: basename(path) };
    } 
    catch {
      throw new NotFoundException('Generated PDF file could not be found');
    }
  }

  async incidents(teacherId: string) {
    const sessions = await this.prisma.examSession.findMany({
      where: { exam: { subject: { teacherId } }, events: { some: {} } },
      select: {
        id: true,
        startedAt: true,
        student: { select: { id: true, fullName: true } },
        exam: { select: { title: true, subject: { select: { code: true } } } },
        events: { orderBy: { occurredAt: 'desc' } },
        scoreHistory: {
          orderBy: { computedAt: 'desc' },
          take: 1,
          select: { score: true, tier: true },
        },
      },
      orderBy: { startedAt: 'desc' },
      take: 100,
    });
    return sessions.map((session) => {
      const score = this.calibratedScore(
        session.scoreHistory[0],
        session.events.filter((event) => event.type === 'TAB_SWITCH').length
      );
      return {
        ...session,
        scoreHistory: [score],
        eventCount: session.events.length,
        latestEventAt: session.events[0]?.occurredAt ?? session.startedAt,
      };
    });
  }

  async removeIncident(sessionId: string, teacherId: string) {
    const session = await this.prisma.examSession.findFirst({
      where: { id: sessionId, exam: { subject: { teacherId } } },
      select: { id: true },
    });

    if (!session) throw new NotFoundException('Incident report not found');
    await this.prisma.$transaction([
      this.prisma.incident.deleteMany({ where: { sessionId } }),
      this.prisma.proctoringEvent.deleteMany({ where: { sessionId } }),
      this.prisma.suspicionScoreSnapshot.deleteMany({ where: { sessionId } }),
    ]);
    await this.prisma.auditLog.create({
      data: {
        actorId: teacherId,
        action: 'INCIDENT_REPORT_DELETED',
        targetType: 'ExamSession',
        targetId: sessionId,
      },
    });
    return { deleted: true };
  }

  async correlation(examId: string, teacherId: string) {
    const exam = await this.prisma.exam.findFirst({
      where: { id: examId, subject: { teacherId } },
    });

    if (!exam) throw new ForbiddenException();
    const ended =
      exam.status !== 'PUBLISHED' ||
      (!!exam.endsAt && exam.endsAt <= new Date());
    if (!ended)
      throw new ForbiddenException(
        'Correlation is available after the exam has ended'
      );
    const submissions = await this.prisma.submission.findMany({
      where: {
        session: { examId },
        gradeStatus: GradeStatus.TEACHER_CONFIRMED,
        totalScore: { not: null },
      },
      include: {
        session: {
          include: {
            events: { select: { type: true } },
            scoreHistory: { orderBy: { computedAt: 'desc' }, take: 1 },
          },
        },
      },
    });

    const pairs = submissions.flatMap((submission) => {
      if (submission.totalScore === null || submission.maxScore <= 0) return [];
      const tabSwitches = submission.session.events.filter(
        (event) => event.type === 'TAB_SWITCH'
      ).length;
      const score = this.calibratedScore(
        submission.session.scoreHistory[0],
        tabSwitches
      );
      return [
        {
          suspicion_score: score.score,
          exam_score: Math.round(
            (submission.totalScore / submission.maxScore) * 100
          ),
        },
      ];
    });
    return this.ai.correlation(pairs);
  }

  private async syncDeanReport(row: {
    id: string;
    status: ReportJobStatus;
    filters: unknown;
  }) {
    if (
      row.status !== ReportJobStatus.PENDING &&
      row.status !== ReportJobStatus.PROCESSING
    )
      return;
    const filters =
      row.filters && typeof row.filters === 'object'
        ? (row.filters as Record<string, unknown>)
        : {};
    const jobId = typeof filters.jobId === 'string' ? filters.jobId : undefined;

    if (!jobId) return;
    try {
      const job = await this.ai.jobStatus(jobId);
      if (job.status === 'SUCCESS')
        await this.prisma.generatedReport.update({
          where: { id: row.id },
          data: {
            status: ReportJobStatus.COMPLETE,
            downloadPath: job.result?.path ?? null,
          },
        });
      if (['FAILURE', 'REVOKED'].includes(job.status))
        await this.prisma.generatedReport.update({
          where: { id: row.id },
          data: {
            status: ReportJobStatus.FAILED,
            errorMessage: String(job.result ?? 'Celery report job failed'),
          },
        });
    } 
    catch {
      /* retain PROCESSING while the AI worker/result backend is unavailable */
    }
  }

  private async syncPendingDeanReports() {
    const rows = await this.prisma.generatedReport.findMany({
      where: {
        status: { in: [ReportJobStatus.PENDING, ReportJobStatus.PROCESSING] },
      },
      select: { id: true, status: true, filters: true },
    });
    await Promise.all(rows.map((row) => this.syncDeanReport(row)));
  }

  async deanReports(deanId: string) {
    await this.syncPendingDeanReports();
    const rows = await this.prisma.generatedReport.findMany({
      where: { requestedById: deanId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((x) => ({
      id: x.id,
      name: x.name,
      format: x.format,
      status: x.status,
      createdAt: x.createdAt,
      downloadPath:
        x.status === ReportJobStatus.COMPLETE
          ? `/dean/reports/${x.id}/download`
          : null,
    }));
  }

  async deanReportDownload(deanId: string, id: string) {
    const row = await this.prisma.generatedReport.findFirst({
      where: { id, requestedById: deanId, status: ReportJobStatus.COMPLETE },
    });
    if (!row?.downloadPath)
      throw new NotFoundException('Report is not available');
    return row.downloadPath;
  }

  async createDeanReport(
    deanId: string,
    body: {
      name: string;
      dateFrom: string;
      dateTo: string;
      program?: string;
      yearLevel?: string;
      section?: string;
      subjectCode?: string;
      format: 'pdf' | 'excel';
    }
  ) {
    const format =
      body.format === 'excel' ? ReportFormat.EXCEL : ReportFormat.PDF;
    const dateFrom = new Date(body.dateFrom),
      dateTo = new Date(body.dateTo);

    if (Number.isNaN(+dateFrom) || Number.isNaN(+dateTo) || dateFrom > dateTo)
      throw new NotFoundException('A valid report date range is required');
    const filters = {
      program: body.program,
      yearLevel: body.yearLevel,
      section: body.section,
      subjectCode: body.subjectCode,
    };
    const record = await this.prisma.generatedReport.create({
      data: {
        requestedById: deanId,
        name: body.name,
        dateFrom,
        dateTo,
        format,
        filters,
        status: ReportJobStatus.PENDING,
      },
    });

    try {
      const profile: any = {
        ...(body.program ? { program: body.program } : {}),
        ...(body.yearLevel ? { yearLevel: body.yearLevel } : {}),
        ...(body.section ? { section: body.section } : {}),
      };
      const sessions = await this.prisma.examSession.findMany({
        where: {
          startedAt: { gte: dateFrom, lte: dateTo },
          ...(body.subjectCode
            ? { exam: { subject: { code: body.subjectCode } } }
            : {}),
          ...(Object.keys(profile).length
            ? { student: { studentProfile: { is: profile } } }
            : {}),
        },
        include: {
          events: true,
          scoreHistory: { orderBy: { computedAt: 'desc' }, take: 1 },
        },
      });
      const events = sessions.flatMap((s) =>
        s.events.map((e) => ({
          type: e.type,
          intensity: e.intensity,
          occurred_at: e.occurredAt.toISOString(),
        }))
      );
      const average = sessions.length
        ? Math.round(
            sessions.reduce(
              (sum, s) => sum + (s.scoreHistory[0]?.score ?? 0),
              0
            ) / sessions.length
          )
        : 0;
      const job = await this.ai.requestReport(
        {
          session_id: record.id,
          student: 'Department-wide',
          exam: record.name,
          events,
          final_score: {
            score: average,
            tier: average >= 70 ? 'High' : average >= 40 ? 'Medium' : 'Low',
            factors: [`${sessions.length} filtered sessions`],
          },
        },
        format === ReportFormat.EXCEL ? 'excel' : 'pdf'
      );
      await this.prisma.generatedReport.update({
        where: { id: record.id },
        data: {
          status: ReportJobStatus.PROCESSING,
          filters: { ...filters, jobId: job.job_id },
        },
      });
    } 
    catch (error) {
      await this.prisma.generatedReport.update({
        where: { id: record.id },
        data: {
          status: ReportJobStatus.FAILED,
          errorMessage:
            error instanceof Error ? error.message : 'Unable to enqueue report',
        },
      });
      throw error;
    }
    return { reportId: record.id, status: 'PENDING' };
  }
}
