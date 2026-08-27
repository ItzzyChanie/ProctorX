import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class DeanAnalyticsQueryDto {
  @IsOptional() @IsUUID() academicPeriodId?: string;
  @IsOptional() @IsIn(['UNSPECIFIED', 'PRELIMINARY', 'MIDTERM', 'SEMI_FINAL', 'FINAL']) term?: string;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
  @IsOptional() @IsString() @MaxLength(80) program?: string;
  @IsOptional() @IsString() @MaxLength(32) yearLevel?: string;
  @IsOptional() @IsString() @MaxLength(80) section?: string;
  @IsOptional() @IsString() @MaxLength(40) subjectCode?: string;
}

export class TeacherDashboardQueryDto {
  @IsOptional() @IsUUID() academicPeriodId?: string;
  @IsOptional() @IsIn(['UNSPECIFIED', 'PRELIMINARY', 'MIDTERM', 'SEMI_FINAL', 'FINAL']) term?: string;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
  @IsOptional() @IsUUID() subjectId?: string;
  @IsOptional() @IsUUID() sectionId?: string;
  @IsOptional() @IsString() @MaxLength(80) program?: string;
  @IsOptional() @IsString() @MaxLength(32) yearLevel?: string;
}

export class AuditLogQueryDto {
  @IsIn(['DEAN', 'TEACHER', 'STUDENT']) role!: string;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) timeFrom?: string;
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) timeTo?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}
