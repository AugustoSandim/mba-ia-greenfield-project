import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { VideoVisibility } from '../entities/video-visibility.enum';

export class UpdateVideoDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string | null;

  @IsOptional()
  @IsUUID()
  categoryId?: string | null;

  @IsOptional()
  @IsEnum(VideoVisibility)
  visibility?: VideoVisibility;
}
