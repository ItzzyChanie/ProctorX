import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  Query,
  UseGuards,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  PermissionsGuard,
  RequirePermission,
} from '../auth/guards/permissions.guard';
import { Roles, RolesGuard } from '../auth/guards/roles.guard';
import {
  CreateExamDto,
  CreateSubjectDto,
  JoinSubjectDto,
  ReviewJoinRequestDto,
  UpdateSubjectDto,
  UpdateExamScheduleDto,
  AssignSectionDto,
  QuestionBankItemDto,
} from './dto/subjects.dto';
import { SubjectsService } from './subjects.service';
import type { QuestionCounts } from '../ai/ai.service';
@Controller('subjects')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class SubjectsController {
  constructor(private subjects: SubjectsService) {}
  @Get('mine') @Roles(Role.TEACHER, Role.STUDENT) mine(@Req() req: any) {
    return this.subjects.mine(req.user.id, req.user.role);
  }
  @Get('question-bank') @Roles(Role.TEACHER)
  @RequirePermission('CREATE_EXAM') questionBank(
    @Req() req: any,
    @Query() query: Record<string, string | undefined>
  ) {
    return this.subjects.questionBank(req.user.id, query);
  }
  @Get('question-bank/exam-groups')
  @Roles(Role.TEACHER)
  @RequirePermission('CREATE_EXAM')
  questionBankExamGroups(
    @Req() req: any,
    @Query('archive') archive?: string
  ) {
    return this.subjects.questionBankExamGroups(
      req.user.id,
      archive === 'archived'
    );
  }
  @Get('question-bank/exam-groups/:examId')
  @Roles(Role.TEACHER)
  @RequirePermission('CREATE_EXAM')
  questionBankExamItems(
    @Req() req: any,
    @Param('examId') examId: string,
    @Query('archive') archive?: string
  ) {
    return this.subjects.questionBankExamItems(
      examId,
      req.user.id,
      archive === 'archived'
    );
  }
  @Delete('question-bank/exam-groups/:examId')
  @Roles(Role.TEACHER)
  @RequirePermission('CREATE_EXAM')
  archiveQuestionBankExam(
    @Req() req: any,
    @Param('examId') examId: string
  ) {
    return this.subjects.archiveQuestionBankExam(examId, req.user.id);
  }
  @Patch('question-bank/exam-groups/:examId/restore')
  @Roles(Role.TEACHER)
  @RequirePermission('CREATE_EXAM')
  restoreQuestionBankExam(
    @Req() req: any,
    @Param('examId') examId: string
  ) {
    return this.subjects.restoreQuestionBankExam(examId, req.user.id);
  }
  @Post('question-bank') @Roles(Role.TEACHER)
  @RequirePermission('CREATE_EXAM') createBankItem(
    @Req() req: any,
    @Body() body: QuestionBankItemDto
  ) {
    return this.subjects.createBankItem(req.user.id, body);
  }
  @Patch('question-bank/:itemId') @Roles(Role.TEACHER)
  @RequirePermission('CREATE_EXAM') updateBankItem(
    @Req() req: any,
    @Param('itemId') itemId: string,
    @Body() body: QuestionBankItemDto
  ) {
    return this.subjects.updateBankItem(itemId, req.user.id, body);
  }
  @Delete('question-bank/:itemId') @Roles(Role.TEACHER)
  @RequirePermission('CREATE_EXAM') archiveBankItem(
    @Req() req: any,
    @Param('itemId') itemId: string
  ) {
    return this.subjects.archiveBankItem(itemId, req.user.id);
  }
  @Post('question-bank/import-document')
  @Roles(Role.TEACHER)
  @RequirePermission('CREATE_EXAM')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 20_000_000, files: 1 } })
  )
  importQuestionBankDocument(
    @Req() req: any,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('subjectId') subjectId: string,
    @Body('counts') rawCounts: string
  ) {
    if (!file)
      throw new BadRequestException('Choose a PDF, PPT, PPTX, or DOCX file');
    if (!file.originalname.toLowerCase().match(/\.(pdf|ppt|pptx|docx)$/))
      throw new BadRequestException(
        'Only PDF, PPT, PPTX, and DOCX files are supported'
      );
    if (!subjectId)
      throw new BadRequestException('Choose a subject for these questions');
    return this.subjects.importQuestionBankDocument(
      req.user.id,
      subjectId,
      file,
      this.parseQuestionCounts(rawCounts)
    );
  }
  @Post('question-bank/import-exam/:examId')
  @Roles(Role.TEACHER)
  @RequirePermission('CREATE_EXAM')
  importExamToQuestionBank(
    @Req() req: any,
    @Param('examId') examId: string
  ) {
    return this.subjects.importExamToQuestionBank(examId, req.user.id);
  }
  @Post() @Roles(Role.TEACHER) @RequirePermission('CREATE_EXAM') create(
    @Req() req: any,
    @Body() body: CreateSubjectDto
  ) {
    return this.subjects.create(req.user.id, body);
  }
  @Patch(':id') @Roles(Role.TEACHER) @RequirePermission('CREATE_EXAM') update(
    @Param('id') id: string,
    @Req() req: any,
    @Body() body: UpdateSubjectDto
  ) {
    return this.subjects.update(id, req.user.id, body);
  }
  @Delete(':id') @Roles(Role.TEACHER) @RequirePermission('CREATE_EXAM') remove(
    @Param('id') id: string,
    @Req() req: any
  ) {
    return this.subjects.remove(id, req.user.id);
  }
  @Get(':id/students') @Roles(Role.TEACHER)
  @RequirePermission('VIEW_STUDENT_ROSTERS') students(
    @Param('id') id: string,
    @Req() req: any
  ) {
    return this.subjects.students(id, req.user.id);
  }
  @Delete(':id/students/:studentId') @Roles(Role.TEACHER)
  @RequirePermission('FLAG_STUDENT') removeStudent(
    @Param('id') id: string,
    @Param('studentId') studentId: string,
    @Req() req: any
  ) {
    return this.subjects.removeStudent(id, studentId, req.user.id);
  }
  @Get('section-assignments/overview') @Roles(Role.TEACHER)
  @RequirePermission('VIEW_STUDENT_ROSTERS') sectionAssignments(
    @Req() req: any
  ) { return this.subjects.sectionAssignments(req.user.id); }
  @Post(':id/sections') @Roles(Role.TEACHER)
  @RequirePermission('CREATE_EXAM') assignSection(
    @Param('id') id: string, @Body() body: AssignSectionDto, @Req() req: any
  ) { return this.subjects.assignSection(id, body.sectionId, body.enrollCurrentStudents, req.user.id); }
  @Delete(':id/sections/:sectionId') @Roles(Role.TEACHER)
  @RequirePermission('CREATE_EXAM') unassignSection(
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
  @Patch('join-requests/:requestId/hide')
  @Roles(Role.STUDENT)
  hideRequest(@Param('requestId') requestId: string, @Req() req: any) {
    return this.subjects.hideStudentJoinRequest(req.user.id, requestId);
  }
  @Get('join-requests/pending') @Roles(Role.TEACHER)
  @RequirePermission('VIEW_STUDENT_ROSTERS') pending(@Req() req: any) {
    return this.subjects.pendingJoinRequests(req.user.id);
  }
  @Post('join-requests/:requestId/review') @Roles(Role.TEACHER)
  @RequirePermission('FLAG_STUDENT') review(
    @Param('requestId') requestId: string,
    @Req() req: any,
    @Body() body: ReviewJoinRequestDto
  ) {
    return this.subjects.reviewJoinRequest(requestId, req.user.id, body.status);
  }
  @Get(':id/exams') @Roles(Role.TEACHER)
  @RequirePermission('CREATE_EXAM') exams(
    @Param('id') id: string,
    @Req() req: any
  ) {
    return this.subjects.exams(id, req.user.id);
  }
  @Get(':id/exams/:examId/copy') @Roles(Role.TEACHER)
  @RequirePermission('CREATE_EXAM') examCopy(
    @Param('examId') examId: string,
    @Req() req: any
  ) {
    return this.subjects.examCopy(examId, req.user.id);
  }
  @Get(':id/exams/:examId/versions') @Roles(Role.TEACHER)
  @RequirePermission('CREATE_EXAM') examVersions(
    @Param('examId') examId: string,
    @Req() req: any
  ) {
    return this.subjects.examVersions(examId, req.user.id);
  }
  @Post(':id/exams') @Roles(Role.TEACHER)
  @RequirePermission('CREATE_EXAM') exam(
    @Param('id') id: string,
    @Req() req: any,
    @Body() body: CreateExamDto
  ) {
    return this.subjects.createExam(id, req.user.id, body);
  }
  @Patch(':id/exams/:examId/schedule')
  @Roles(Role.TEACHER)
  @RequirePermission('CREATE_EXAM')
  updateExamSchedule(
    @Param('id') id: string,
    @Param('examId') examId: string,
    @Req() req: any,
    @Body() body: UpdateExamScheduleDto
  ) {
    return this.subjects.updateExamSchedule(id, examId, req.user.id, body);
  }
  @Post(':id/exams/:examId/stop') @Roles(Role.TEACHER)
  @RequirePermission('CREATE_EXAM') stopExam(
    @Param('id') id: string,
    @Param('examId') examId: string,
    @Req() req: any
  ) {
    return this.subjects.stopExam(id, examId, req.user.id);
  }
  @Post(':id/questions/generate')
  @Roles(Role.TEACHER)
  @RequirePermission('CREATE_EXAM')
  @UseInterceptors(
    FilesInterceptor('files', 20, {
      limits: { fileSize: 20_000_000, files: 20 },
    })
  )
  generateQuestions(
    @Param('id') id: string,
    @Req() req: any,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @Body('counts') rawCounts: string
  ) {
    if (!files?.length)
      throw new BadRequestException(
        'Choose at least one PDF, PPT, PPTX, or DOCX file'
      );
    const invalid = files.find(
      (file) => !file.originalname.toLowerCase().match(/\.(pdf|ppt|pptx|docx)$/)
    );
    if (invalid)
      throw new BadRequestException(
        `Unsupported document ${invalid.originalname}. Only PDF, PPT, PPTX, and DOCX files are supported`
      );
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    if (totalBytes > 100_000_000)
      throw new BadRequestException(
        'The combined document upload cannot exceed 100 MB'
      );
    return this.subjects.generateQuestions(
      id,
      req.user.id,
      files,
      this.parseQuestionCounts(rawCounts)
    );
  }

  private parseQuestionCounts(rawCounts: string) {
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
    return counts;
  }
}
