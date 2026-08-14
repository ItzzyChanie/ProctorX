export enum Role {
  STUDENT = 'STUDENT',
  TEACHER = 'TEACHER',
  DEAN = 'DEAN',
}

export interface User {
  id: string
  loginId: string
  email?: string | null
  fullName: string
  role: Role
  mustChangePassword: boolean
  isActive: boolean
  createdAt: string
  updatedAt: string
  studentId?: string | null
  yearLevel?: string | null
  program?: string | null
  employeeId?: string | null
}

export interface LoginRequest { loginId: string; password: string }
export interface LoginResponse { accessToken: string; user: User }
