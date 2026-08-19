import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Role } from "@prisma/client";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { Roles, RolesGuard } from "../auth/guards/roles.guard";
import {
  CreateExamDto,
  CreateSubjectDto,
  EnrollStudentDto,
} from "./dto/subjects.dto";
import { SubjectsService } from "./subjects.service";
@Controller("subjects")
@UseGuards(JwtAuthGuard, RolesGuard)
export class SubjectsController {
  constructor(private subjects: SubjectsService) {}
  @Get("mine") @Roles(Role.TEACHER, Role.STUDENT) mine(@Req() req: any) {
    return this.subjects.mine(req.user.id, req.user.role);
  }
  @Post() @Roles(Role.TEACHER) create(
    @Req() req: any,
    @Body() body: CreateSubjectDto,
  ) {
    return this.subjects.create(req.user.id, body);
  }
  @Get(":id/students") @Roles(Role.TEACHER) students(
    @Param("id") id: string,
    @Req() req: any,
  ) {
    return this.subjects.students(id, req.user.id);
  }
  @Get(":id/available-students") @Roles(Role.TEACHER) available(
    @Param("id") id: string,
    @Req() req: any,
    @Query("search") search?: string,
  ) {
    return this.subjects.availableStudents(id, req.user.id, search);
  }
  @Post(":id/enrollments") @Roles(Role.TEACHER) enroll(
    @Param("id") id: string,
    @Req() req: any,
    @Body() body: EnrollStudentDto,
  ) {
    return this.subjects.enroll(id, body.studentId, req.user.id);
  }
  @Get(":id/exams") @Roles(Role.TEACHER) exams(
    @Param("id") id: string,
    @Req() req: any,
  ) {
    return this.subjects.exams(id, req.user.id);
  }
  @Post(":id/exams") @Roles(Role.TEACHER) exam(
    @Param("id") id: string,
    @Req() req: any,
    @Body() body: CreateExamDto,
  ) {
    return this.subjects.createExam(id, req.user.id, body);
  }
}
