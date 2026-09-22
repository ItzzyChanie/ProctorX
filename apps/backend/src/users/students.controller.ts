import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermission } from '../auth/guards/permissions.guard';
import { Roles, RolesGuard } from '../auth/guards/roles.guard';
import { StudentQueryDto } from './dto/student-query.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { CreateSectionDto } from './dto/create-section.dto';
import { UpdateSectionDto } from './dto/update-section.dto';
import { SetAccountStatusDto } from './dto/set-account-status.dto';
import {
  PromoteSectionDto,
  TransferStudentDto,
} from './dto/student-placement.dto';
import { UsersService } from './users.service';

@Controller('students')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class StudentsController {
  constructor(private users: UsersService) {}
  @RequirePermission('MANAGE_STUDENTS')
  @Get('sections') @Roles(Role.DEAN) sections(
    @Query() q: StudentQueryDto,
    @Req() req: any
  ) {
    return this.users.sections(q.program, q.yearLevel, req.user.id);
  }

  @RequirePermission('MANAGE_STUDENTS')
  @Post('sections') @Roles(Role.DEAN) createSection(
    @Body() body: CreateSectionDto,
    @Req() req: any
  ) {
    return this.users.createSection(body, req.user.id);
  }
  @RequirePermission('MANAGE_STUDENTS')
  @Patch('sections/:sectionId') @Roles(Role.DEAN) updateSection(
    @Param('sectionId') sectionId: string,
    @Body() body: UpdateSectionDto,
    @Req() req: any
  ) {
    return this.users.updateSection(sectionId, body, req.user.id);
  }
  @RequirePermission('MANAGE_STUDENTS')
  @Post('sections/:sectionId/promote') @Roles(Role.DEAN) promoteSection(
    @Param('sectionId') sectionId: string,
    @Body() body: PromoteSectionDto,
    @Req() req: any
  ) {
    return this.users.promoteSection(sectionId, body, req.user.id);
  }
  @RequirePermission('MANAGE_STUDENTS')
  @Delete('sections/:sectionId') @Roles(Role.DEAN) deleteSection(
    @Param('sectionId') sectionId: string,
    @Req() req: any
  ) {
    return this.users.deleteSection(sectionId, req.user.id);
  }
  @RequirePermission('VIEW_STUDENT_ROSTERS')
  @Get() @Roles(Role.DEAN, Role.TEACHER) list(
    @Query() q: StudentQueryDto,
    @Req() req: any
  ) {
    return this.users.listStudents(q, req.user.id, req.user.role);
  }

  @RequirePermission('MANAGE_STUDENTS')
  @Patch(':id/placement') @Roles(Role.DEAN) transfer(
    @Param('id') id: string,
    @Body() body: TransferStudentDto,
    @Req() req: any
  ) {
    return this.users.transferStudent(id, body, req.user.id);
  }

  @RequirePermission('MANAGE_STUDENTS')
  @Patch(':id') @Roles(Role.DEAN) update(
    @Param('id') id: string,
    @Body() b: UpdateStudentDto,
    @Req() r: any
  ) {
    return this.users.updateStudent(id, b, r.user.id);
  }

  @RequirePermission('MANAGE_STUDENTS')
  @Patch(':id/status') @Roles(Role.DEAN) setStatus(
    @Param('id') id: string,
    @Body() body: SetAccountStatusDto,
    @Req() r: any
  ) {
    return this.users.setStudentStatus(id, body.status, r.user.id);
  }
}
