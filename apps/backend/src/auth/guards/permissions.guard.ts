import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { ROLE_DEFAULT_PERMISSIONS } from '../../common/constants/role-permissions'
import { PrismaService } from '../../prisma/prisma.service'
import { Role } from '@prisma/client'
export const REQUIRE_PERMISSION_KEY = 'require_permission'
export const RequirePermission = (key: string) => SetMetadata(REQUIRE_PERMISSION_KEY, key)
@Injectable() export class PermissionsGuard implements CanActivate { constructor(private reflector: Reflector, private prisma: PrismaService) {} async canActivate(context: ExecutionContext) { const permission = this.reflector.getAllAndOverride<string>(REQUIRE_PERMISSION_KEY, [context.getHandler(), context.getClass()]); if (!permission) return true; const user = context.switchToHttp().getRequest().user as { id: string; role: Role }; const override = await this.prisma.userPermission.findFirst({ where: { userId: user.id, permission: { key: permission } } }); if (override) return override.granted; const defaults = ROLE_DEFAULT_PERMISSIONS[user.role]; return defaults.includes('*') || defaults.includes(permission) } }
