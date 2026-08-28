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
import { Roles, RolesGuard } from '../auth/guards/roles.guard';
import { StudentQueryDto } from './dto/student-query.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { CreateSectionDto } from './dto/create-section.dto';
import { UpdateSectionDto } from './dto/update-section.dto';
import { UsersService } from './users.service';

@Controller('students')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StudentsController {
  constructor(private users: UsersService) {}
  @Get('sections') @Roles(Role.DEAN) sections(
    @Query() q: StudentQueryDto,
    @Req() req: any
  ) {
    return this.users.sections(q.program, q.yearLevel, req.user.id);
  }

  @Post('sections') @Roles(Role.DEAN) createSection(
    @Body() body: CreateSectionDto,
    @Req() req: any
  ) {
    return this.users.createSection(body, req.user.id);
  }
  @Patch('sections/:sectionId') @Roles(Role.DEAN) updateSection(
    @Param('sectionId') sectionId: string,
    @Body() body: UpdateSectionDto,
    @Req() req: any
  ) {
    return this.users.updateSection(sectionId, body, req.user.id);
  }
  @Delete('sections/:sectionId') @Roles(Role.DEAN) deleteSection(
    @Param('sectionId') sectionId: string,
    @Req() req: any
  ) {
    return this.users.deleteSection(sectionId, req.user.id);
  }
  @Get() @Roles(Role.DEAN, Role.TEACHER) list(
    @Query() q: StudentQueryDto,
    @Req() req: any
  ) {
    return this.users.listStudents(q, req.user.id, req.user.role);
  }

  @Patch(':id') @Roles(Role.DEAN) update(
    @Param('id') id: string,
    @Body() b: UpdateStudentDto,
    @Req() r: any
  ) {
    return this.users.updateStudent(id, b, r.user.id);
  }

  @Delete(':id') @Roles(Role.DEAN) remove(
    @Param('id') id: string,
    @Req() r: any
  ) {
    return this.users.deleteStudent(id, r.user.id);
  }
}
