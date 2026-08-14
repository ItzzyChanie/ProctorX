import { Role } from '@prisma/client'

export const ROLE_DEFAULT_PERMISSIONS: Record<Role, string[]> = {
  DEAN: ['*'],
  TEACHER: ['CREATE_EXAM', 'VIEW_OWN_CLASS_SESSIONS', 'FLAG_STUDENT'],
  STUDENT: ['VIEW_OWN_SESSIONS', 'JOIN_EXAM'],
}
