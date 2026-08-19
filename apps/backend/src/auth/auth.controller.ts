import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";

@Controller("auth")
export class AuthController {
  constructor(private auth: AuthService) {}
  private cookieOptions() {
    const configuredMaxAge = Number(process.env.AUTH_COOKIE_MAX_AGE_MS);
    return {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge:
        Number.isFinite(configuredMaxAge) && configuredMaxAge > 0
          ? configuredMaxAge
          : 7 * 24 * 60 * 60 * 1000,
    };
  }

  @Post("login")
  async login(
    @Body() body: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { accessToken, user } = await this.auth.login(
      body.loginId,
      body.password,
    );
    response.cookie("proctorx_session", accessToken, this.cookieOptions());
    return { user };
  }
  @Post("logout") logout(@Res({ passthrough: true }) response: Response) {
    response.clearCookie("proctorx_session", this.cookieOptions());
    return { success: true };
  }
  @UseGuards(JwtAuthGuard) @Post("change-password") changePassword(
    @Req() req: any,
    @Body() body: ChangePasswordDto,
  ) {
    return this.auth.changePassword(
      req.user.id,
      body.currentPassword,
      body.newPassword,
    );
  }
  @UseGuards(JwtAuthGuard) @Get("me") me(@Req() req: any) {
    return this.auth.me(req.user);
  }
}
