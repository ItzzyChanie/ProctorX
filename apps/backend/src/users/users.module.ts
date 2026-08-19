import { Module } from "@nestjs/common";
import { UsersController } from "./users.controller";
import { StudentsController } from "./students.controller";
import { UsersService } from "./users.service";
import { ImportService } from "./import/import.service";
import { PrismaModule } from "../prisma/prisma.module";

@Module({
  controllers: [UsersController, StudentsController],
  imports: [PrismaModule],
  providers: [UsersService, ImportService],
})
export class UsersModule {}
