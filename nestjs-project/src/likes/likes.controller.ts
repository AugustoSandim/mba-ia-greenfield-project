import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { JwtPayload } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { VideosService } from '../videos/videos.service';
import { SetVideoLikeDto } from './dto/set-like.dto';
import { LikesService } from './likes.service';
import { CommentsService } from '../comments/comments.service';

@ApiTags('likes')
@Controller()
export class LikesController {
  constructor(
    private readonly likesService: LikesService,
    private readonly videosService: VideosService,
    private readonly commentsService: CommentsService,
  ) {}

  @Post('videos/:publicId/like')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Like or dislike a video' })
  async setVideoLike(
    @Param('publicId') publicId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: SetVideoLikeDto,
  ): Promise<void> {
    const video = await this.videosService.getVideoForPublicAccess(publicId);
    await this.likesService.setVideoLike(user.sub, video.id, dto.value);
  }

  @Delete('videos/:publicId/like')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove video like/dislike' })
  async removeVideoLike(
    @Param('publicId') publicId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    const video = await this.videosService.getVideoForPublicAccess(publicId);
    await this.likesService.removeVideoLike(user.sub, video.id);
  }

  @Post('comments/:commentId/like')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Like or dislike a comment' })
  async setCommentLike(
    @Param('commentId', ParseUUIDPipe) commentId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: SetVideoLikeDto,
  ): Promise<void> {
    await this.commentsService.findById(commentId);
    await this.likesService.setCommentLike(user.sub, commentId, dto.value);
  }

  @Delete('comments/:commentId/like')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove comment like/dislike' })
  async removeCommentLike(
    @Param('commentId', ParseUUIDPipe) commentId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    await this.commentsService.findById(commentId);
    await this.likesService.removeCommentLike(user.sub, commentId);
  }
}
