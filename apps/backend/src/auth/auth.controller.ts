import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common'
import { AuthService } from './auth.service'
import { LoginDto } from './dto/login.dto'
import { ChangePasswordDto } from './dto/change-password.dto'
import { JwtAuthGuard } from './guards/jwt-auth.guard'

@Controller('auth')
export class AuthController { constructor(private auth: AuthService) {}
  @Post('login') login(@Body() body: LoginDto) { return this.auth.login(body.loginId, body.password) }
  @UseGuards(JwtAuthGuard) @Post('change-password') changePassword(@Req() req: any, @Body() body: ChangePasswordDto) { return this.auth.changePassword(req.user.id, body.currentPassword, body.newPassword) }
  @UseGuards(JwtAuthGuard) @Get('me') me(@Req() req: any) { return this.auth.me(req.user) }
}
