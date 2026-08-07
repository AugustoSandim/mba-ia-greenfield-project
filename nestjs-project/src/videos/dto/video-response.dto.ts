import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VideoStatus } from '../entities/video-status.enum';
import { VideoVisibility } from '../entities/video-visibility.enum';

export class VideoResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  publicId: string;

  @ApiPropertyOptional({ nullable: true })
  title: string | null;

  @ApiPropertyOptional({ nullable: true })
  description: string | null;

  @ApiProperty({ enum: VideoStatus })
  status: VideoStatus;

  @ApiPropertyOptional({ nullable: true })
  duration: number | null;

  @ApiProperty()
  channelId: string;

  @ApiPropertyOptional({ nullable: true })
  categoryId: string | null;

  @ApiProperty({ enum: VideoVisibility })
  visibility: VideoVisibility;

  @ApiPropertyOptional({ nullable: true })
  publishedAt: Date | null;

  @ApiProperty()
  viewCount: number;

  @ApiPropertyOptional({ nullable: true })
  thumbnailUrl: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
