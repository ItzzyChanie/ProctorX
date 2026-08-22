import { Body, Controller, Get, Param, ParseEnumPipe, ParseFilePipeBuilder, Post, Req, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Role } from "@prisma/client";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { Roles, RolesGuard } from "../auth/guards/roles.guard";
import { ConfirmGradeDto, EventDto, JoinExamDto, SubmitDto, TeacherSessionAction } from "./dto/sessions.dto";
import { GradingService } from "./grading.service";
import { MonitoringAnalysisService } from "./monitoring-analysis.service";
import { SessionsService } from "./sessions.service";

@Controller("sessions") @UseGuards(JwtAuthGuard, RolesGuard)
export class SessionsController {
  constructor(private s: SessionsService, private analysis: MonitoringAnalysisService, private grading: GradingService) {}
  @Post("join") @Roles(Role.STUDENT) join(@Req() r: any, @Body() b: JoinExamDto) { return this.s.join(b.roomCode, r.user.id); }
  @Post("preview") @Roles(Role.STUDENT) preview(@Req() r: any, @Body() b: JoinExamDto) { return this.s.preview(b.roomCode, r.user.id); }
  @Get("monitorable-exams") @Roles(Role.TEACHER) monitorableExams(@Req() r: any) { return this.s.monitorableExams(r.user.id); }
  @Post(":id/submit") @Roles(Role.STUDENT) submit(@Req() r: any, @Param("id") id: string, @Body() body: SubmitDto) { return this.grading.submit(id, r.user.id, body.answers); }
  @Get("exam/:examId/submissions") @Roles(Role.TEACHER) submissions(@Req() r: any, @Param("examId") examId: string) { return this.grading.listForExam(examId, r.user.id); }
  @Post("grades/confirm") @Roles(Role.TEACHER) confirm(@Req() r: any, @Body() body: ConfirmGradeDto) { return this.grading.confirmAnswer(body.answerId, r.user.id, body.points); }
  @Post(":id/camera-sample") @Roles(Role.STUDENT) @UseInterceptors(FileInterceptor("frame")) camera(@Req() r: any, @Param("id") id: string, @UploadedFile(new ParseFilePipeBuilder().addFileTypeValidator({fileType:/^image\/(jpeg|png)$/}).addMaxSizeValidator({maxSize:5_000_000}).build()) file: Express.Multer.File) { return this.analysis.analyze(id, r.user.id, "face", file.buffer); }
  @Post(":id/audio-sample") @Roles(Role.STUDENT) @UseInterceptors(FileInterceptor("chunk")) audio(@Req() r: any, @Param("id") id: string, @UploadedFile(new ParseFilePipeBuilder().addFileTypeValidator({fileType:/^(audio\/(wav|webm|ogg)|video\/webm)$/}).addMaxSizeValidator({maxSize:10_000_000}).build()) file: Express.Multer.File) { return this.analysis.analyze(id, r.user.id, "audio", file.buffer); }
  @Post(":id/events") @Roles(Role.STUDENT) event(@Req() r: any, @Param("id") id: string, @Body() b: EventDto) { return this.s.event(id, r.user.id, b.type as any, b.metadata); }
  @Post(":id/recording-chunks") @Roles(Role.STUDENT) @UseInterceptors(FileInterceptor("chunk")) chunk(@Req() r: any, @Param("id") id: string, @UploadedFile(new ParseFilePipeBuilder().addFileTypeValidator({fileType:/^video\/webm$/}).addMaxSizeValidator({maxSize:25_000_000}).build()) f: Express.Multer.File) { return this.s.recording(id, r.user.id, f.buffer); }
  @Get("exam/:examId/monitor") @Roles(Role.TEACHER) monitor(@Req() r: any, @Param("examId") id: string) { return this.s.monitor(id, r.user.id); }
  @Post(":id/:action") @Roles(Role.TEACHER) control(@Req() r: any, @Param("id") id: string, @Param("action", new ParseEnumPipe(TeacherSessionAction)) a: TeacherSessionAction) { return this.s.control(id, r.user.id, a); }
  @Get(":id/playback") @Roles(Role.TEACHER) playback(@Req() r: any, @Param("id") id: string) { return this.s.playback(id, r.user.id); }
}
