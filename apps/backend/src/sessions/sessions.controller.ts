import { Body, Controller, Get, Param, Post, Req, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Role } from "@prisma/client";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { Roles, RolesGuard } from "../auth/guards/roles.guard";
import { EventDto, JoinExamDto } from "./dto/sessions.dto";
import { MonitoringAnalysisService } from "./monitoring-analysis.service";
import { SessionsService } from "./sessions.service";

@Controller("sessions") @UseGuards(JwtAuthGuard, RolesGuard)
export class SessionsController {
  constructor(private s: SessionsService, private analysis: MonitoringAnalysisService) {}
  @Post("join") @Roles(Role.STUDENT) join(@Req() r: any, @Body() b: JoinExamDto) { return this.s.join(b.roomCode, r.user.id); }
  @Get("monitorable-exams") @Roles(Role.TEACHER) monitorableExams(@Req() r: any) { return this.s.monitorableExams(r.user.id); }
  @Post(":id/camera-sample") @Roles(Role.STUDENT) @UseInterceptors(FileInterceptor("frame")) camera(@Req() r: any, @Param("id") id: string, @UploadedFile() file: Express.Multer.File) { return this.analysis.analyze(id, r.user.id, "face", file.buffer); }
  @Post(":id/audio-sample") @Roles(Role.STUDENT) @UseInterceptors(FileInterceptor("chunk")) audio(@Req() r: any, @Param("id") id: string, @UploadedFile() file: Express.Multer.File) { return this.analysis.analyze(id, r.user.id, "audio", file.buffer); }
  @Post(":id/events") @Roles(Role.STUDENT) event(@Req() r: any, @Param("id") id: string, @Body() b: EventDto) { return this.s.event(id, r.user.id, b.type as any, b.metadata); }
  @Post(":id/recording-chunks") @Roles(Role.STUDENT) @UseInterceptors(FileInterceptor("chunk")) chunk(@Req() r: any, @Param("id") id: string, @UploadedFile() f: Express.Multer.File) { return this.s.recording(id, r.user.id, f.buffer); }
  @Get("exam/:examId/monitor") @Roles(Role.TEACHER) monitor(@Req() r: any, @Param("examId") id: string) { return this.s.monitor(id, r.user.id); }
  @Post(":id/:action") @Roles(Role.TEACHER) control(@Req() r: any, @Param("id") id: string, @Param("action") a: "warn" | "lock" | "unlock") { return this.s.control(id, r.user.id, a); }
  @Get(":id/playback") @Roles(Role.TEACHER) playback(@Req() r: any, @Param("id") id: string) { return this.s.playback(id, r.user.id); }
}
