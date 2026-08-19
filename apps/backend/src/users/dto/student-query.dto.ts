import { IsIn, IsString } from "class-validator";
export class StudentQueryDto {
  @IsString() @IsIn(["CS", "IT"]) program!: string;
  @IsString() @IsIn(["1", "2", "3", "4"]) yearLevel!: string;
}
