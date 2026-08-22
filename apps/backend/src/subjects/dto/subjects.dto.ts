import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateSubjectDto {
  @IsString() @IsNotEmpty() @MaxLength(30) subjectCode!: string;
  @IsString() @IsNotEmpty() @MaxLength(150) name!: string;
  @IsString() @IsNotEmpty() @MaxLength(150) schedule!: string;
}
export class UpdateSubjectDto extends CreateSubjectDto {}
export class JoinSubjectDto {
  @IsString() @IsNotEmpty() @MaxLength(30) code!: string;
}
export class ReviewJoinRequestDto {
  @IsIn(['APPROVED', 'DECLINED']) status!: 'APPROVED' | 'DECLINED';
}
export class QuestionOptionDto {
  @IsString() @IsNotEmpty() @MaxLength(500) label!: string;
  @IsBoolean() isCorrect!: boolean;
}
export class QuestionDto {
  @IsIn(['MULTIPLE_CHOICE', 'ENUMERATION', 'ESSAY', 'IDENTIFICATION']) type!:
    | 'MULTIPLE_CHOICE'
    | 'ENUMERATION'
    | 'ESSAY'
    | 'IDENTIFICATION';
  @IsString() @IsNotEmpty() @MaxLength(5000) prompt!: string;
  @IsBoolean() isRequired!: boolean;
  @IsInt() @Min(1) points!: number;
  @IsOptional() @IsString() @MaxLength(5000) correctAnswer?: string;
  @IsOptional() @IsString() @MaxLength(5000) rubric?: string;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionOptionDto)
  options?: QuestionOptionDto[];
}
export class CreateExamDto {
  @IsIn(['EXAM', 'QUIZ']) assessmentType!: 'EXAM' | 'QUIZ';
  @IsString() @IsNotEmpty() @MaxLength(200) title!: string;
  @IsOptional() @IsString() @MaxLength(10000) instructions?: string;
  @IsOptional() @IsISO8601() scheduledAt?: string;
  @IsOptional() @IsISO8601() endsAt?: string;
  @IsOptional() @IsIn(['MANUAL', 'AI_GENERATED', 'GOOGLE_FORMS_IMPORT']) sourceType?: 'MANUAL' | 'AI_GENERATED' | 'GOOGLE_FORMS_IMPORT';
  @IsOptional() @IsString() @MaxLength(2000) externalFormUrl?: string;
  @IsInt() @Min(1) durationMinutes!: number;
  @IsBoolean() requireCamera!: boolean;
  @IsBoolean() requireMicrophone!: boolean;
  @IsIn(['BLACKLIST', 'WHITELIST']) appPolicyMode!: 'BLACKLIST' | 'WHITELIST';
  @IsArray()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  appPolicyList!: string[];
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionDto)
  questions?: QuestionDto[];
}
