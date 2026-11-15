import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { AccountStatus, ImportRowResult, Role } from '@prisma/client';
import bcrypt from 'bcrypt';
import { validateOrReject } from 'class-validator';
import * as XLSX from 'xlsx';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateStudentDto } from '../dto/create-student.dto';
import { generateDefaultPassword } from './password.util';
import { AvatarsService } from '../../avatars/avatars.service';

const columns = [
  'Student ID',
  'First Name',
  'Middle Name',
  'Last Name',
  'Program',
  'Year Level',
  'Email',
] as const;
type SpreadsheetRow = Record<(typeof columns)[number], unknown>;

@Injectable()
export class ImportService {
  constructor(
    private prisma: PrismaService,
    private avatars: AvatarsService
  ) {}

  private async institutionFor(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { institutionId: true },
    });
    if (!user?.institutionId) throw new BadRequestException('Institution not found');
    return user.institutionId;
  }

  template(): Buffer {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([[...columns]]),
      'Students'
    );
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  }

  private readRows(file: Express.Multer.File): SpreadsheetRow[] {
    if (!file || !file.originalname.toLowerCase().endsWith('.xlsx'))
      throw new BadRequestException('Upload the provided .xlsx template');
    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new BadRequestException('Workbook has no sheets');
    const sheet = workbook.Sheets[sheetName]!;
    const header = (
      XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 })[0] ?? []
    ).map(String);
    if (
      header.length !== columns.length ||
      columns.some((column, index) => header[index] !== column)
    )
      throw new BadRequestException(
        `Expected columns exactly: ${columns.join(', ')}`
      );
    return XLSX.utils.sheet_to_json<SpreadsheetRow>(sheet, { defval: '' });
  }

  private async assertAvailable(studentId: string, email: string) {
    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [
          { loginId: studentId },
          { email },
          { studentProfile: { is: { studentId } } },
        ],
      },
      select: { id: true },
    });
    if (existing)
      throw new ConflictException('Student ID or email already exists');
  }

  async createStudent(input: CreateStudentDto, actorId: string) {
    const institutionId = await this.institutionFor(actorId);
    const studentId = input.studentId.trim();
    const email = input.email.trim().toLowerCase();
    await this.assertAvailable(studentId, email);
    const section = await this.prisma.studentSection.findFirst({
      where: { id: input.sectionId, institutionId },
    });
    if (
      !section ||
      section.program !== input.program ||
      section.yearLevel !== input.yearLevel
    )
      throw new BadRequestException(
        'The selected section does not match the program and year level'
      );
    const initialPassword = generateDefaultPassword(
      input,
      new Date().getFullYear()
    );
    const fullName = [input.firstName, input.middleName, input.lastName]
      .filter(Boolean)
      .map((value) => value!.trim())
      .join(' ');
    const user = await this.prisma.user.create({
      data: {
        institutionId,
        role: Role.STUDENT,
        loginId: studentId,
        email,
        fullName,
        profilePicture: await this.avatars.resolve(input.profilePicture),
        passwordHash: await bcrypt.hash(initialPassword, 12),
        status: AccountStatus.PENDING,
        mustChangePassword: true,
        studentProfile: {
          create: {
            studentId,
            program: input.program.trim(),
            yearLevel: input.yearLevel.trim(),
            sectionId: section.id,
          },
        },
      },
      select: {
        id: true,
        loginId: true,
        email: true,
        fullName: true,
        status: true,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'STUDENT_ACCOUNT_CREATED',
        targetType: 'User',
        targetId: user.id,
      },
    });
    return { user, initialPassword };
  }

  async importStudents(
    file: Express.Multer.File,
    actorId: string,
    sectionId: string
  ) {
    const institutionId = await this.institutionFor(actorId);
    const section = await this.prisma.studentSection.findFirst({
      where: { id: sectionId, institutionId },
    });
    if (!section)
      throw new BadRequestException(
        'Select a valid section before importing students'
      );
    const rows = this.readRows(file);
    const batch = await this.prisma.studentImportBatch.create({
      data: {
        uploadedById: actorId,
        fileName: file.originalname,
        totalRows: rows.length,
        createdRows: 0,
        skippedRows: 0,
        errorRows: 0,
      },
    });
    const resultRows: {
      rowNumber: number;
      result: ImportRowResult;
      errorMessage: string | null;
      initialPassword?: string;
    }[] = [];
    for (const [index, row] of rows.entries()) {
      const rowNumber = index + 2;
      const input: CreateStudentDto = {
        studentId: String(row['Student ID'] ?? '').trim(),
        firstName: String(row['First Name'] ?? '').trim(),
        middleName: String(row['Middle Name'] ?? '').trim(),
        lastName: String(row['Last Name'] ?? '').trim(),
        program: section.program,
        yearLevel: section.yearLevel,
        email: String(row.Email ?? '').trim(),
        sectionId: section.id,
      };
      try {
        await validateOrReject(input, {
          whitelist: true,
          forbidNonWhitelisted: true,
        });
        if (
          ![
            input.studentId,
            input.firstName,
            input.middleName,
            input.lastName,
            input.program,
            input.yearLevel,
            input.email,
          ].every(Boolean)
        )
          throw new BadRequestException('Missing one or more required values');
        const created = await this.createStudent(input, actorId);
        await this.prisma.studentImportRow.create({
          data: {
            batchId: batch.id,
            rowNumber,
            studentId: input.studentId,
            fullName: created.user.fullName,
            email: created.user.email,
            result: ImportRowResult.CREATED,
          },
        });
        resultRows.push({
          rowNumber,
          result: ImportRowResult.CREATED,
          errorMessage: null,
          initialPassword: created.initialPassword,
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unexpected import error';
        const result =
          error instanceof ConflictException
            ? ImportRowResult.SKIPPED_DUPLICATE
            : ImportRowResult.ERROR;
        await this.prisma.studentImportRow.create({
          data: {
            batchId: batch.id,
            rowNumber,
            studentId: input.studentId || null,
            fullName:
              [input.firstName, input.middleName, input.lastName]
                .filter(Boolean)
                .join(' ') || null,
            email: input.email || null,
            result,
            errorMessage,
          },
        });
        resultRows.push({ rowNumber, result, errorMessage });
      }
    }
    const createdRows = resultRows.filter(
      (row) => row.result === ImportRowResult.CREATED
    ).length;
    const skippedRows = resultRows.filter(
      (row) => row.result === ImportRowResult.SKIPPED_DUPLICATE
    ).length;
    const errorRows = resultRows.length - createdRows - skippedRows;
    await this.prisma.studentImportBatch.update({
      where: { id: batch.id },
      data: { createdRows, skippedRows, errorRows },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'STUDENT_IMPORT_COMPLETED',
        targetType: 'StudentImportBatch',
        targetId: batch.id,
        metadata: { createdRows, skippedRows, errorRows },
      },
    });
    return {
      batchId: batch.id,
      totalRows: rows.length,
      createdRows,
      skippedRows,
      errorRows,
      rows: resultRows,
    };
  }
}
