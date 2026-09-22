import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ResendActivationDto {
  @IsString() @IsNotEmpty() @MaxLength(320) loginId!: string;
}
