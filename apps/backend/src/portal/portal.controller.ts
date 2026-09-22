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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  PermissionsGuard,
  RequirePermission,
} from '../auth/guards/permissions.guard';
import { Roles, RolesGuard } from '../auth/guards/roles.guard';
import { PortalService } from './portal.service';
import {
  CreateAcademicPeriodDto,
  InviteProfessorDto,
  RaiseHandDto,
  SetManagedAccountStatusDto,
  UpdateFacultyDto,
} from './dto/portal.dto';
import {
  AuditLogQueryDto,
  DeanAnalyticsQueryDto,
  TeacherDashboardQueryDto,
} from './dto/query.dto';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class PortalController {
  constructor(private p: PortalService) {}
  @Get('academic-periods')
  @Roles(Role.TEACHER, Role.DEAN, Role.STUDENT)
  academicPeriods(@Req() r: any) {
    return this.p.academicPeriods(r.user.institutionId);
  }
  @Post('dean/academic-periods')
  @Roles(Role.DEAN)
  @RequirePermission('MANAGE_ACADEMIC_PERIODS')
  createAcademicPeriod(
    @Req() r: any,
    @Body() body: CreateAcademicPeriodDto
  ) {
    return this.p.createAcademicPeriod(r.user.id, body);
  }
  @Post('dean/academic-periods/:id/close')
  @Roles(Role.DEAN)
  @RequirePermission('MANAGE_ACADEMIC_PERIODS')
  closeAcademicPeriod(@Req() r: any, @Param('id') id: string) {
    return this.p.closeAcademicPeriod(r.user.id, id);
  }
  @Post('dean/academic-periods/:id/reopen')
  @Roles(Role.DEAN)
  @RequirePermission('MANAGE_ACADEMIC_PERIODS')
  reopenAcademicPeriod(@Req() r: any, @Param('id') id: string) {
    return this.p.reopenAcademicPeriod(r.user.id, id);
  }
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

  @Get('students/me/dashboard')
  @Roles(Role.STUDENT)
  dashboard(@Req() r: any) {
    return this.p.studentDashboard(r.user.id);
  }

  @Get('students/me/assessments')
  @Roles(Role.STUDENT)
  assessments(@Req() r: any) {
    return this.p.studentAssessments(r.user.id);
  }

  @Get('students/me/sessions/:sessionId/result')
  @Roles(Role.STUDENT)
  result(@Req() r: any, @Param('sessionId') sessionId: string) {
    return this.p.studentResult(r.user.id, sessionId);
  }

  @Get('students/me/analytics')
  @Roles(Role.STUDENT)
  studentAnalytics(@Req() r: any) {
    return this.p.studentAnalytics(r.user.id);
  }

  @Patch('students/me/activities/:sessionId/archive')
  @Roles(Role.STUDENT)
  archiveActivity(@Req() r: any, @Param('sessionId') sessionId: string) {
    return this.p.setStudentActivityArchived(r.user.id, sessionId, true);
  }

  @Patch('students/me/activities/:sessionId/restore')
  @Roles(Role.STUDENT)
  restoreActivity(@Req() r: any, @Param('sessionId') sessionId: string) {
    return this.p.setStudentActivityArchived(r.user.id, sessionId, false);
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

  @Get('teacher/exams') @Roles(Role.TEACHER) exams(
    @Req() r: any,
    @Query('archive') archive?: string
  ) {
    return this.p.teacherExams(r.user.id, archive === 'archived');
  }

  @Patch('teacher/exams/:id/archive')
  @Roles(Role.TEACHER)
  archiveTeacherExam(@Req() r: any, @Param('id') id: string) {
    return this.p.setTeacherExamArchived(r.user.id, id, true);
  }

  @Patch('teacher/exams/:id/restore')
  @Roles(Role.TEACHER)
  restoreTeacherExam(@Req() r: any, @Param('id') id: string) {
    return this.p.setTeacherExamArchived(r.user.id, id, false);
  }

  @Get('teacher/sessions/:id/playback') @Roles(Role.TEACHER) playback(
    @Req() r: any,
    @Param('id') id: string
  ) {
    return this.p.playback(r.user.id, id);
  }

  @Get('teacher/evidence-clips/:id') @Roles(Role.TEACHER) async evidenceClip(
    @Req() r: any,
    @Param('id') id: string,
    @Res() response: Response
  ) {
    const path = await this.p.evidenceClipFile(r.user.id, id);
    response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    return response.sendFile(path);
  }
  @Get('teacher/sessions/:id/recording') @Roles(Role.TEACHER) async recording(
    @Req() r: any,
    @Param('id') id: string,
    @Res() response: Response
  ) {
    const path = await this.p.recordingFile(r.user.id, id);
    response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
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
    @Req() r: any,
    @Query() q: TeacherDashboardQueryDto
  ) {
    return this.p.teacherDashboard(r.user.id, q);
  }

  @Get('dean/dashboard')
  @Roles(Role.DEAN)
  @RequirePermission('VIEW_DEAN_ANALYTICS')
  deanDashboard(
    @Req() r: any,
    @Query() q: DeanAnalyticsQueryDto
  ) {
    return this.p.deanDashboard(r.user.institutionId, q);
  }

  @Get('dean/analytics')
  @Roles(Role.DEAN)
  @RequirePermission('VIEW_DEAN_ANALYTICS')
  deanAnalytics(
    @Req() r: any,
    @Query() q: DeanAnalyticsQueryDto
  ) {
    return this.p.deanAnalytics(r.user.institutionId, q);
  }

  @Get('dean/audit-logs')
  @Roles(Role.DEAN)
  @RequirePermission('VIEW_AUDIT_LOGS')
  audit(
    @Req() r: any,
    @Query() q: AuditLogQueryDto
  ) {
    return this.p.audit(r.user.institutionId, q);
  }

  @Get('dean/professors')
  @Roles(Role.DEAN)
  @RequirePermission('MANAGE_FACULTY')
  professors(@Req() r: any) {
    return this.p.professors(r.user.institutionId);
  }

  @Post('dean/professors/invite')
  @Roles(Role.DEAN)
  @RequirePermission('MANAGE_FACULTY')
  invite(
    @Req() r: any,
    @Body() b: InviteProfessorDto
  ) {
    return this.p.invite(r.user.id, b);
  }
  @Patch('dean/professors/:id')
  @Roles(Role.DEAN)
  @RequirePermission('MANAGE_FACULTY')
  updateFaculty(
    @Req() r: any,
    @Param('id') id: string,
    @Body() b: UpdateFacultyDto
  ) {
    return this.p.updateFaculty(r.user.id, id, b);
  }
  @Patch('dean/professors/:id/status')
  @Roles(Role.DEAN)
  @RequirePermission('MANAGE_FACULTY')
  setFacultyStatus(
    @Req() r: any,
    @Param('id') id: string,
    @Body() body: SetManagedAccountStatusDto
  ) {
    return this.p.setFacultyStatus(r.user.id, id, body.status);
  }
  @Post('dean/professors/import')
  @Roles(Role.DEAN)
  @RequirePermission('MANAGE_FACULTY')
  @UseInterceptors(FileInterceptor('file'))
  importFaculty(@Req() r: any, @UploadedFile() file: Express.Multer.File) {
    return this.p.importFaculty(r.user.id, file);
  }
}
