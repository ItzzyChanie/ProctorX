import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateResultReleaseDto {
  @IsBoolean()
  showCorrectAnswers!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  teacherFeedback?: string;
}