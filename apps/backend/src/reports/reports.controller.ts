import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Patch,
  Query,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/guards/roles.guard';
import {
  PermissionsGuard,
  RequirePermission,
} from '../auth/guards/permissions.guard';
import { ReportsService } from './reports.service';
import { ReviewProctoringDto } from './dto/review-proctoring.dto';

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class ReportsController {
  constructor(private reports: ReportsService) {}
  @Get('incidents') @Roles(Role.TEACHER)
  @RequirePermission('VIEW_OWN_CLASS_SESSIONS') incidents(
    @Req() req: any,
    @Query('archive') archive?: string
  ) {
    return this.reports.incidents(req.user.id, archive === 'archived');
  }

  @Patch('incidents/:sessionId/review')
  @Roles(Role.TEACHER)
  @RequirePermission('FLAG_STUDENT')
  reviewProctoring(
    @Req() req: any,
    @Param('sessionId') sessionId: string,
    @Body() body: ReviewProctoringDto
  ) {
    return this.reports.reviewProctoring(sessionId, req.user.id, body.decision);
  }

  @Delete('incidents/:sessionId') @Roles(Role.TEACHER)
  @RequirePermission('FLAG_STUDENT') removeIncident(
    @Req() req: any,
    @Param('sessionId') sessionId: string
  ) {
    return this.reports.removeIncident(sessionId, req.user.id);
  }

  @Patch('incidents/:sessionId/restore')
  @Roles(Role.TEACHER)
  @RequirePermission('FLAG_STUDENT')
  restoreIncident(@Req() req: any, @Param('sessionId') sessionId: string) {
    return this.reports.restoreIncident(sessionId, req.user.id);
  }

  @Get(':sessionId/export') @Roles(Role.TEACHER)
  @RequirePermission('VIEW_OWN_CLASS_SESSIONS') export(
    @Req() req: any,
    @Param('sessionId') sessionId: string
  ) {
    return this.reports.export(sessionId, req.user.id);
  }
  @Get('jobs/:jobId') @Roles(Role.TEACHER)
  @RequirePermission('VIEW_OWN_CLASS_SESSIONS') job(
    @Req() req: any,
    @Param('jobId') jobId: string
  ) {
    return this.reports.jobStatus(jobId, req.user.id);
  }

  @Get('jobs/:jobId/download') @Roles(Role.TEACHER)
  @RequirePermission('VIEW_OWN_CLASS_SESSIONS') async download(
    @Req() req: any,
    @Param('jobId') jobId: string,
    @Res({ passthrough: true }) response: Response
  ) {
    const report = await this.reports.jobDownload(jobId, req.user.id);
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${report.filename}"`
    );
    return new StreamableFile(report.buffer);
  }

  @Get('exams/:examId/correlation') @Roles(Role.TEACHER)
  @RequirePermission('VIEW_OWN_CLASS_SESSIONS') correlation(
    @Req() req: any,
    @Param('examId') examId: string
  ) {
    return this.reports.correlation(examId, req.user.id);
  }
}
