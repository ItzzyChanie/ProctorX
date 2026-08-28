import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateInstitutionRegistrationDto {
  @IsString() @IsNotEmpty() @MaxLength(160) institutionName!: string;
  @IsString() @IsNotEmpty() @MaxLength(160) collegeDepartmentName!: string;
  @IsString()
  @IsIn(['UNIVERSITY', 'COLLEGE', 'STATE_UNIVERSITY'])
  schoolType!: string;
  @IsString() @IsNotEmpty() @MaxLength(80) firstName!: string;
  @IsString() @IsNotEmpty() @MaxLength(80) lastName!: string;
  @IsOptional() @IsString() @MaxLength(80) employeeId?: string;
  @IsString() @IsNotEmpty() @MaxLength(120) officialTitle!: string;
  @IsEmail() @MaxLength(320) email!: string;
  @IsString() @MinLength(8) @MaxLength(128) password!: string;
  @IsBoolean() authorityConfirmed!: boolean;
  @IsBoolean() termsAccepted!: boolean;
  @IsBoolean() privacyAccepted!: boolean;
}

export class VerifyInstitutionEmailDto {
  @IsString() @Matches(/^PX-[A-Z0-9]{8}$/) referenceNumber!: string;
  @IsString() @Matches(/^\d{6}$/) code!: string;
}

export class ResendInstitutionCodeDto {
  @IsString() @Matches(/^PX-[A-Z0-9]{8}$/) referenceNumber!: string;
}
