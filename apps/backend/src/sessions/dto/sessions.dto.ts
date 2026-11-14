import {
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
export class JoinExamDto {
  @IsString() @IsNotEmpty() @MaxLength(32) roomCode!: string;
}
export class EventDto {
  @IsIn([
    'TAB_SWITCH',
    'FULLSCREEN_EXIT',
    'BLACKLISTED_APP',
    'USB_EVENT',
    'IDLE',
    'SCREEN_SHARE_STOPPED',
    'MULTIPLE_DISPLAYS',
  ])
  type!:
    | 'TAB_SWITCH'
    | 'FULLSCREEN_EXIT'
    | 'BLACKLISTED_APP'
    | 'USB_EVENT'
    | 'IDLE'
    | 'SCREEN_SHARE_STOPPED'
    | 'MULTIPLE_DISPLAYS';
  @IsOptional() @IsNumber() @Min(0) @Max(1) intensity?: number;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}
export class EvidenceClipDto {
  @IsString() eventId!: string;
  @IsIn(['PREVIOUS', 'INCIDENT', 'FOLLOWING'])
  phase!: 'PREVIOUS' | 'INCIDENT' | 'FOLLOWING';
  @IsDateString() startedAt!: string;
  @IsDateString() endedAt!: string;
}
export enum TeacherSessionAction {
  warn = 'warn',
  lock = 'lock',
  unlock = 'unlock',
}
export class SendWarningDto {
  @IsString() @IsNotEmpty() @MaxLength(500) message!: string;
}
export class AddExtraTimeDto {
  @IsInt() @Min(1) @Max(240) minutes!: number;
}
export class AnswerDto {
  @IsString() questionId!: string;
  @IsOptional() @IsString() responseText?: string;
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  selectedOptionIds?: string[];
}
export class SubmitDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AnswerDto)
  answers!: AnswerDto[];
}
export class SaveDraftDto extends SubmitDto {}
export class ConfirmGradeDto {
  @IsString() answerId!: string;
  @IsNumber() @Min(0) points!: number;
}
