import { IsIn, IsNotEmpty, IsString } from 'class-validator';

export class ThumbnailPresignDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(['image/jpeg', 'image/png', 'image/webp'])
  mimeType: string;
}
