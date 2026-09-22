export enum Role {
  STUDENT = 'STUDENT',
  TEACHER = 'TEACHER',
  DEAN = 'DEAN',
}

export interface User {
  id: string
  institutionId?: string | null
  loginId: string
  email?: string | null
  fullName: string
  profilePicture?: string | null
  role: Role
  mustChangePassword: boolean
  isActive: boolean
  createdAt: string
  updatedAt: string
  studentId?: string | null
  yearLevel?: string | null
  program?: string | null
  sectionName?: string | null
  employeeId?: string | null
  office?: string | null
  officialTitle?: string | null
  institutionName?: string | null
  permissions?: Record<string, boolean>
}

export interface LoginRequest { loginId: string; password: string }
export interface LoginResponse { user: User }
