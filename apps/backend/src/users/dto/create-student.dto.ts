import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateStudentDto {
  @IsString() @Matches(/^[A-Za-z0-9-]{3,50}$/) studentId!: string;
  @IsString() @IsNotEmpty() @MaxLength(100) firstName!: string;
  @IsString() @IsNotEmpty() @MaxLength(100) middleName!: string;
  @IsString() @IsNotEmpty() @MaxLength(100) lastName!: string;
  @IsIn(['CS', 'IT']) program!: string;
  @IsIn(['1', '2', '3', '4', 'YEAR_1', 'YEAR_2', 'YEAR_3', 'YEAR_4'])
  yearLevel!: string;
  @IsEmail() @MaxLength(320) email!: string;
  @IsUUID() sectionId!: string;
  @IsOptional() @IsString() @MaxLength(2_800_000) profilePicture?: string;
}
