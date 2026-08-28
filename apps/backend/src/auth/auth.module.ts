import { Module } from "@nestjs/common";
import { JwtModule, JwtModuleOptions } from "@nestjs/jwt";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtStrategy } from "./jwt.strategy";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { RolesGuard } from "./guards/roles.guard";
import { PermissionsGuard } from "./guards/permissions.guard";
import { EmailService } from "./email.service";
import { AuthGateway } from "./auth.gateway";
import { InstitutionRegistrationService } from "./institution-registration.service";

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService): JwtModuleOptions => ({
        secret: configService.get<string>("JWT_SECRET"),
        signOptions: {
          expiresIn: configService.get<string>("JWT_EXPIRES_IN") ?? "7d",
        } as JwtModuleOptions["signOptions"],
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    JwtAuthGuard,
    RolesGuard,
    PermissionsGuard,
    EmailService,
    AuthGateway,
    InstitutionRegistrationService,
  ],
  exports: [JwtAuthGuard, RolesGuard, PermissionsGuard],
})
export class AuthModule {}
