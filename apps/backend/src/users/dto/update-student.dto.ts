import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  Matches,
  MinLength,
} from 'class-validator';
export class UpdateStudentDto {
  @IsOptional() @IsString() @MaxLength(150) fullName?: string;
  @IsOptional() @IsEmail() @MaxLength(320) email?: string;
  @IsOptional() @IsIn(['CS', 'IT']) program?: string;
  @IsOptional()
  @IsIn(['1', '2', '3', '4', 'YEAR_1', 'YEAR_2', 'YEAR_3', 'YEAR_4'])
  yearLevel?: string;
  @IsOptional()
  @IsString()
  @MinLength(6)
  @MaxLength(128)
  @Matches(/^(?=.*\d)(?=.*[^A-Za-z0-9]).+$/, {
    message: 'newPassword must include a number and a special character',
  })
  newPassword?: string;
  @IsOptional() @IsString() @MaxLength(2_800_000) profilePicture?: string;
}
