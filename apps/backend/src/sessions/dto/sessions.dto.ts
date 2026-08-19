import { IsArray, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";
export class JoinExamDto { @IsString() @IsNotEmpty() @MaxLength(32) roomCode!: string; }
export class EventDto { @IsIn(["TAB_SWITCH","FULLSCREEN_EXIT","BLACKLISTED_APP","USB_EVENT","IDLE"]) type!: "TAB_SWITCH"|"FULLSCREEN_EXIT"|"BLACKLISTED_APP"|"USB_EVENT"|"IDLE"; @IsOptional() intensity?: number; @IsOptional() metadata?: unknown; }
export class AnswerDto { @IsString() questionId!: string; @IsOptional() @IsString() responseText?: string; @IsOptional() @IsArray() @IsString({each:true}) selectedOptionIds?: string[]; }
export class SubmitDto { @IsArray() answers!: AnswerDto[]; }
