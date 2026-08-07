import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import type { JwtPayload } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { CompleteUploadDto } from './dto/complete-upload.dto';
import { InitiateUploadDto } from './dto/initiate-upload.dto';
import { SignPartDto } from './dto/sign-part.dto';
import { ThumbnailPresignDto } from './dto/thumbnail-presign.dto';
import { UpdateVideoDto } from './dto/update-video.dto';
import { VideoFeedQueryDto } from './dto/video-feed-query.dto';
import { VideoResponseDto } from './dto/video-response.dto';
import { VideosService } from './videos.service';

@ApiTags('videos')
@Controller()
export class VideosController {
  constructor(private readonly videosService: VideosService) {}

  @Post('videos/uploads')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Initiate multipart video upload (draft)' })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 401 })
  initiateUpload(
    @CurrentUser() user: JwtPayload,
    @Body() dto: InitiateUploadDto,
  ) {
    return this.videosService.initiateUpload(user.sub, dto);
  }

  @Post('videos/uploads/:videoId/parts')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get presigned URL for an upload part' })
  async signPart(
    @CurrentUser() user: JwtPayload,
    @Param('videoId', ParseUUIDPipe) videoId: string,
    @Body() dto: SignPartDto,
  ) {
    const presignedUrl = await this.videosService.getPresignedPartUrl(
      videoId,
      user.sub,
      dto,
    );
    return { presignedUrl };
  }

  @Post('videos/uploads/:videoId/complete')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Complete multipart upload and enqueue processing' })
  async completeUpload(
    @CurrentUser() user: JwtPayload,
    @Param('videoId', ParseUUIDPipe) videoId: string,
    @Body() dto: CompleteUploadDto,
  ) {
    await this.videosService.completeUpload(videoId, user.sub, dto);
    return { videoId, status: 'queued' };
  }

  @Delete('videos/uploads/:videoId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Abort draft multipart upload' })
  async abortUpload(
    @CurrentUser() user: JwtPayload,
    @Param('videoId', ParseUUIDPipe) videoId: string,
  ): Promise<void> {
    await this.videosService.abortUpload(videoId, user.sub);
  }

  @Public()
  @Get('videos')
  @ApiOperation({
    summary: 'Public video feed with search and category filter',
  })
  listFeed(@Query() query: VideoFeedQueryDto) {
    return this.videosService.listFeed(query);
  }

  @Patch('videos/:videoId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update video metadata (owner, ready only)' })
  updateVideo(
    @CurrentUser() user: JwtPayload,
    @Param('videoId', ParseUUIDPipe) videoId: string,
    @Body() dto: UpdateVideoDto,
  ) {
    return this.videosService.updateVideo(videoId, user.sub, dto);
  }

  @Post('videos/:videoId/publish')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Publish a ready video' })
  publish(
    @CurrentUser() user: JwtPayload,
    @Param('videoId', ParseUUIDPipe) videoId: string,
  ) {
    return this.videosService.publishVideo(videoId, user.sub);
  }

  @Post('videos/:videoId/unpublish')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Unpublish a video' })
  unpublish(
    @CurrentUser() user: JwtPayload,
    @Param('videoId', ParseUUIDPipe) videoId: string,
  ) {
    return this.videosService.unpublishVideo(videoId, user.sub);
  }

  @Post('videos/:videoId/thumbnail/presign')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get presigned URL for custom thumbnail upload' })
  presignThumbnail(
    @CurrentUser() user: JwtPayload,
    @Param('videoId', ParseUUIDPipe) videoId: string,
    @Body() dto: ThumbnailPresignDto,
  ) {
    return this.videosService.presignThumbnail(videoId, user.sub, dto);
  }

  @Public()
  @Post('videos/:publicId/views')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Increment video view count' })
  recordView(@Param('publicId') publicId: string) {
    return this.videosService.incrementViewCount(publicId);
  }

  @Public()
  @Get('videos/:publicId/related')
  @ApiOperation({ summary: 'Related videos by category' })
  listRelated(@Param('publicId') publicId: string) {
    return this.videosService.listRelated(publicId);
  }

  @Public()
  @Get('videos/:publicId')
  @ApiOperation({ summary: 'Get video metadata by publicId' })
  @ApiResponse({ status: 200, type: VideoResponseDto })
  @ApiResponse({ status: 404 })
  getVideo(
    @Param('publicId') publicId: string,
    @CurrentUser() user?: JwtPayload,
  ): Promise<VideoResponseDto> {
    return this.videosService.getVideoMetadata(publicId, user?.sub);
  }

  @Public()
  @Get('videos/:publicId/stream')
  @ApiOperation({ summary: 'Stream video with optional Range support' })
  async stream(
    @Param('publicId') publicId: string,
    @Headers('range') range: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    await this.videosService.streamVideo(publicId, range, res);
  }

  @Public()
  @Get('videos/:publicId/download')
  @ApiOperation({ summary: 'Download original video file' })
  async download(
    @Param('publicId') publicId: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.videosService.downloadVideo(publicId, res);
  }
}
