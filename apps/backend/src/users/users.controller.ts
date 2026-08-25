import {
  Body,
  Controller,
  Get,
  Post,
  ParseFilePipeBuilder,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type {} from 'multer';
import { Role } from '@prisma/client';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/guards/roles.guard';
import { ImportService } from './import/import.service';
import { CreateStudentDto } from './dto/create-student.dto';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private imports: ImportService) {}
  @Post('students')
  @Roles(Role.DEAN)
  createStudent(@Body() body: CreateStudentDto, @Req() req: any) {
    return this.imports.createStudent(body, req.user.id);
  }

  @Get('import/students/template')
  @Roles(Role.DEAN)
  studentTemplate(@Res() response: Response) {
    response.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    response.setHeader(
      'Content-Disposition',
      'attachment; filename=proctorx-student-import-template.xlsx'
    );
    response.send(this.imports.template());
  }

  @Post('import/students')
  @Roles(Role.DEAN)
  @UseInterceptors(FileInterceptor('file'))
  students(
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({
          fileType:
            /^(application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet|application\/vnd\.ms-excel)$/,
        })
        .addMaxSizeValidator({ maxSize: 10_000_000 })
        .build()
    )
    file: Express.Multer.File,
    @Req() req: any
  ) {
    return this.imports.importStudents(file, req.user.id);
  }
}
