import { Logger } from '@nestjs/common';
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import * as fs from 'fs';
import * as path from 'path';
import { Repository } from 'typeorm';
import ffmpeg from 'fluent-ffmpeg';
import { QUEUE_NAME } from '../queue/queue.constants';
import { VideoProcessingJobPayload } from '../queue/queue.types';
import { StorageService } from '../storage/storage.service';
import { VideoStatus } from '../videos/entities/video-status.enum';
import { Video } from '../videos/entities/video.entity';

@Processor(QUEUE_NAME)
export class VideoProcessingProcessor extends WorkerHost {
  private readonly logger = new Logger(VideoProcessingProcessor.name);

  constructor(
    @InjectRepository(Video)
    private readonly videoRepository: Repository<Video>,
    private readonly storageService: StorageService,
  ) {
    super();
  }

  async process(job: Job<VideoProcessingJobPayload>): Promise<void> {
    const video = await this.videoRepository.findOne({
      where: { id: job.data.videoId },
    });
    if (!video) {
      throw new Error(`Video not found: ${job.data.videoId}`);
    }
    if (!video.storageKey) {
      throw new Error(`Video ${video.id} has no storageKey`);
    }

    const tmpDir = path.join('/tmp/streamtube', video.id);
    const tmpFilePath = path.join(tmpDir, 'original');

    try {
      await this.videoRepository.update(video.id, {
        status: VideoStatus.PROCESSING,
      });

      await fs.promises.mkdir(tmpDir, { recursive: true });
      const { body } = await this.storageService.getObjectStream(
        video.storageKey,
      );
      await this.writeStreamToFile(body, tmpFilePath);

      const duration = await this.probeDuration(tmpFilePath);
      const thumbnailTimemark = String(
        Math.max(0, Math.min(1, (duration ?? 2) * 0.1)).toFixed(3),
      );
      await this.takeScreenshot(tmpFilePath, tmpDir, thumbnailTimemark);

      const thumbnailPath = path.join(tmpDir, 'thumbnail.jpg');
      const thumbnailBuffer = await fs.promises.readFile(thumbnailPath);
      const thumbnailKey = `videos/${video.id}/thumbnail.jpg`;
      await this.storageService.putObject(
        thumbnailKey,
        thumbnailBuffer,
        'image/jpeg',
        thumbnailBuffer.length,
      );

      await this.videoRepository.update(video.id, {
        status: VideoStatus.READY,
        duration: duration ?? null,
        thumbnailKey,
        failureReason: null,
      });
    } finally {
      await fs.promises.rm(tmpDir, { recursive: true, force: true });
    }
  }

  @OnWorkerEvent('failed')
  onFailed(
    job: Job<VideoProcessingJobPayload> | undefined,
    error: Error,
  ): void {
    if (!job) return;
    const maxAttempts = job.opts.attempts ?? 1;
    if (job.attemptsMade < maxAttempts) {
      return;
    }
    void this.videoRepository
      .update(job.data.videoId, {
        status: VideoStatus.FAILED,
        failureReason: error.message,
      })
      .catch((err: unknown) =>
        this.logger.error('Failed to mark video as failed', err),
      );
  }

  private writeStreamToFile(
    body: NodeJS.ReadableStream,
    filePath: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const writeStream = fs.createWriteStream(filePath);
      body.pipe(writeStream);
      writeStream.on('finish', () => resolve());
      writeStream.on('error', reject);
      body.on('error', reject);
    });
  }

  private probeDuration(filePath: string): Promise<number | undefined> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
          return;
        }
        resolve(metadata.format.duration);
      });
    });
  }

  private takeScreenshot(
    filePath: string,
    folder: string,
    timemark: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(filePath)
        .on('end', () => resolve())
        .on('error', (err: Error) => reject(err))
        .screenshots({
          count: 1,
          timemarks: [timemark],
          filename: 'thumbnail.jpg',
          folder,
          size: '1280x720',
        });
    });
  }
}
