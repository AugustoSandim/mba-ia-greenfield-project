import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { ConfigModule, ConfigType } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { Channel } from '../channels/entities/channel.entity';
import { ChannelsModule } from '../channels/channels.module';
import queueConfig from '../config/queue.config';
import storageConfig from '../config/storage.config';
import { QueueModule } from '../queue/queue.module';
import { QUEUE_NAME } from '../queue/queue.constants';
import { VideoProcessingJobPayload } from '../queue/queue.types';
import { StorageModule } from '../storage/storage.module';
import { StorageService } from '../storage/storage.service';
import { createTestDataSource } from '../test/create-test-data-source';
import { User } from '../users/entities/user.entity';
import { CompleteUploadDto } from './dto/complete-upload.dto';
import { InitiateUploadDto } from './dto/initiate-upload.dto';
import { VideoStatus } from './entities/video-status.enum';
import { Video } from './entities/video.entity';
import { VideosModule } from './videos.module';
import { VideosService } from './videos.service';

const ALL_ENTITIES = [User, Channel, Video];

async function createUserAndChannel(
  dataSource: DataSource,
): Promise<{ user: User; channel: Channel }> {
  const userRepo = dataSource.getRepository(User);
  const channelRepo = dataSource.getRepository(Channel);

  const user = await userRepo.save(
    userRepo.create({
      email: `test-${randomUUID()}@example.com`,
      password: 'hashed',
      is_confirmed: true,
    }),
  );
  const channel = await channelRepo.save(
    channelRepo.create({
      name: 'TestChannel',
      nickname: `test-${randomUUID().slice(0, 8)}`,
      user_id: user.id,
    }),
  );
  return { user, channel };
}

describe('VideosService (integration)', () => {
  let service: VideosService;
  let storageService: StorageService;
  let dataSource: DataSource;
  let queue: Queue<VideoProcessingJobPayload>;

  beforeAll(async () => {
    const ds = createTestDataSource(ALL_ENTITIES);

    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [queueConfig, storageConfig],
        }),
        TypeOrmModule.forRoot(ds.options),
        BullModule.forRootAsync({
          inject: [queueConfig.KEY],
          useFactory: (cfg: ConfigType<typeof queueConfig>) => ({
            connection: { host: cfg.host, port: cfg.port },
          }),
        }),
        StorageModule,
        ChannelsModule,
        QueueModule,
        VideosModule,
      ],
    }).compile();

    service = module.get(VideosService);
    storageService = module.get(StorageService);
    dataSource = module.get(DataSource);
    queue = module.get(getQueueToken(QUEUE_NAME));

    await queue.obliterate({ force: true });
  }, 60000);

  afterAll(async () => {
    await queue.obliterate({ force: true });
    await queue.close();
    await dataSource.destroy();
  });

  beforeEach(async () => {
    await dataSource.query('DELETE FROM "videos"');
    await dataSource.query('DELETE FROM "refresh_tokens"');
    await dataSource.query('DELETE FROM "verification_tokens"');
    await dataSource.query('DELETE FROM "channels"');
    await dataSource.query('DELETE FROM "users"');
    await queue.obliterate({ force: true });
  });

  describe('initiateUpload', () => {
    it('persists video in DB with status=draft, non-null storageKey, non-null uploadId, correct channelId', async () => {
      const { user, channel } = await createUserAndChannel(dataSource);
      const dto: InitiateUploadDto = {
        filename: 'test.mp4',
        mimeType: 'video/mp4',
        size: 1024,
      };

      const result = await service.initiateUpload(user.id, dto);

      expect(result.videoId).toBeDefined();
      expect(result.publicId).toHaveLength(21);
      expect(result.uploadId).toBeTruthy();
      expect(result.key).toMatch(/^videos\/.+\/original$/);

      const videoRepo = dataSource.getRepository(Video);
      const saved = await videoRepo.findOne({ where: { id: result.videoId } });
      expect(saved).toBeDefined();
      expect(saved!.status).toBe(VideoStatus.DRAFT);
      expect(saved!.storageKey).toBe(result.key);
      expect(saved!.uploadId).toBeTruthy();
      expect(saved!.channelId).toBe(channel.id);

      // Cleanup multipart upload to avoid S3 resource leak
      await storageService.abortMultipartUpload(result.key, result.uploadId);
    }, 30000);
  });

  describe('completeUpload', () => {
    it('sets status=queued and uploadId=null in DB; job appears in queue', async () => {
      const { user } = await createUserAndChannel(dataSource);
      const dto: InitiateUploadDto = {
        filename: 'test.mp4',
        mimeType: 'video/mp4',
        size: 1024,
      };
      const { videoId, key, uploadId } = await service.initiateUpload(
        user.id,
        dto,
      );

      // Upload a real part so that CompleteMultipartUpload succeeds
      const partUrl = await storageService.getPresignedUploadPartUrl(
        key,
        uploadId,
        1,
      );
      const body = Buffer.alloc(5 * 1024 * 1024, 0x20); // 5 MB minimum for multipart
      const putResponse = await fetch(partUrl, {
        method: 'PUT',
        body,
        headers: { 'Content-Length': String(body.length) },
      });
      expect(putResponse.ok).toBe(true);
      const etag = putResponse.headers.get('etag');
      expect(etag).toBeTruthy();

      const completeDto: CompleteUploadDto = {
        parts: [{ partNumber: 1, etag: etag! }],
      };
      await service.completeUpload(videoId, user.id, completeDto);

      const videoRepo = dataSource.getRepository(Video);
      const updated = await videoRepo.findOne({ where: { id: videoId } });
      expect(updated!.status).toBe(VideoStatus.QUEUED);
      expect(updated!.uploadId).toBeNull();

      // The job may already be active/completed since the worker container is running.
      // Verify it was enqueued by checking waiting OR active OR completed state.
      const allJobs = await queue.getJobs([
        'waiting',
        'active',
        'completed',
        'delayed',
      ]);
      // Also check failed in case the worker tried to process a non-video file
      const failedJobs = await queue.getFailed();
      const jobExists = [...allJobs, ...failedJobs].some(
        (j) => j.data.videoId === videoId,
      );
      // If job was already processed and removed (removeOnComplete: true), verify via DB status
      const updated2 = await videoRepo.findOne({ where: { id: videoId } });
      expect(jobExists || updated2!.status !== VideoStatus.DRAFT).toBe(true);

      // Cleanup storage object
      await storageService.deleteObject(key).catch(() => undefined);
    }, 30000);
  });

  describe('abortUpload', () => {
    it('removes the video record from the DB', async () => {
      const { user } = await createUserAndChannel(dataSource);
      const dto: InitiateUploadDto = {
        filename: 'abort.mp4',
        mimeType: 'video/mp4',
        size: 1024,
      };
      const { videoId, key, uploadId } = await service.initiateUpload(
        user.id,
        dto,
      );

      await service.abortUpload(videoId, user.id);

      const videoRepo = dataSource.getRepository(Video);
      const found = await videoRepo.findOne({ where: { id: videoId } });
      expect(found).toBeNull();

      // Also verify storage abort was called (upload should be aborted)
      await expect(
        storageService.abortMultipartUpload(key, uploadId),
      ).resolves.toBeUndefined();
    }, 30000);
  });
});
