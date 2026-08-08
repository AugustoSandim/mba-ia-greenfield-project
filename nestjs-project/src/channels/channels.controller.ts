import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { JwtPayload } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { PaginationQueryDto } from '../videos/dto/video-feed-query.dto';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { VideosService } from '../videos/videos.service';
import { ChannelsService } from './channels.service';
import { UpdateChannelDto } from './dto/update-channel.dto';

@ApiTags('channels')
@Controller('channels')
export class ChannelsController {
  constructor(
    private readonly channelsService: ChannelsService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly videosService: VideosService,
  ) {}

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get authenticated user channel' })
  async getMyChannel(@CurrentUser() user: JwtPayload) {
    const channel = await this.channelsService.findChannelByUserId(user.sub);
    const subscriberCount = await this.channelsService.getSubscriberCount(
      channel.id,
    );
    return { ...channel, subscriberCount };
  }

  @Patch('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update authenticated user channel' })
  async updateMyChannel(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateChannelDto,
  ) {
    return this.channelsService.updateChannel(user.sub, dto);
  }

  @Get('me/videos')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List all videos for owner channel dashboard' })
  async listMyVideos(
    @CurrentUser() user: JwtPayload,
    @Query() query: PaginationQueryDto,
  ) {
    const channel = await this.channelsService.findChannelByUserId(user.sub);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const { items, total } = await this.channelsService.listOwnerVideos(
      channel.id,
      page,
      limit,
    );
    return {
      items: await this.videosService.mapVideosToResponse(items, user.sub),
      total,
      page,
      limit,
    };
  }

  @Get('me/subscriptions')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List channels the user subscribes to' })
  listMySubscriptions(@CurrentUser() user: JwtPayload) {
    return this.channelsService.listSubscriptions(user.sub);
  }

  @Public()
  @Get(':nickname')
  @ApiOperation({ summary: 'Public channel profile and published videos' })
  async getPublicChannel(
    @Param('nickname') nickname: string,
    @Query() query: PaginationQueryDto,
  ) {
    const channel = await this.channelsService.findByNickname(nickname);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const [subscriberCount, videosResult] = await Promise.all([
      this.channelsService.getSubscriberCount(channel.id),
      this.channelsService.listPublicVideos(channel.id, page, limit),
    ]);
    const videos = await this.videosService.mapVideosToResponse(
      videosResult.items,
    );
    return {
      channel: { ...channel, subscriberCount },
      videos,
      total: videosResult.total,
      page,
      limit,
    };
  }

  @Post(':nickname/subscribe')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Subscribe to a channel' })
  async subscribe(
    @CurrentUser() user: JwtPayload,
    @Param('nickname') nickname: string,
  ): Promise<void> {
    const channel = await this.channelsService.findByNickname(nickname);
    await this.subscriptionsService.subscribe(user.sub, channel.id);
  }

  @Delete(':nickname/subscribe')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Unsubscribe from a channel' })
  async unsubscribe(
    @CurrentUser() user: JwtPayload,
    @Param('nickname') nickname: string,
  ): Promise<void> {
    const channel = await this.channelsService.findByNickname(nickname);
    await this.subscriptionsService.unsubscribe(user.sub, channel.id);
  }
}
