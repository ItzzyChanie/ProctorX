import { IsString, MaxLength } from 'class-validator';

export class UpdateProfilePictureDto {
  @IsString() @MaxLength(2_800_000) profilePicture!: string;
}
