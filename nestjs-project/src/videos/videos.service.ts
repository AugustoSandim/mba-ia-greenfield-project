import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import type { Response } from 'express';
import { Repository } from 'typeorm';
import { CategoriesService } from '../categories/categories.service';
import { ChannelsService } from '../channels/channels.service';
import { VideoNotReadyForPublishException } from '../channels/exceptions/channel.exceptions';
import { ChannelNotFoundException } from '../common/exceptions/domain.exception';
import { CommentsService } from '../comments/comments.service';
import { LikesService } from '../likes/likes.service';
import { QueueService } from '../queue/queue.service';
import { StorageService } from '../storage/storage.service';
import { CompleteUploadDto } from './dto/complete-upload.dto';
import { InitiateUploadDto } from './dto/initiate-upload.dto';
import { SignPartDto } from './dto/sign-part.dto';
import { ThumbnailPresignDto } from './dto/thumbnail-presign.dto';
import { UpdateVideoDto } from './dto/update-video.dto';
import { VideoFeedQueryDto } from './dto/video-feed-query.dto';
import { VideoResponseDto } from './dto/video-response.dto';
import { VideoStatus } from './entities/video-status.enum';
import { VideoVisibility } from './entities/video-visibility.enum';
import { Video } from './entities/video.entity';
import {
  VideoNotFoundException,
  VideoNotInDraftException,
  VideoOwnershipException,
} from './exceptions/video.exceptions';
import { generatePublicId } from './public-id.util';
import { canAccessVideo } from './video-access.util';

@Injectable()
export class VideosService {
  constructor(
    @InjectRepository(Video)
    private readonly videoRepository: Repository<Video>,
    private readonly storageService: StorageService,
    private readonly queueService: QueueService,
    private readonly channelsService: ChannelsService,
    private readonly categoriesService: CategoriesService,
    @Inject(forwardRef(() => LikesService))
    private readonly likesService: LikesService,
    @Inject(forwardRef(() => CommentsService))
    private readonly commentsService: CommentsService,
  ) {}

  private async resolveOwnerChannelId(
    userId: string | undefined,
  ): Promise<string | undefined> {
    if (!userId) return undefined;
    try {
      const channel = await this.channelsService.findChannelByUserId(userId);
      return channel.id;
    } catch (err) {
      if (err instanceof ChannelNotFoundException) {
        return undefined;
      }
      throw err;
    }
  }

  private async getOwnedVideo(videoId: string, userId: string): Promise<Video> {
    const video = await this.videoRepository.findOne({
      where: { id: videoId },
    });
    if (!video) {
      throw new VideoNotFoundException();
    }
    const channel = await this.channelsService.findChannelByUserId(userId);
    if (video.channelId !== channel.id) {
      throw new VideoOwnershipException();
    }
    return video;
  }

  async getVideoForPublicAccess(publicId: string): Promise<Video> {
    const video = await this.videoRepository.findOne({ where: { publicId } });
    if (!video || !canAccessVideo(video, undefined)) {
      throw new VideoNotFoundException();
    }
    return video;
  }

  private async toResponseDto(
    video: Video,
    userId?: string,
  ): Promise<VideoResponseDto> {
    const thumbnailUrl = video.thumbnailKey
      ? await this.storageService.getPresignedGetUrl(video.thumbnailKey, 3600)
      : null;
    const [{ likes, dislikes }, commentsCount, viewerReaction] =
      await Promise.all([
        this.likesService.getVideoLikeCounts(video.id),
        this.commentsService.countByVideo(video.id),
        this.likesService.getUserVideoReaction(userId, video.id),
      ]);

    const category = video.categoryId
      ? await this.categoriesService.findById(video.categoryId)
      : null;

    return {
      id: video.id,
      publicId: video.publicId,
      title: video.title,
      description: video.description,
      status: video.status,
      duration: video.duration,
      channelId: video.channelId,
      categoryId: video.categoryId,
      visibility: video.visibility,
      publishedAt: video.publishedAt,
      viewCount: video.viewCount,
      thumbnailUrl,
      createdAt: video.createdAt,
      updatedAt: video.updatedAt,
      likesCount: likes,
      dislikesCount: dislikes,
      commentsCount,
      viewerReaction,
      channel: video.channel
        ? {
            id: video.channel.id,
            name: video.channel.name,
            nickname: video.channel.nickname,
          }
        : undefined,
      category: category
        ? { id: category.id, name: category.name, slug: category.slug }
        : null,
    };
  }

  async mapVideosToResponse(
    videos: Video[],
    userId?: string,
  ): Promise<VideoResponseDto[]> {
    return Promise.all(
      videos.map((video) => this.toResponseDto(video, userId)),
    );
  }

