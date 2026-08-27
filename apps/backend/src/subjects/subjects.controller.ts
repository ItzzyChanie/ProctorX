import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/guards/roles.guard';
import {
  CreateExamDto,
  CreateSubjectDto,
  JoinSubjectDto,
  ReviewJoinRequestDto,
  UpdateSubjectDto,
  AssignSectionDto,
} from './dto/subjects.dto';
import { SubjectsService } from './subjects.service';
import type { QuestionCounts } from '../ai/ai.service';
@Controller('subjects')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SubjectsController {
  constructor(private subjects: SubjectsService) {}
  @Get('mine') @Roles(Role.TEACHER, Role.STUDENT) mine(@Req() req: any) {
    return this.subjects.mine(req.user.id, req.user.role);
  }
  @Post() @Roles(Role.TEACHER) create(
    @Req() req: any,
    @Body() body: CreateSubjectDto
  ) {
    return this.subjects.create(req.user.id, body);
  }
  @Patch(':id') @Roles(Role.TEACHER) update(
    @Param('id') id: string,
    @Req() req: any,
    @Body() body: UpdateSubjectDto
  ) {
    return this.subjects.update(id, req.user.id, body);
  }
  @Delete(':id') @Roles(Role.TEACHER) remove(
    @Param('id') id: string,
    @Req() req: any
  ) {
    return this.subjects.remove(id, req.user.id);
  }
  @Get(':id/students') @Roles(Role.TEACHER) students(
    @Param('id') id: string,
    @Req() req: any
  ) {
    return this.subjects.students(id, req.user.id);
  }
  @Delete(':id/students/:studentId') @Roles(Role.TEACHER) removeStudent(
    @Param('id') id: string,
    @Param('studentId') studentId: string,
    @Req() req: any
  ) {
    return this.subjects.removeStudent(id, studentId, req.user.id);
  }
  @Get('section-assignments/overview') @Roles(Role.TEACHER) sectionAssignments(
    @Req() req: any
  ) { return this.subjects.sectionAssignments(req.user.id); }
  @Post(':id/sections') @Roles(Role.TEACHER) assignSection(
    @Param('id') id: string, @Body() body: AssignSectionDto, @Req() req: any
  ) { return this.subjects.assignSection(id, body.sectionId, body.enrollCurrentStudents, req.user.id); }
  @Delete(':id/sections/:sectionId') @Roles(Role.TEACHER) unassignSection(
    @Param('id') id: string, @Param('sectionId') sectionId: string, @Req() req: any
  ) { return this.subjects.unassignSection(id, sectionId, req.user.id); }
  @Post('join') @Roles(Role.STUDENT) join(
    @Req() req: any,
    @Body() body: JoinSubjectDto
  ) {
    return this.subjects.requestJoin(body.code, req.user.id);
  }
  @Get('join-requests/mine') @Roles(Role.STUDENT) myRequests(@Req() req: any) {
    return this.subjects.studentJoinRequests(req.user.id);
  }
  @Get('join-requests/pending') @Roles(Role.TEACHER) pending(@Req() req: any) {
    return this.subjects.pendingJoinRequests(req.user.id);
  }
  @Post('join-requests/:requestId/review') @Roles(Role.TEACHER) review(
    @Param('requestId') requestId: string,
    @Req() req: any,
    @Body() body: ReviewJoinRequestDto
  ) {
    return this.subjects.reviewJoinRequest(requestId, req.user.id, body.status);
  }
  @Get(':id/exams') @Roles(Role.TEACHER) exams(
    @Param('id') id: string,
    @Req() req: any
  ) {
    return this.subjects.exams(id, req.user.id);
  }
  @Post(':id/exams') @Roles(Role.TEACHER) exam(
    @Param('id') id: string,
    @Req() req: any,
    @Body() body: CreateExamDto
  ) {
    return this.subjects.createExam(id, req.user.id, body);
  }
  @Post(':id/exams/:examId/stop') @Roles(Role.TEACHER) stopExam(
    @Param('id') id: string,
    @Param('examId') examId: string,
    @Req() req: any
  ) {
    return this.subjects.stopExam(id, examId, req.user.id);
  }
  @Post(':id/questions/generate')
  @Roles(Role.TEACHER)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 20_000_000, files: 1 } })
  )
  generateQuestions(
    @Param('id') id: string,
    @Req() req: any,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('counts') rawCounts: string
  ) {
    if (!file) throw new BadRequestException('Choose a PDF, PPT, or PPTX file');
    const extension = file.originalname
      .toLowerCase()
      .match(/\.(pdf|ppt|pptx)$/)?.[1];
    if (!extension)
      throw new BadRequestException(
        'Only PDF, PPT, and PPTX files are supported'
      );
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawCounts);
    } catch {
      throw new BadRequestException('Question counts are invalid');
    }
    const keys = [
      'MULTIPLE_CHOICE',
      'ENUMERATION',
      'IDENTIFICATION',
      'ESSAY',
    ] as const;
    if (!parsed || typeof parsed !== 'object')
      throw new BadRequestException('Question counts are invalid');
    const counts = Object.fromEntries(
      keys.map((key) => [
        key,
        Number((parsed as Record<string, unknown>)[key] ?? 0),
      ])
    ) as QuestionCounts;
    const values = Object.values(counts);
    if (
      values.some((value) => !Number.isInteger(value) || value < 0) ||
      values.reduce((sum, value) => sum + value, 0) < 1 ||
      values.reduce((sum, value) => sum + value, 0) > 50
    )
      throw new BadRequestException('Request between 1 and 50 total questions');
    return this.subjects.generateQuestions(id, req.user.id, file, counts);
  }
}
