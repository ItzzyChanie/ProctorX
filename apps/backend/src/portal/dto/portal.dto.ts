import {
  IsDateString,
  IsBoolean,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Matches,
} from 'class-validator';

export class CreateAcademicPeriodDto {
  @Matches(/^\d{4}-\d{4}$/) academicYear!: string;
  @IsIn(['FIRST', 'SECOND']) semester!: 'FIRST' | 'SECOND';
  @IsOptional() @IsDateString() startsAt?: string;
  @IsOptional() @IsDateString() endsAt?: string;
}

export class RaiseHandDto {
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}
export class InviteProfessorDto {
  @IsEmail() @MaxLength(320) email!: string;
  @IsString() @IsNotEmpty() @MaxLength(50) employeeId!: string;
  @IsString() @IsNotEmpty() @MaxLength(100) firstName!: string;
  @IsOptional() @IsString() @MaxLength(100) middleName?: string;
  @IsString() @IsNotEmpty() @MaxLength(100) lastName!: string;
  @IsString() @IsNotEmpty() @MaxLength(100) title!: string;
  @IsOptional() @IsUUID() departmentId?: string | null;
  @IsOptional() @IsString() @MaxLength(2_800_000) profilePicture?: string;
}
export class UpdateFacultyDto {
  @IsOptional() @IsString() @MaxLength(50) employeeId?: string;
  @IsString() @IsNotEmpty() @MaxLength(150) fullName!: string;
  @IsEmail() @MaxLength(320) email!: string;
  @IsString() @IsNotEmpty() @MaxLength(100) title!: string;
  @IsOptional() @IsUUID() departmentId?: string | null;
  @IsOptional() @IsString() @MaxLength(2_800_000) profilePicture?: string;
}
export class CreateDepartmentDto {
  @IsString() @IsNotEmpty() @MaxLength(20) code!: string;
  @IsString() @IsNotEmpty() @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
}
export class UpdateDepartmentDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(20) code?: string;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
}
export class SetDepartmentStatusDto {
  @IsIn(['ACTIVE', 'ARCHIVED']) status!: 'ACTIVE' | 'ARCHIVED';
}
export class SetPermissionOverrideDto {
  @IsIn([
    'CREATE_EXAM',
    'VIEW_OWN_CLASS_SESSIONS',
    'VIEW_STUDENT_ROSTERS',
    'FLAG_STUDENT',
  ])
  permissionKey!:
    | 'CREATE_EXAM'
    | 'VIEW_OWN_CLASS_SESSIONS'
    | 'VIEW_STUDENT_ROSTERS'
    | 'FLAG_STUDENT';
  @IsBoolean() granted!: boolean;
}
export class SetManagedAccountStatusDto {
  @IsIn(['ACTIVE', 'DISABLED']) status!: 'ACTIVE' | 'DISABLED';
}
