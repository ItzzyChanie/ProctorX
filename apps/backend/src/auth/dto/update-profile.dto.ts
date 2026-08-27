import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateProfileDto {
  @IsString() @MaxLength(150) fullName!: string;
  @IsOptional() @IsString() @MaxLength(50) employeeId?: string;
  @IsOptional() @IsString() @MaxLength(50) studentId?: string;
  @IsOptional() @IsString() @MaxLength(150) office?: string;
  @IsOptional() @IsString() @MaxLength(100) program?: string;
  @IsOptional() @IsEmail() @MaxLength(254) email?: string;
}
