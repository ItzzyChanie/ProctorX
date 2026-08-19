import { Module } from "@nestjs/common";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";
import { ImportService } from "./import/import.service";

@Module({
  controllers: [UsersController],
  providers: [UsersService, ImportService],
})
export class UsersModule {}
