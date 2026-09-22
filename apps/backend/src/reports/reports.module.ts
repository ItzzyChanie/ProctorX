import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ReportsController } from './reports.controller';
import { DeanReportsController } from './dean-reports.controller';
import { ReportsService } from './reports.service';
import { SessionsModule } from '../sessions/sessions.module';

@Module({
  imports: [PrismaModule, AiModule, SessionsModule, AuthModule],
  controllers: [ReportsController, DeanReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
