import { ForbiddenException, Injectable, SetMetadata } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { AuthGuard } from '@nestjs/passport'

export const ALLOW_PASSWORD_CHANGE_REQUIRED = 'allow_password_change_required'
export const AllowPasswordChangeRequired = () =>
  SetMetadata(ALLOW_PASSWORD_CHANGE_REQUIRED, true)

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super()
  }

  override handleRequest<TUser = any>(
    err: any,
    user: any,
    info: any,
    context: any,
    status?: any,
  ): TUser {
    const authenticated = super.handleRequest(err, user, info, context, status) as any
    const allowed = this.reflector.getAllAndOverride<boolean>(
      ALLOW_PASSWORD_CHANGE_REQUIRED,
      [context.getHandler(), context.getClass()],
    )
    if (authenticated?.mustChangePassword && !allowed)
      throw new ForbiddenException('Password change required')
    return authenticated
  }
}
