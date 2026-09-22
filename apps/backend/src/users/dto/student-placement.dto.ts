import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsUUID,
} from 'class-validator';

export class TransferStudentDto {
  @IsIn(['CS', 'IT']) program!: string;
  @IsIn(['1', '2', '3', '4', 'YEAR_1', 'YEAR_2', 'YEAR_3', 'YEAR_4'])
  yearLevel!: string;
  @IsUUID() sectionId!: string;
}

export class PromoteSectionDto {
  @IsUUID() targetSectionId!: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID(undefined, { each: true })
  studentIds?: string[];
}
