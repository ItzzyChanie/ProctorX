import {
  Body,
  Controller,
  Get,
  Post,
  Patch,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { UpdateProfilePictureDto } from './dto/update-profile-picture.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}
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

  @Post('login')
  @UseGuards(ThrottlerGuard)
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
  @UseGuards(ThrottlerGuard)
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

  @UseGuards(JwtAuthGuard) @Post('change-password') changePassword(
    @Req() req: any,
    @Body() body: ChangePasswordDto
  ) {
    return this.auth.changePassword(
      req.user.id,
      body.currentPassword,
      body.newPassword
    );
  }

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
