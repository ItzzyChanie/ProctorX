import { IsString, Matches, MinLength } from 'class-validator';
export class ChangePasswordDto {
  @IsString() @MinLength(1) currentPassword!: string;
  @IsString()
  @MinLength(6)
  @Matches(/^(?=.*\d)(?=.*[^A-Za-z0-9]).+$/, {
    message: 'newPassword must include a number and a special character',
  })
  newPassword!: string;
}
