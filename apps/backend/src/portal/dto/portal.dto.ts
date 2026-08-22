import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class RaiseHandDto {
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}
export class InviteProfessorDto {
  @IsEmail() @MaxLength(320) email!: string;
  @IsString() @IsNotEmpty() @MaxLength(150) fullName!: string;
}
