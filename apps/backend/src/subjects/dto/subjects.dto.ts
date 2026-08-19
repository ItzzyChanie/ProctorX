import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from "class-validator";

export class CreateSubjectDto {
  @IsString() @IsNotEmpty() code!: string;
  @IsString() @IsNotEmpty() name!: string;
}
export class EnrollStudentDto {
  @IsString() @IsNotEmpty() studentId!: string;
}
export class QuestionOptionDto {
  @IsString() @IsNotEmpty() label!: string;
  @IsBoolean() isCorrect!: boolean;
}
export class QuestionDto {
  @IsIn(["MULTIPLE_CHOICE", "ENUMERATION", "ESSAY", "IDENTIFICATION"]) type!:
    | "MULTIPLE_CHOICE"
    | "ENUMERATION"
    | "ESSAY"
    | "IDENTIFICATION";
  @IsString() @IsNotEmpty() prompt!: string;
  @IsInt() @Min(1) points!: number;
  @IsOptional() @IsString() correctAnswer?: string;
  @IsOptional() @IsString() rubric?: string;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionOptionDto)
  options?: QuestionOptionDto[];
}
export class CreateExamDto {
  @IsString() @IsNotEmpty() title!: string;
  @IsOptional() @IsString() instructions?: string;
  @IsInt() @Min(1) durationMinutes!: number;
  @IsBoolean() requireCamera!: boolean;
  @IsBoolean() requireMicrophone!: boolean;
  @IsIn(["BLACKLIST", "WHITELIST"]) appPolicyMode!: "BLACKLIST" | "WHITELIST";
  @IsArray() @IsString({ each: true }) appPolicyList!: string[];
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => QuestionDto)
  questions!: QuestionDto[];
}
