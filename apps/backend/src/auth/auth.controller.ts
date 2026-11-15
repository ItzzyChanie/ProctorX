import {
  Body,
  Controller,
  Get,
  Post,
  Patch,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import {
  AllowPasswordChangeRequired,
  JwtAuthGuard,
} from './guards/jwt-auth.guard';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ResendActivationDto } from './dto/resend-activation.dto';
import { UpdateProfilePictureDto } from './dto/update-profile-picture.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { InstitutionRegistrationService } from './institution-registration.service';
import {
  CreateInstitutionRegistrationDto,
  ResendInstitutionCodeDto,
  SearchInstitutionsDto,
  VerifyInstitutionEmailDto,
} from './dto/institution-registration.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private auth: AuthService,
    private institutionRegistration: InstitutionRegistrationService
  ) {}
  private cookieOptions() {
    const configuredMaxAge = Number(process.env.AUTH_COOKIE_MAX_AGE_MS);
    return {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge:
        Number.isFinite(configuredMaxAge) && configuredMaxAge > 0
          ? configuredMaxAge
          : 7 * 24 * 60 * 60 * 1000,
    };
  }

  @Post('institution-registration')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  registerInstitution(@Body() body: CreateInstitutionRegistrationDto) {
    return this.institutionRegistration.create(body);
  }

  @Get('institutions/search')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  searchInstitutions(@Query() query: SearchInstitutionsDto) {
    return this.institutionRegistration.searchInstitutions(query.q);
  }

  @Post('institution-registration/verify')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async verifyInstitutionEmail(
    @Body() body: VerifyInstitutionEmailDto,
    @Res({ passthrough: true }) response: Response
  ) {
    const application = await this.institutionRegistration.verify(
      body.referenceNumber,
      body.code
    );
    const session = await this.auth.createSessionForUser(application.userId);
    response.cookie('proctorx_session', session.accessToken, this.cookieOptions());
    return { ...application, user: session.user };
  }

  @Post('institution-registration/resend')
  @Throttle({ default: { limit: 2, ttl: 60_000 } })
  resendInstitutionCode(@Body() body: ResendInstitutionCodeDto) {
    return this.institutionRegistration.resend(body.referenceNumber);
  }

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async login(
    @Body() body: LoginDto,
    @Res({ passthrough: true }) response: Response
  ) {
    const result = await this.auth.login(body.loginId, body.password);
    if ('activationRequired' in result) return result;
    response.cookie(
      'proctorx_session',
      result.accessToken,
      this.cookieOptions()
    );
    return {
      user: result.user,
      passwordChangeRequired: result.user.mustChangePassword,
    };
  }

  @Post('verify-activation')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })

  async verifyActivation(
    @Body() body: VerifyOtpDto,
    @Res({ passthrough: true }) response: Response
  ) {
    const result = await this.auth.verifyActivation(body.loginId, body.code);
    response.cookie(
      'proctorx_session',
      result.accessToken,
      this.cookieOptions()
    );
    return { user: result.user, passwordChangeRequired: true };
  }

  @Post('resend-activation')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  resendActivation(@Body() body: ResendActivationDto) {
    return this.auth.resendActivation(body.loginId);
  }

  @AllowPasswordChangeRequired()
  @UseGuards(JwtAuthGuard) @Post('logout') async logout(
    @Req() req: any,
    @Res({ passthrough: true }) response: Response
  ) {
    await this.auth.logout(req.user.id, req.user.loginSessionId);
    response.clearCookie('proctorx_session', this.cookieOptions());
    return { success: true };
  }

  @UseGuards(JwtAuthGuard) @Post('heartbeat') heartbeat(@Req() req: any) {
    return this.auth.heartbeat(req.user.id, req.user.loginSessionId);
  }

  @AllowPasswordChangeRequired()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UseGuards(JwtAuthGuard) @Post('change-password') changePassword(
    @Req() req: any,
    @Body() body: ChangePasswordDto
  ) {
    return this.auth.changePassword(
      req.user.id,
      body.currentPassword,
      body.newPassword,
      req.user.loginSessionId
    );
  }

  @AllowPasswordChangeRequired()
  @UseGuards(JwtAuthGuard) @Get('me') me(@Req() req: any) {
    return this.auth.me(req.user);
  }

  @UseGuards(JwtAuthGuard) @Post('profile-picture') profilePicture(
    @Req() req: any,
    @Body() body: UpdateProfilePictureDto
  ) {
    return this.auth.updateProfilePicture(req.user.id, body.profilePicture);
  }
  
  @UseGuards(JwtAuthGuard) @Patch('profile') updateProfile(
    @Req() req: any,
    @Body() body: UpdateProfileDto
  ) {
    return this.auth.updateProfile(req.user.id, body);
  }
}
