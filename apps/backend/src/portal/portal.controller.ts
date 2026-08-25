import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/guards/roles.guard';
import { PortalService } from './portal.service';
import { InviteProfessorDto, RaiseHandDto } from './dto/portal.dto';
import { AuditLogQueryDto, DeanAnalyticsQueryDto } from './dto/query.dto';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class PortalController {
  constructor(private p: PortalService) {}
  @Get('students/me/sessions') @Roles(Role.STUDENT) sessions(@Req() r: any) {
    return this.p.studentSessions(r.user.id);
  }

  @Get('students/me/notifications') notifications(@Req() r: any) {
    return this.p.notifications(r.user.id);
  }

  @Patch('students/me/notifications/:id/read') read(
    @Req() r: any,
    @Param('id') id: string
  ) {
    return this.p.readNotification(r.user.id, id);
  }

  @Get('students/me/dashboard') dashboard(@Req() r: any) {
    return this.p.studentDashboard(r.user.id);
  }

  @Post('students/me/sessions/:sessionId/raise-hand') raise(
    @Req() r: any,
    @Param('sessionId') id: string,
    @Body() b: RaiseHandDto
  ) {
    return this.p.raise(r.user.id, id, b.reason);
  }

  @Get('teacher/me/notifications') @Roles(Role.TEACHER) teacherNotifications(
    @Req() r: any
  ) {
    return this.p.notifications(r.user.id);
  }

  @Patch('teacher/me/notifications/:id/read')
  @Roles(Role.TEACHER)
  readTeacherNotification(@Req() r: any, @Param('id') id: string) {
    return this.p.readNotification(r.user.id, id);
  }

  @Get('dean/me/notifications') @Roles(Role.DEAN) deanNotifications(
    @Req() r: any
  ) {
    return this.p.notifications(r.user.id);
  }

  @Patch('dean/me/notifications/:id/read')
  @Roles(Role.DEAN)
  readDeanNotification(@Req() r: any, @Param('id') id: string) {
    return this.p.readNotification(r.user.id, id);
  }

  @Get('teacher/exams') @Roles(Role.TEACHER) exams(@Req() r: any) {
    return this.p.teacherExams(r.user.id);
  }

  @Get('teacher/sessions/:id/playback') @Roles(Role.TEACHER) playback(
    @Req() r: any,
    @Param('id') id: string
  ) {
    return this.p.playback(r.user.id, id);
  }

  @Get('teacher/sessions/:id/recording') @Roles(Role.TEACHER) async recording(
    @Req() r: any,
    @Param('id') id: string,
    @Res() response: Response
  ) {
    const path = await this.p.recordingFile(r.user.id, id);
    return response.sendFile(path);
  }

  @Get('teacher/raise-hand-queue') @Roles(Role.TEACHER) queue(@Req() r: any) {
    return this.p.queue(r.user.id);
  }

  @Post('teacher/raise-hand-queue/:id/resolve') @Roles(Role.TEACHER) resolve(
    @Req() r: any,
    @Param('id') id: string
  ) {
    return this.p.resolve(r.user.id, id);
  }

  @Get('teacher/dashboard') @Roles(Role.TEACHER) teacherDashboard(
    @Req() r: any
  ) {
    return this.p.teacherDashboard(r.user.id);
  }

  @Get('dean/dashboard') @Roles(Role.DEAN) deanDashboard() {
    return this.p.deanDashboard();
  }

  @Get('dean/analytics') @Roles(Role.DEAN) deanAnalytics(
    @Query() q: DeanAnalyticsQueryDto
  ) {
    return this.p.deanAnalytics(q);
  }

  @Get('dean/audit-logs') @Roles(Role.DEAN) audit(
    @Query() q: AuditLogQueryDto
  ) {
    return this.p.audit(
      q.actor,
      q.action,
      q.dateFrom,
      q.dateTo,
      q.cursor,
      q.limit?.toString()
    );
  }

  @Get('dean/professors') @Roles(Role.DEAN) professors() {
    return this.p.professors();
  }

  @Post('dean/professors/invite') @Roles(Role.DEAN) invite(
    @Req() r: any,
    @Body() b: InviteProfessorDto
  ) {
    return this.p.invite(r.user.id, b.email, b.fullName);
  }
}
