import { IsIn } from 'class-validator';

export class SetAccountStatusDto {
  @IsIn(['ACTIVE', 'DISABLED']) status!: 'ACTIVE' | 'DISABLED';
}
