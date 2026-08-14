import { Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import bcrypt from 'bcrypt'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}
  private profile(user: any) { const { passwordHash, ...profile } = user; return profile }
  async login(loginId: string, password: string) { const user = await this.prisma.user.findUnique({ where: { loginId: loginId.trim().toLowerCase() } }); if (!user || !user.isActive || !(await bcrypt.compare(password, user.passwordHash))) throw new UnauthorizedException('Invalid credentials'); return { accessToken: await this.jwt.signAsync({ sub: user.id, role: user.role, mustChangePassword: user.mustChangePassword }), user: this.profile(user) } }
  async changePassword(userId: string, currentPassword: string, newPassword: string) { const user = await this.prisma.user.findUnique({ where: { id: userId } }); if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) throw new UnauthorizedException('Invalid credentials'); return this.profile(await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: await bcrypt.hash(newPassword, 12), mustChangePassword: false } })) }
  me(user: any) { return this.profile(user) }
}
