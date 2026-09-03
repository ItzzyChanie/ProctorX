import {
  IsIn,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
export class CreateDeanReportDto {
  @IsString() @IsNotEmpty() @MaxLength(200) name!: string;
  @IsISO8601() dateFrom!: string;
  @IsISO8601() dateTo!: string;
  @IsOptional() @IsString() @MaxLength(50) program?: string;
  @IsOptional() @IsString() @MaxLength(50) yearLevel?: string;
  @IsOptional() @IsString() @MaxLength(100) section?: string;
  @IsOptional() @IsString() @MaxLength(50) subjectCode?: string;
  @IsOptional() @IsString() @MaxLength(80) academicPeriodId?: string;
  @IsOptional() @IsIn(['UNSPECIFIED', 'PRELIMINARY', 'MIDTERM', 'SEMI_FINAL', 'FINAL']) term?: string;
  @IsIn(['pdf', 'excel']) format!: 'pdf' | 'excel';
}
