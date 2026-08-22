import { Body, Controller, Get, Param, Post, Req, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { Role } from "@prisma/client";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { Roles, RolesGuard } from "../auth/guards/roles.guard";
import { ReportsService } from "./reports.service";
import { CreateDeanReportDto } from "./dto/dean-report.dto";
@Controller("dean/reports") @UseGuards(JwtAuthGuard,RolesGuard)
export class DeanReportsController { constructor(private reports:ReportsService){} @Get() @Roles(Role.DEAN) list(@Req()req:any){return this.reports.deanReports(req.user.id)} @Get(":id/download") @Roles(Role.DEAN) async download(@Req()req:any,@Param("id")id:string,@Res()res:Response){return res.download(await this.reports.deanReportDownload(req.user.id,id));} @Post() @Roles(Role.DEAN) create(@Req()req:any,@Body()body:CreateDeanReportDto){return this.reports.createDeanReport(req.user.id,body)} }
