import { BadRequestException, Injectable } from '@nestjs/common'
import { Prisma, Role } from '@prisma/client'
import bcrypt from 'bcrypt'
import { parse } from 'csv-parse/sync'
import * as XLSX from 'xlsx'
import { PrismaService } from '../../prisma/prisma.service'
import { generateDefaultPassword } from './password.util'

type Result = { imported: number; skipped: { row: number; reason: string }[]; credentials: { row: number; loginId: string; fullName: string; password: string }[] }
const normalize = (key: string) => key.toLowerCase().replace(/[\s_-]/g, '')
const pick = (row: Record<string, unknown>, keys: string[]) => { const found = Object.entries(row).find(([key]) => keys.includes(normalize(key))); return String(found?.[1] ?? '').trim() }

@Injectable()
export class ImportService {
  constructor(private prisma: PrismaService) {}
  private rows(file: Express.Multer.File) {
    const ext = file.originalname.split('.').pop()?.toLowerCase()
    if (ext === 'csv' || file.mimetype.includes('csv')) return parse(file.buffer, { columns: true, skip_empty_lines: true, trim: true }) as Record<string, unknown>[]
    if (ext === 'xlsx' || file.mimetype.includes('spreadsheetml')) { const book = XLSX.read(file.buffer, { type: 'buffer' }); const firstSheet = book.SheetNames[0]; if (!firstSheet) throw new BadRequestException('Workbook has no sheets'); return XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets[firstSheet]!, { defval: '' }) }
    throw new BadRequestException('Upload a CSV or XLSX file')
  }
  async import(file: Express.Multer.File, role: Role): Promise<Result> {
    if (!file) throw new BadRequestException('A file is required')
    const skipped: Result['skipped'] = []; const candidates: any[] = []
    this.rows(file).forEach((row, index) => {
      const rowNumber = index + 2; const fullName = pick(row, ['fullname', 'name']); const email = pick(row, ['emailaddress', 'email']).toLowerCase(); const identifier = role === Role.STUDENT ? pick(row, ['studentid', 'studentnumber', 'idnumber']) : pick(row, ['idno', 'employeeid', 'teachernumber', 'idnumber'])
      if (!identifier || !fullName || !email) { skipped.push({ row: rowNumber, reason: 'Missing required identifier, full_name, or email_address' }); return }
      try { const password = generateDefaultPassword(fullName); candidates.push({ row: rowNumber, fullName, email, identifier, password, yearLevel: pick(row, ['yearlevel', 'year']), program: pick(row, ['program', 'course']) }) } catch (error: any) { skipped.push({ row: rowNumber, reason: error.message }); }
    })
    const seen = new Set<string>()
    const valid = candidates.filter((candidate) => { const key = `${candidate.identifier}|${candidate.email}`; if (seen.has(key)) { skipped.push({ row: candidate.row, reason: 'Duplicate identifier or email in file' }); return false }; seen.add(key); return true })
    const where: Prisma.UserWhereInput[] = []
    valid.forEach((candidate) => { if (role === Role.STUDENT) where.push({ studentId: candidate.identifier }, { email: candidate.email }, { loginId: candidate.identifier }); else where.push({ employeeId: candidate.identifier }, { email: candidate.email }, { loginId: candidate.email }) })
    const existing = await this.prisma.user.findMany({ where: { OR: where }, select: { email: true, loginId: true, studentId: true, employeeId: true } })
    const credentials: Result['credentials'] = []
    for (const candidate of valid) {
      const clash = existing.some((user) => user.email === candidate.email || user.loginId === (role === Role.STUDENT ? candidate.identifier : candidate.email) || user.studentId === candidate.identifier || user.employeeId === candidate.identifier)
      if (clash) { skipped.push({ row: candidate.row, reason: 'Identifier or email already exists' }); continue }
      await this.prisma.user.create({ data: role === Role.STUDENT ? { role, loginId: candidate.identifier, studentId: candidate.identifier, email: candidate.email, fullName: candidate.fullName, yearLevel: candidate.yearLevel || null, program: candidate.program || null, passwordHash: await bcrypt.hash(candidate.password, 12) } : { role, loginId: candidate.email, employeeId: candidate.identifier, email: candidate.email, fullName: candidate.fullName, passwordHash: await bcrypt.hash(candidate.password, 12) } })
      credentials.push({ row: candidate.row, loginId: role === Role.STUDENT ? candidate.identifier : candidate.email, fullName: candidate.fullName, password: candidate.password })
    }
    return { imported: credentials.length, skipped, credentials }
  }
}
