import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseEnumPipe,
  ParseFilePipeBuilder,
  Post,
  Patch,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/guards/roles.guard';
import {
  PermissionsGuard,
  RequirePermission,
} from '../auth/guards/permissions.guard';
import {
  ConfirmGradeDto,
  EventDto,
  EvidenceClipDto,
  JoinExamDto,
  SaveDraftDto,
  SendWarningDto,
  AddExtraTimeDto,
  SubmitDto,
  TeacherSessionAction,
} from './dto/sessions.dto';
import { UpdateResultReleaseDto } from './dto/result-release.dto';
import { GradingService } from './grading.service';
import { MonitoringAnalysisService } from './monitoring-analysis.service';
import { SessionsService } from './sessions.service';

@Controller('sessions')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class SessionsController {
  constructor(
    private s: SessionsService,
    private analysis: MonitoringAnalysisService,
    private grading: GradingService
  ) {}
  @Post('join') @Roles(Role.STUDENT) join(
    @Req() r: any,
    @Body() b: JoinExamDto
  ) {
    return this.s.join(b.roomCode, r.user.id);
  }
  @Post('preview') @Roles(Role.STUDENT) preview(
    @Req() r: any,
    @Body() b: JoinExamDto
  ) {
    return this.s.preview(b.roomCode, r.user.id);
  }
  @Get('monitorable-exams') @Roles(Role.TEACHER)
  @RequirePermission('VIEW_OWN_CLASS_SESSIONS') monitorableExams(
    @Req() r: any
  ) {
    return this.s.monitorableExams(r.user.id);
  }
  @Post(':id/submit') @Roles(Role.STUDENT) submit(
    @Req() r: any,
    @Param('id') id: string,
    @Body() body: SubmitDto
  ) {
    return this.grading.submit(id, r.user.id, body.answers);
  }
  @Post(':id/draft') @Roles(Role.STUDENT) saveDraft(
    @Req() r: any,
    @Param('id') id: string,
    @Body() body: SaveDraftDto
  ) {
    return this.grading.saveDraft(id, r.user.id, body.answers);
  }
  @Post(':id/heartbeat') @Roles(Role.STUDENT) heartbeat(
    @Req() r: any,
    @Param('id') id: string
  ) {
    return this.grading.heartbeat(id, r.user.id);
  }
  @Get('submissions') @Roles(Role.TEACHER)
  @RequirePermission('VIEW_OWN_CLASS_SESSIONS') submitted(
    @Req() r: any,
    @Query() query: Record<string, string | undefined>
  ) {
    return this.grading.submitted(r.user.id, query);
  }
  @Get('submissions/:submissionId') @Roles(Role.TEACHER)
  @RequirePermission('VIEW_OWN_CLASS_SESSIONS') submissionDetail(
    @Req() r: any,
    @Param('submissionId') submissionId: string
  ) {
    return this.grading.submissionDetail(submissionId, r.user.id);
  }
  @Post('submissions/:submissionId/restore')
  @Roles(Role.TEACHER)
  @RequirePermission('FLAG_STUDENT')
  restoreSubmission(
    @Req() r: any,
    @Param('submissionId') submissionId: string
  ) {
    return this.grading.restoreSubmission(submissionId, r.user.id);
  }
  @Delete('submissions/:submissionId') @Roles(Role.TEACHER)
  @RequirePermission('FLAG_STUDENT') removeSubmission(
    @Req() r: any,
    @Param('submissionId') submissionId: string
  ) {
    return this.grading.removeSubmission(submissionId, r.user.id);
  }
  @Get('exam/:examId/submissions') @Roles(Role.TEACHER)
  @RequirePermission('VIEW_OWN_CLASS_SESSIONS') submissions(
    @Req() r: any,
    @Param('examId') examId: string
  ) {
    return this.grading.listForExam(examId, r.user.id);
  }
  @Patch('submissions/:submissionId/release-settings')
  @Roles(Role.TEACHER)
  @RequirePermission('FLAG_STUDENT')
  updateReleaseSettings(
    @Req() r: any,
    @Param('submissionId') submissionId: string,
    @Body() body: UpdateResultReleaseDto
  ) {
    return this.grading.updateResultRelease(submissionId, r.user.id, body);
  }
  @Post('grades/confirm') @Roles(Role.TEACHER)
  @RequirePermission('FLAG_STUDENT') confirm(
    @Req() r: any,
    @Body() body: ConfirmGradeDto
  ) {
    return this.grading.confirmAnswer(body.answerId, r.user.id, body.points);
  }
  @Post(':id/camera-sample')
  @Roles(Role.STUDENT)
  @UseInterceptors(FileInterceptor('frame'))
  camera(
    @Req() r: any,
    @Param('id') id: string,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({ fileType: /^image\/(jpeg|png)$/ })
        .addMaxSizeValidator({ maxSize: 5_000_000 })
        .build()
    )
    file: Express.Multer.File
  ) {
    return this.analysis.analyze(id, r.user.id, 'face', file.buffer);
  }
  @Post(':id/audio-sample')
  @Roles(Role.STUDENT)
  @UseInterceptors(FileInterceptor('chunk'))
  audio(
    @Req() r: any,
    @Param('id') id: string,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({
          fileType: /^(audio\/(wav|webm|ogg)|video\/webm)$/,
        })
        .addMaxSizeValidator({ maxSize: 10_000_000 })
        .build()
    )
    file: Express.Multer.File
  ) {
    return this.analysis.analyze(id, r.user.id, 'audio', file.buffer);
  }
  @Post(':id/events') @Roles(Role.STUDENT) event(
    @Req() r: any,
    @Param('id') id: string,
    @Body() b: EventDto
  ) {
    return this.s.event(id, r.user.id, b.type as any, b.metadata);
  }
  @Post(':id/evidence-clips')
  @Roles(Role.STUDENT)
  @UseInterceptors(FileInterceptor('clip'))
  evidenceClip(
    @Req() r: any,
    @Param('id') id: string,
    @Body() body: EvidenceClipDto,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({ fileType: /^video\/webm(?:;.*)?$/i })
        .addMaxSizeValidator({ maxSize: 10_000_000 })
        .build()
    )
    file: Express.Multer.File
  ) {
    return this.s.evidenceClip(id, r.user.id, body as any, file.buffer);
  }
  @Post(':id/recording-chunks')
  @Roles(Role.STUDENT)
  @UseInterceptors(FileInterceptor('chunk'))
  chunk(
    @Req() r: any,
    @Param('id') id: string,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({ fileType: /^video\/webm(?:;.*)?$/i })
        .addMaxSizeValidator({ maxSize: 25_000_000 })
        .build()
    )
    f: Express.Multer.File
  ) {
    return this.s.recording(id, r.user.id, f.buffer);
  }
  @Get('exam/:examId/monitor') @Roles(Role.TEACHER)
  @RequirePermission('VIEW_OWN_CLASS_SESSIONS') monitor(
    @Req() r: any,
    @Param('examId') id: string
  ) {
    return this.s.monitor(id, r.user.id);
  }
  @Get('extra-time-options/subject/:subjectId/student/:studentId')
  @Roles(Role.TEACHER)
  @RequirePermission('VIEW_OWN_CLASS_SESSIONS')
  extraTimeOptions(
    @Req() r: any,
    @Param('subjectId') subjectId: string,
    @Param('studentId') studentId: string
  ) {
    return this.s.extraTimeOptions(subjectId, studentId, r.user.id);
  }
  @Patch('exam/:examId/student/:studentId/extra-time')
  @Roles(Role.TEACHER)
  @RequirePermission('FLAG_STUDENT')
  grantPreExamExtraTime(
    @Req() r: any,
    @Param('examId') examId: string,
    @Param('studentId') studentId: string,
    @Body() body: AddExtraTimeDto
  ) {
    return this.s.grantPreExamExtraTime(
      examId,
      studentId,
      r.user.id,
      body.minutes
    );
  }
  @Patch(':id/extra-time') @Roles(Role.TEACHER)
  @RequirePermission('FLAG_STUDENT') addExtraTime(
    @Req() r: any,
    @Param('id') id: string,
    @Body() body: AddExtraTimeDto
  ) {
    return this.s.addExtraTime(id, r.user.id, body.minutes);
  }
  @Post(':id/warnings') @Roles(Role.TEACHER)
  @RequirePermission('FLAG_STUDENT') sendWarning(
    @Req() r: any,
    @Param('id') id: string,
    @Body() body: SendWarningDto
  ) {
    return this.s.sendWarning(id, r.user.id, body.message);
  }
  @Post(':id/warnings/:warningId/acknowledge')
  @Roles(Role.STUDENT)
  acknowledgeWarning(
    @Req() r: any,
    @Param('id') id: string,
    @Param('warningId') warningId: string
  ) {
    return this.s.acknowledgeWarning(id, warningId, r.user.id);
  }
  @Post(':id/resume') @Roles(Role.TEACHER)
  @RequirePermission('FLAG_STUDENT') resume(
    @Req() r: any,
    @Param('id') id: string
  ) {
    return this.s.resume(id, r.user.id);
  }
  @Post(':id/:action') @Roles(Role.TEACHER)
  @RequirePermission('FLAG_STUDENT') control(
    @Req() r: any,
    @Param('id') id: string,
    @Param('action', new ParseEnumPipe(TeacherSessionAction))
    a: TeacherSessionAction
  ) {
    return this.s.control(id, r.user.id, a);
  }
  @Get(':id/playback') @Roles(Role.TEACHER)
  @RequirePermission('VIEW_OWN_CLASS_SESSIONS') playback(
    @Req() r: any,
    @Param('id') id: string
  ) {
    return this.s.playback(id, r.user.id);
  }
}
