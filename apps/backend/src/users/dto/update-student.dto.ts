import { IsEmail, IsOptional, IsString } from "class-validator";
export class UpdateStudentDto {
  @IsOptional() @IsString() fullName?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() program?: string;
  @IsOptional() @IsString() yearLevel?: string;
}