  private async generateUniquePublicId(maxRetries = 5): Promise<string> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const publicId = generatePublicId();
      const existing = await this.videoRepository.findOne({
        where: { publicId },
      });
      if (!existing) {
        return publicId;
      }
    }
    throw new Error('Could not generate a unique publicId');
  }

  private async getOwnedDraft(videoId: string, userId: string): Promise<Video> {
    const video = await this.videoRepository.findOne({
      where: { id: videoId },
    });
    if (!video) {
      throw new VideoNotFoundException();
    }
    const channel = await this.channelsService.findChannelByUserId(userId);
    if (video.channelId !== channel.id) {
      throw new VideoOwnershipException();
    }
    if (video.status !== VideoStatus.DRAFT) {
      throw new VideoNotInDraftException();
    }
    return video;
  }

  async initiateUpload(
    userId: string,
    dto: InitiateUploadDto,
  ): Promise<{
    videoId: string;
    publicId: string;
    uploadId: string;
    key: string;
  }> {
    const channel = await this.channelsService.findChannelByUserId(userId);
    const publicId = await this.generateUniquePublicId();
    const id = randomUUID();
    const key = `videos/${id}/original`;
    const uploadId = await this.storageService.createMultipartUpload(
      key,
      dto.mimeType,
    );

    await this.videoRepository.save(
      this.videoRepository.create({
        id,
        publicId,
        channelId: channel.id,
        storageKey: key,
        uploadId,
        status: VideoStatus.DRAFT,
      }),
    );

    return { videoId: id, publicId, uploadId, key };
  }

  async getPresignedPartUrl(
    videoId: string,
    userId: string,
    dto: SignPartDto,
  ): Promise<string> {
    const video = await this.getOwnedDraft(videoId, userId);
    if (!video.uploadId || !video.storageKey) {
      throw new VideoNotInDraftException();
    }
    return this.storageService.getPresignedUploadPartUrl(
      video.storageKey,
      video.uploadId,
      dto.partNumber,
    );
  }

  async completeUpload(
    videoId: string,
    userId: string,
    dto: CompleteUploadDto,
  ): Promise<void> {
    const video = await this.getOwnedDraft(videoId, userId);
    if (!video.uploadId || !video.storageKey) {
      throw new VideoNotInDraftException();
    }

    await this.storageService.completeMultipartUpload(
      video.storageKey,
      video.uploadId,
      dto.parts.map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
    );

    video.status = VideoStatus.QUEUED;
    video.uploadId = null;
    await this.videoRepository.save(video);
    await this.queueService.enqueueVideoProcessing(videoId);
  }

  async abortUpload(videoId: string, userId: string): Promise<void> {
    const video = await this.getOwnedDraft(videoId, userId);
    if (video.uploadId && video.storageKey) {
      await this.storageService.abortMultipartUpload(
        video.storageKey,
        video.uploadId,
      );
    }
    await this.videoRepository.delete(videoId);
  }

  async streamVideo(
    publicId: string,
    rangeHeader: string | undefined,
    res: Response,
    userId?: string,
  ): Promise<void> {
    const video = await this.videoRepository.findOne({ where: { publicId } });
    const ownerChannelId = await this.resolveOwnerChannelId(userId);
    if (!video?.storageKey || !canAccessVideo(video, ownerChannelId)) {
      throw new VideoNotFoundException();
    }

    const { body, contentLength, contentType, contentRange } =
      await this.storageService.getObjectStream(video.storageKey, rangeHeader);

    res.setHeader('Content-Type', contentType || 'video/mp4');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Length', contentLength.toString());
    if (contentRange) {
      res.setHeader('Content-Range', contentRange);
    }
    res.status(rangeHeader && contentRange ? 206 : 200);
    body.pipe(res);
  }

  async downloadVideo(
    publicId: string,
    res: Response,
    userId?: string,
  ): Promise<void> {
    const video = await this.videoRepository.findOne({ where: { publicId } });
    const ownerChannelId = await this.resolveOwnerChannelId(userId);
    if (!video?.storageKey || !canAccessVideo(video, ownerChannelId)) {
      throw new VideoNotFoundException();
    }

    const { body, contentLength, contentType } =
      await this.storageService.getObjectStream(video.storageKey);

    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${publicId}.mp4"`,
    );
    res.setHeader('Content-Type', contentType || 'video/mp4');
    res.setHeader('Content-Length', contentLength.toString());
    res.status(200);
    body.pipe(res);
  }

  async getVideoMetadata(
    publicId: string,
    userId: string | undefined,
  ): Promise<VideoResponseDto> {
    const video = await this.videoRepository.findOne({ where: { publicId } });
    if (!video) {
      throw new VideoNotFoundException();
    }

    const ownerChannelId = await this.resolveOwnerChannelId(userId);
    if (!canAccessVideo(video, ownerChannelId)) {
      throw new VideoNotFoundException();
    }

    return this.toResponseDto(video, userId);
  }

  async listFeed(query: VideoFeedQueryDto): Promise<{
    items: VideoResponseDto[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const qb = this.videoRepository
      .createQueryBuilder('video')
      .leftJoinAndSelect('video.channel', 'channel')
      .leftJoinAndSelect('video.category', 'category')
      .where('video.status = :status', { status: VideoStatus.READY })
      .andWhere('video.published_at IS NOT NULL')
      .andWhere('video.visibility = :visibility', {
        visibility: VideoVisibility.PUBLIC,
      });

    if (query.category) {
      qb.innerJoin('video.category', 'category').andWhere(
        'category.slug = :slug',
        { slug: query.category },
      );
    }
    if (query.q) {
      qb.andWhere(
        '(video.title ILIKE :q OR video.description ILIKE :q OR channel.name ILIKE :q OR channel.nickname ILIKE :q)',
        { q: `%${query.q}%` },
      );
    }

    qb.orderBy('video.published_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [videos, total] = await qb.getManyAndCount();
    const items = await Promise.all(videos.map((v) => this.toResponseDto(v)));
    return { items, total, page, limit };
  }

  async updateVideo(
    videoId: string,
    userId: string,
    dto: UpdateVideoDto,
  ): Promise<VideoResponseDto> {
    const video = await this.getOwnedVideo(videoId, userId);
    if (dto.categoryId !== undefined && dto.categoryId !== null) {
      const category = await this.categoriesService.findById(dto.categoryId);
      if (!category) {
        throw new VideoNotFoundException();
      }
    }
    Object.assign(video, {
      ...(dto.title !== undefined && { title: dto.title }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.categoryId !== undefined && { categoryId: dto.categoryId }),
      ...(dto.visibility !== undefined && { visibility: dto.visibility }),
    });
    const saved = await this.videoRepository.save(video);
    return this.toResponseDto(saved, userId);
  }

  async publishVideo(
    videoId: string,
    userId: string,
  ): Promise<VideoResponseDto> {
    const video = await this.getOwnedVideo(videoId, userId);
    if (video.status !== VideoStatus.READY) {
      throw new VideoNotReadyForPublishException();
    }
    video.publishedAt = new Date();
    const saved = await this.videoRepository.save(video);
    return this.toResponseDto(saved, userId);
  }

  async unpublishVideo(
    videoId: string,
    userId: string,
  ): Promise<VideoResponseDto> {
    const video = await this.getOwnedVideo(videoId, userId);
    video.publishedAt = null;
    const saved = await this.videoRepository.save(video);
    return this.toResponseDto(saved, userId);
  }

  async presignThumbnail(
    videoId: string,
    userId: string,
    dto: ThumbnailPresignDto,
  ): Promise<{ presignedUrl: string; thumbnailKey: string }> {
    const video = await this.getOwnedVideo(videoId, userId);
    if (video.status !== VideoStatus.READY) {
      throw new VideoNotReadyForPublishException();
    }
    const thumbnailKey = `videos/${video.id}/thumbnail.jpg`;
    const presignedUrl = await this.storageService.getPresignedPutUrl(
      thumbnailKey,
      dto.mimeType,
    );
    video.thumbnailKey = thumbnailKey;
    await this.videoRepository.save(video);
    return { presignedUrl, thumbnailKey };
  }

  async incrementViewCount(publicId: string): Promise<{ viewCount: number }> {
    const video = await this.getVideoForPublicAccess(publicId);
    video.viewCount += 1;
    await this.videoRepository.save(video);
    return { viewCount: video.viewCount };
  }

  async listRelated(publicId: string, limit = 12): Promise<VideoResponseDto[]> {
    const video = await this.getVideoForPublicAccess(publicId);
    const qb = this.videoRepository
      .createQueryBuilder('video')
      .where('video.id != :id', { id: video.id })
      .andWhere('video.status = :status', { status: VideoStatus.READY })
      .andWhere('video.published_at IS NOT NULL')
      .andWhere('video.visibility = :visibility', {
        visibility: VideoVisibility.PUBLIC,
      });
    if (video.categoryId) {
      qb.andWhere('video.category_id = :categoryId', {
        categoryId: video.categoryId,
      });
    }
    const related = await qb
      .orderBy('video.published_at', 'DESC')
      .take(limit)
      .getMany();
    return Promise.all(related.map((v) => this.toResponseDto(v)));
  }
}
