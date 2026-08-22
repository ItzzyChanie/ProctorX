import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { SubjectsController } from "./subjects.controller";
import { SubjectsService } from "./subjects.service";
import { AiModule } from "../ai/ai.module";
@Module({
  imports: [PrismaModule, AiModule],
  controllers: [SubjectsController],
  providers: [SubjectsService],
})
export class SubjectsModule {}
