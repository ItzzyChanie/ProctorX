import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SessionsController } from './sessions.controller';
import { SessionsGateway } from './sessions.gateway';
import { SessionsService } from './sessions.service';
import { MonitoringAnalysisService } from './monitoring-analysis.service';
import { GradingService } from './grading.service';
import { AuthModule } from '../auth/auth.module';
@Module({
  imports: [PrismaModule, AiModule, AuthModule],
  controllers: [SessionsController],
  providers: [
    SessionsService,
    SessionsGateway,
    MonitoringAnalysisService,
    GradingService,
  ],
  exports: [SessionsGateway],
})
export class SessionsModule {}
