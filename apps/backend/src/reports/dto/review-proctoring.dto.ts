import { IsIn } from 'class-validator';

export class ReviewProctoringDto {
  @IsIn(['NEGATIVE', 'POSITIVE'])
  decision!: 'NEGATIVE' | 'POSITIVE';
}
