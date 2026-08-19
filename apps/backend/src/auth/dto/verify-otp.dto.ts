import { IsNotEmpty, IsString, Matches } from "class-validator";
export class VerifyOtpDto {
  @IsString() @IsNotEmpty() loginId!: string;
  @IsString() @Matches(/^\d{6}$/) code!: string;
}
