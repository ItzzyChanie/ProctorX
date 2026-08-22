import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class DeanAnalyticsQueryDto {
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
  @IsOptional() @IsString() @MaxLength(80) program?: string;
  @IsOptional() @IsString() @MaxLength(32) yearLevel?: string;
  @IsOptional() @IsString() @MaxLength(80) section?: string;
  @IsOptional() @IsString() @MaxLength(40) subjectCode?: string;
}

export class AuditLogQueryDto {
  @IsOptional() @IsString() @MaxLength(160) actor?: string;
  @IsOptional() @IsString() @MaxLength(80) action?: string;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
  @IsOptional() @IsString() @MaxLength(512) cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}
