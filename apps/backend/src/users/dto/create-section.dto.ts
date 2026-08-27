import { IsIn, IsString, Matches, MaxLength } from 'class-validator';

export class CreateSectionDto {
  @IsString() @IsIn(['CS', 'IT']) program!: string;
  @IsString() @IsIn(['1', '2', '3', '4']) yearLevel!: string;
  @IsString() @Matches(/\S/) @MaxLength(30) name!: string;
}
