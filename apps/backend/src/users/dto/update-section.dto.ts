import { IsString, Matches, MaxLength } from 'class-validator';

export class UpdateSectionDto {
  @IsString() @Matches(/\S/) @MaxLength(30) name!: string;
}
