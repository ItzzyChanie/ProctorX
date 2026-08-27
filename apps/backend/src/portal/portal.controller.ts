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
  Delete,
  UseGuards,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/guards/roles.guard';
import { PortalService } from './portal.service';
import {
  CreateAcademicPeriodDto,
  InviteProfessorDto,
  RaiseHandDto,
  UpdateFacultyDto,
} from './dto/portal.dto';
import {
  AuditLogQueryDto,
  DeanAnalyticsQueryDto,
  TeacherDashboardQueryDto,
} from './dto/query.dto';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class PortalController {
  constructor(private p: PortalService) {}
  @Get('academic-periods')
  @Roles(Role.TEACHER, Role.DEAN, Role.STUDENT)
  academicPeriods() {
    return this.p.academicPeriods();
  }
  @Post('dean/academic-periods') @Roles(Role.DEAN) createAcademicPeriod(
    @Req() r: any,
    @Body() body: CreateAcademicPeriodDto
  ) {
    return this.p.createAcademicPeriod(r.user.id, body);
  }
  @Post('dean/academic-periods/:id/close')
  @Roles(Role.DEAN)
  closeAcademicPeriod(@Req() r: any, @Param('id') id: string) {
    return this.p.closeAcademicPeriod(r.user.id, id);
  }
  @Post('dean/academic-periods/:id/reopen')
  @Roles(Role.DEAN)
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
    @Req() r: any,
    @Query() q: TeacherDashboardQueryDto
  ) {
    return this.p.teacherDashboard(r.user.id, q);
  }

  @Get('dean/dashboard') @Roles(Role.DEAN) deanDashboard(
    @Query() q: DeanAnalyticsQueryDto
  ) {
    return this.p.deanDashboard(q);
  }

  @Get('dean/analytics') @Roles(Role.DEAN) deanAnalytics(
    @Query() q: DeanAnalyticsQueryDto
  ) {
    return this.p.deanAnalytics(q);
  }

  @Get('dean/audit-logs') @Roles(Role.DEAN) audit(
    @Query() q: AuditLogQueryDto
  ) {
    return this.p.audit(q);
  }

  @Delete('dean/audit-logs/:id') @Roles(Role.DEAN) deleteAuditLog(
    @Param('id') id: string
  ) {
    return this.p.deleteAuditLog(id);
  }

  @Get('dean/professors') @Roles(Role.DEAN) professors() {
    return this.p.professors();
  }

  @Post('dean/professors/invite') @Roles(Role.DEAN) invite(
    @Req() r: any,
    @Body() b: InviteProfessorDto
  ) {
    return this.p.invite(r.user.id, b);
  }
  @Patch('dean/professors/:id') @Roles(Role.DEAN) updateFaculty(
    @Req() r: any,
    @Param('id') id: string,
    @Body() b: UpdateFacultyDto
  ) {
    return this.p.updateFaculty(r.user.id, id, b);
  }
  @Delete('dean/professors/:id') @Roles(Role.DEAN) deleteFaculty(
    @Req() r: any,
    @Param('id') id: string
  ) {
    return this.p.deleteFaculty(r.user.id, id);
  }
  @Post('dean/professors/import')
  @Roles(Role.DEAN)
  @UseInterceptors(FileInterceptor('file'))
  importFaculty(@Req() r: any, @UploadedFile() file: Express.Multer.File) {
    return this.p.importFaculty(r.user.id, file);
  }
}
