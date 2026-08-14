import { IsNotEmpty, IsString, MinLength } from 'class-validator'
export class LoginDto { @IsString() @IsNotEmpty() loginId!: string; @IsString() @MinLength(1) password!: string }
