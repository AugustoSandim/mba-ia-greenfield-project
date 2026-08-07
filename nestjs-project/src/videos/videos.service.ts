import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import type { Response } from 'express';
import { Repository } from 'typeorm';
import { ChannelsService } from '../channels/channels.service';
import { ChannelNotFoundException } from '../common/exceptions/domain.exception';
import { QueueService } from '../queue/queue.service';
import { StorageService } from '../storage/storage.service';
import { CompleteUploadDto } from './dto/complete-upload.dto';
import { InitiateUploadDto } from './dto/initiate-upload.dto';
import { SignPartDto } from './dto/sign-part.dto';
import { VideoResponseDto } from './dto/video-response.dto';
import { VideoStatus } from './entities/video-status.enum';
import { Video } from './entities/video.entity';
import {
  VideoNotFoundException,
  VideoNotInDraftException,
  VideoOwnershipException,
} from './exceptions/video.exceptions';
import { generatePublicId } from './public-id.util';

@Injectable()
export class VideosService {
  constructor(
    @InjectRepository(Video)
    private readonly videoRepository: Repository<Video>,
    private readonly storageService: StorageService,
    private readonly queueService: QueueService,
    private readonly channelsService: ChannelsService,
  ) {}

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
  ): Promise<void> {
    const video = await this.videoRepository.findOne({
      where: { publicId, status: VideoStatus.READY },
    });
    if (!video?.storageKey) {
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

  async downloadVideo(publicId: string, res: Response): Promise<void> {
    const video = await this.videoRepository.findOne({
      where: { publicId, status: VideoStatus.READY },
    });
    if (!video?.storageKey) {
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

    if (video.status !== VideoStatus.READY) {
      if (!userId) {
        throw new VideoNotFoundException();
      }
      try {
        const channel = await this.channelsService.findChannelByUserId(userId);
        if (video.channelId !== channel.id) {
          throw new VideoNotFoundException();
        }
      } catch (err) {
        if (
          err instanceof VideoNotFoundException ||
          err instanceof ChannelNotFoundException
        ) {
          throw new VideoNotFoundException();
        }
        throw err;
      }
    }

    const thumbnailUrl = video.thumbnailKey
      ? await this.storageService.getPresignedGetUrl(video.thumbnailKey, 3600)
      : null;

    return {
      id: video.id,
      publicId: video.publicId,
      title: video.title,
      description: video.description,
      status: video.status,
      duration: video.duration,
      channelId: video.channelId,
      thumbnailUrl,
      createdAt: video.createdAt,
      updatedAt: video.updatedAt,
    };
  }
}
