import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerModule } from "@nestjs/throttler";
import { AuthModule } from "./auth/auth.module";
import { HealthController } from "./health.controller";
import { PrismaModule } from "./prisma/prisma.module";
import { UsersModule } from "./users/users.module";
import { SubjectsModule } from "./subjects/subjects.module";
import { AiModule } from "./ai/ai.module";
import { SessionsModule } from "./sessions/sessions.module";
import { ReportsModule } from "./reports/reports.module";
import { PortalModule } from "./portal/portal.module";
import { AppThrottlerGuard } from "./common/app-throttler.guard";
import { AvatarsModule } from "./avatars/avatars.module";
import { RetentionModule } from "./retention/retention.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Default budget per signed-in browser (a monitored student sends roughly
    // 120 requests/minute); sign-in routes override it with @Throttle.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 600 }]),
    PrismaModule,
    AuthModule,
    AvatarsModule,
    UsersModule,
    SubjectsModule,
    AiModule,
    SessionsModule,
    ReportsModule,
    PortalModule,
    RetentionModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: AppThrottlerGuard }],
})
export class AppModule {}
