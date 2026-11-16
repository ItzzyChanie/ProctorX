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
  IsUUID,
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
export class AssignSectionDto {
  @IsUUID() sectionId!: string;
  @IsBoolean() enrollCurrentStudents!: boolean;
}
export const QUESTION_TYPES = [
  'MULTIPLE_CHOICE',
  'MULTIPLE_RESPONSE',
  'ENUMERATION',
  'ESSAY',
  'IDENTIFICATION',
  'FILL_IN_THE_BLANK',
] as const;
export const DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'] as const;

export class QuestionOptionDto {
  @IsString() @IsNotEmpty() @MaxLength(500) label!: string;
  @IsBoolean() isCorrect!: boolean;
}
export class QuestionDto {
  @IsIn(QUESTION_TYPES) type!: (typeof QUESTION_TYPES)[number];
  @IsString() @IsNotEmpty() @MaxLength(5000) prompt!: string;
  @IsBoolean() isRequired!: boolean;
  @IsInt() @Min(1) points!: number;
  /** JSON text: list of answers, or one list per blank for fill-in-the-blank. */
  @IsOptional() @IsString() @MaxLength(20000) correctAnswer?: string;
  @IsOptional() @IsString() @MaxLength(5000) rubric?: string;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionOptionDto)
  options?: QuestionOptionDto[];
  @IsOptional() @IsIn(DIFFICULTIES) difficulty?: (typeof DIFFICULTIES)[number];
  @IsOptional() @IsString() @MaxLength(300) sourceReference?: string;
  @IsOptional() @IsBoolean() allowTypos?: boolean;
  @IsOptional() @IsBoolean() partialCredit?: boolean;
}
export class CreateExamDto {
  @IsString() @IsNotEmpty() @MaxLength(80) academicPeriodId!: string;
  @IsIn(['PRELIMINARY', 'MIDTERM', 'SEMI_FINAL', 'FINAL']) term!:
    | 'PRELIMINARY'
    | 'MIDTERM'
    | 'SEMI_FINAL'
    | 'FINAL';
  @IsIn(['EXAM', 'QUIZ']) assessmentType!: 'EXAM' | 'QUIZ';
  @IsString() @IsNotEmpty() @MaxLength(200) title!: string;
  @IsOptional() @IsString() @MaxLength(10000) instructions?: string;
  @IsOptional() @IsISO8601() scheduledAt?: string;
  @IsOptional() @IsISO8601() endsAt?: string;
  @IsOptional()
  @IsIn(['MANUAL', 'AI_GENERATED', 'GOOGLE_FORMS_IMPORT'])
  sourceType?: 'MANUAL' | 'AI_GENERATED' | 'GOOGLE_FORMS_IMPORT';
  @IsOptional() @IsString() @MaxLength(2000) externalFormUrl?: string;
  @IsOptional() @IsUUID() sourceExamId?: string;
  @IsOptional() @IsBoolean() randomizeQuestions?: boolean;
  @IsOptional() @IsBoolean() randomizeOptions?: boolean;
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
  /** false = save as a draft (not visible to students); default publishes. */
  @IsOptional() @IsBoolean() publish?: boolean;
  /** Text extracted from the source documents (AI-generated exams). */
  @IsOptional() @IsString() @MaxLength(600000) sourceText?: string;
}

export class QuestionBankItemDto {
  @IsOptional() @IsUUID() subjectId?: string;
  @IsIn(QUESTION_TYPES) type!: (typeof QUESTION_TYPES)[number];
  @IsString() @IsNotEmpty() @MaxLength(5000) prompt!: string;
  @IsInt() @Min(1) points!: number;
  @IsBoolean() isRequired!: boolean;
  @IsOptional() correctAnswer?: unknown;
  @IsOptional() @IsString() @MaxLength(5000) rubric?: string;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionOptionDto)
  options?: QuestionOptionDto[];
  @IsArray()
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  topics!: string[];
  @IsIn(['EASY', 'MEDIUM', 'HARD']) difficulty!: 'EASY' | 'MEDIUM' | 'HARD';
}

export class UpdateExamScheduleDto {
  @IsISO8601() scheduledAt!: string;
  @IsISO8601() endsAt!: string;
}
