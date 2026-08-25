import { IsString, Matches, MinLength } from 'class-validator';
export class ChangePasswordDto {
  @IsString() @MinLength(1) currentPassword!: string;
  @IsString()
  @MinLength(12)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/, {
    message:
      'newPassword must include upper-case, lower-case, number, and symbol',
  })
  newPassword!: string;
}
