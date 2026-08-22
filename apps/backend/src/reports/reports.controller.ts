import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { Role } from "@prisma/client";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { Roles, RolesGuard } from "../auth/guards/roles.guard";
import { ReportsService } from "./reports.service";
@Controller("reports") @UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(private reports: ReportsService) {}
  @Get("incidents") @Roles(Role.TEACHER) incidents(@Req() req: any) { return this.reports.incidents(req.user.id); }
  @Get(":sessionId/export") @Roles(Role.TEACHER) export(@Req() req: any, @Param("sessionId") sessionId: string, @Query("format") format: "pdf" | "html" = "pdf") { return this.reports.export(sessionId, req.user.id, format === "html" ? "html" : "pdf"); }
  @Get("jobs/:jobId") @Roles(Role.TEACHER) job(@Param("jobId") jobId: string) { return this.reports.jobStatus(jobId); }
  @Get("exams/:examId/correlation") @Roles(Role.TEACHER) correlation(@Req() req: any, @Param("examId") examId: string) { return this.reports.correlation(examId, req.user.id); }
}
