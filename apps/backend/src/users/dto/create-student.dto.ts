import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

export class CreateStudentDto {
  @IsString() @IsNotEmpty() @MaxLength(100) studentId!: string;
  @IsString() @IsNotEmpty() @MaxLength(100) firstName!: string;
  @IsString() @IsNotEmpty() @MaxLength(100) middleName!: string;
  @IsString() @IsNotEmpty() @MaxLength(100) lastName!: string;
  @IsString() @IsNotEmpty() @MaxLength(100) program!: string;
  @IsString() @IsNotEmpty() @MaxLength(50) yearLevel!: string;
  @IsEmail() @MaxLength(320) email!: string;
}
