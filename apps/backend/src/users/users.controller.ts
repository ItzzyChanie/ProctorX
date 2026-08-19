import {
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type {} from "multer";
import { Role } from "@prisma/client";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { Roles, RolesGuard } from "../auth/guards/roles.guard";
import { ImportService } from "./import/import.service";

@Controller("users")
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private imports: ImportService) {}
  @Post("import/students")
  @Roles(Role.DEAN)
  @UseInterceptors(FileInterceptor("file"))
  students(@UploadedFile() file: Express.Multer.File) {
    return this.imports.import(file, Role.STUDENT);
  }
  @Post("import/teachers")
  @Roles(Role.DEAN)
  @UseInterceptors(FileInterceptor("file"))
  teachers(@UploadedFile() file: Express.Multer.File) {
    return this.imports.import(file, Role.TEACHER);
  }
}
