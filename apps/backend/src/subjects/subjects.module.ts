import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { SubjectsController } from "./subjects.controller";
import { SubjectsService } from "./subjects.service";
import { AiModule } from "../ai/ai.module";
import { SessionsModule } from "../sessions/sessions.module";
import { AuthModule } from "../auth/auth.module";
@Module({
  imports: [PrismaModule, AiModule, SessionsModule, AuthModule],
  controllers: [SubjectsController],
  providers: [SubjectsService],
})
export class SubjectsModule {}
