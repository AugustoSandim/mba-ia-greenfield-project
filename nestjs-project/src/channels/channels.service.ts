import { Injectable } from '@nestjs/common';
import { DataSource, IsNull, Not, QueryFailedError } from 'typeorm';
import { ChannelNotFoundException } from '../common/exceptions/domain.exception';
import { Subscription } from '../subscriptions/entities/subscription.entity';
import { Video } from '../videos/entities/video.entity';
import { VideoStatus } from '../videos/entities/video-status.enum';
import { VideoVisibility } from '../videos/entities/video-visibility.enum';
import { UpdateChannelDto } from './dto/update-channel.dto';
import { Channel } from './entities/channel.entity';
import {
  ChannelByNicknameNotFoundException,
  ChannelNicknameTakenException,
} from './exceptions/channel.exceptions';
import { appendRandomSuffix, sanitizeNickname } from './nickname.util';

const PG_UNIQUE_VIOLATION = '23505';
const NICKNAME_COLUMN = 'nickname';
const MAX_RETRIES = 5;

type PgDriverError = {
  code?: string;
  detail?: string;
};

function isPgUniqueViolationOnColumn(err: unknown, column: string): boolean {
  if (!(err instanceof QueryFailedError)) return false;
  const driverError = err.driverError as PgDriverError;
  const code = driverError?.code ?? (err as PgDriverError).code;
  const detail = driverError?.detail ?? (err as PgDriverError).detail;
  return (
    code === PG_UNIQUE_VIOLATION &&
    typeof detail === 'string' &&
    detail.includes(column)
  );
}

@Injectable()
export class ChannelsService {
  constructor(private readonly dataSource: DataSource) {}

  async findChannelByUserId(userId: string): Promise<Channel> {
    const channel = await this.dataSource.getRepository(Channel).findOne({
      where: { user_id: userId },
    });
    if (!channel) {
      throw new ChannelNotFoundException();
    }
    return channel;
  }

  async createChannel(userId: string, email: string): Promise<Channel> {
    const baseNickname = sanitizeNickname(email.split('@')[0]);

    return this.dataSource.transaction(async (manager) => {
      let nickname = baseNickname;

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        const existing = await manager.findOne(Channel, {
          where: { nickname },
        });
        if (existing) {
          nickname = appendRandomSuffix(baseNickname);
          continue;
        }

        try {
          return await manager.save(
            manager.create(Channel, {
              name: baseNickname,
              nickname,
              user_id: userId,
            }),
          );
        } catch (err) {
          if (isPgUniqueViolationOnColumn(err, NICKNAME_COLUMN)) {
            nickname = appendRandomSuffix(baseNickname);
          } else {
            throw err;
          }
        }
      }

      throw new Error(
        'Nickname conflict could not be resolved after max retries',
      );
    });
  }

  async findByNickname(nickname: string): Promise<Channel> {
    const channel = await this.dataSource.getRepository(Channel).findOne({
      where: { nickname },
    });
    if (!channel) {
      throw new ChannelByNicknameNotFoundException();
    }
    return channel;
  }

  async updateChannel(userId: string, dto: UpdateChannelDto): Promise<Channel> {
    const repo = this.dataSource.getRepository(Channel);
    const channel = await this.findChannelByUserId(userId);

    if (dto.nickname !== undefined) {
      const nickname = sanitizeNickname(dto.nickname);
      const taken = await repo.findOne({ where: { nickname } });
      if (taken && taken.id !== channel.id) {
        throw new ChannelNicknameTakenException();
      }
      channel.nickname = nickname;
    }
    if (dto.name !== undefined) {
      channel.name = dto.name;
    }
    if (dto.description !== undefined) {
      channel.description = dto.description;
    }

    try {
      return await repo.save(channel);
    } catch (err) {
      if (isPgUniqueViolationOnColumn(err, NICKNAME_COLUMN)) {
        throw new ChannelNicknameTakenException();
      }
      throw err;
    }
  }

  async getSubscriberCount(channelId: string): Promise<number> {
    return this.dataSource.getRepository(Subscription).count({
      where: { channelId },
    });
  }

  async listPublicVideos(
    channelId: string,
    page: number,
    limit: number,
  ): Promise<{ items: Video[]; total: number }> {
    const repo = this.dataSource.getRepository(Video);
    const [items, total] = await repo.findAndCount({
      where: {
        channelId,
        status: VideoStatus.READY,
        visibility: VideoVisibility.PUBLIC,
        publishedAt: Not(IsNull()),
      },
      relations: ['channel', 'category'],
      order: { publishedAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total };
  }

  async listOwnerVideos(
    channelId: string,
    page: number,
    limit: number,
  ): Promise<{ items: Video[]; total: number }> {
    const repo = this.dataSource.getRepository(Video);
    const [items, total] = await repo.findAndCount({
      where: { channelId },
      relations: ['channel', 'category'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total };
  }

  async listSubscriptions(userId: string): Promise<Channel[]> {
    const subs = await this.dataSource.getRepository(Subscription).find({
      where: { subscriberId: userId },
      relations: ['channel'],
      order: { createdAt: 'DESC' },
    });
    return subs.map((s) => s.channel);
  }
}
