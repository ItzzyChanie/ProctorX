import { Injectable, NotFoundException } from '@nestjs/common'
import { Role } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { StudentQueryDto } from './dto/student-query.dto'
import { UpdateStudentDto } from './dto/update-student.dto'

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}
  listStudents(query: StudentQueryDto) { return this.prisma.user.findMany({ where: { role: Role.STUDENT, studentProfile: { is: { program: query.program, yearLevel: query.yearLevel } } }, select: { id: true, fullName: true, email: true, status: true, createdAt: true, studentProfile: { select: { studentId: true, program: true, yearLevel: true } } }, orderBy: { createdAt: 'desc' } }) }
  async updateStudent(id: string, input: UpdateStudentDto, actorId: string) { const exists = await this.prisma.user.findFirst({ where: { id, role: Role.STUDENT } }); if (!exists) throw new NotFoundException('Student not found'); const user = await this.prisma.user.update({ where: { id }, data: { fullName: input.fullName, email: input.email?.toLowerCase(), studentProfile: { update: { program: input.program, yearLevel: input.yearLevel } } } }); await this.prisma.auditLog.create({ data: { actorId, action: 'STUDENT_ACCOUNT_UPDATED', targetType: 'User', targetId: id } }); return user }
  async deleteStudent(id: string, actorId: string) { const exists = await this.prisma.user.findFirst({ where: { id, role: Role.STUDENT } }); if (!exists) throw new NotFoundException('Student not found'); await this.prisma.user.delete({ where: { id } }); await this.prisma.auditLog.create({ data: { actorId, action: 'STUDENT_ACCOUNT_DELETED', targetType: 'User', targetId: id } }); return { success: true } }
}
