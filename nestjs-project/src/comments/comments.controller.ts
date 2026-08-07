import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { JwtPayload } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { VideosService } from '../videos/videos.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { CommentsService } from './comments.service';

@ApiTags('comments')
@Controller()
export class CommentsController {
  constructor(
    private readonly commentsService: CommentsService,
    private readonly videosService: VideosService,
  ) {}

  @Public()
  @Get('videos/:publicId/comments')
  @ApiOperation({ summary: 'List comments for a video' })
  async list(@Param('publicId') publicId: string) {
    const video = await this.videosService.getVideoForPublicAccess(publicId);
    const comments = await this.commentsService.listByVideo(video.id);
    return { items: comments };
  }

  @Post('videos/:publicId/comments')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a top-level comment' })
  async create(
    @Param('publicId') publicId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateCommentDto,
  ) {
    const video = await this.videosService.getVideoForPublicAccess(publicId);
    return this.commentsService.create(video.id, user.sub, dto);
  }

  @Post('comments/:commentId/replies')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reply to a comment' })
  async reply(
    @Param('commentId', ParseUUIDPipe) commentId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateCommentDto,
  ) {
    const parent = await this.commentsService.findById(commentId);
    return this.commentsService.create(
      parent.videoId,
      user.sub,
      dto,
      commentId,
    );
  }

  @Delete('comments/:commentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete own comment' })
  async remove(
    @Param('commentId', ParseUUIDPipe) commentId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    await this.commentsService.delete(commentId, user.sub);
  }
}
