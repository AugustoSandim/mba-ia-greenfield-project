import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import { Readable } from 'stream';
import { Repository } from 'typeorm';
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/unbound-method, @typescript-eslint/require-await */
import { ChannelsService } from '../channels/channels.service';
import { CategoriesService } from '../categories/categories.service';
import { ChannelNotFoundException } from '../common/exceptions/domain.exception';
import { QueueService } from '../queue/queue.service';
import { StorageService } from '../storage/storage.service';
import { CompleteUploadDto } from './dto/complete-upload.dto';
import { InitiateUploadDto } from './dto/initiate-upload.dto';
import { SignPartDto } from './dto/sign-part.dto';
import { VideoStatus } from './entities/video-status.enum';
import { VideoVisibility } from './entities/video-visibility.enum';
import { Video } from './entities/video.entity';
import {
  VideoNotFoundException,
  VideoNotInDraftException,
  VideoOwnershipException,
} from './exceptions/video.exceptions';
import { VideosService } from './videos.service';

const CHANNEL_ID = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const VIDEO_ID = 'cccccccc-cccc-4ccc-cccc-cccccccccccc';
const PUBLIC_ID = 'ABCDEFGHIJKLMNOPQRSTU';
const STORAGE_KEY = `videos/${VIDEO_ID}/original`;

function buildVideo(overrides: Partial<Video> = {}): Video {
  return {
    id: VIDEO_ID,
    publicId: PUBLIC_ID,
    channelId: CHANNEL_ID,
    storageKey: STORAGE_KEY,
    uploadId: 'upload-123',
    status: VideoStatus.DRAFT,
    title: null,
    description: null,
    thumbnailKey: null,
    duration: null,
    failureReason: null,
    categoryId: null,
    visibility: VideoVisibility.UNLISTED,
    publishedAt: null,
    viewCount: 0,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    channel: null as any,
    category: null,
    ...overrides,
  };
}

function buildPublishedReady(overrides: Partial<Video> = {}): Video {
  return buildVideo({
    status: VideoStatus.READY,
    publishedAt: new Date('2024-06-01'),
    visibility: VideoVisibility.PUBLIC,
    ...overrides,
  });
}

describe('VideosService', () => {
  let service: VideosService;
  let videoRepository: jest.Mocked<
    Pick<Repository<Video>, 'findOne' | 'save' | 'create' | 'delete'>
  >;
  let storageService: jest.Mocked<StorageService>;
  let queueService: jest.Mocked<QueueService>;
  let channelsService: jest.Mocked<ChannelsService>;
  let categoriesService: jest.Mocked<CategoriesService>;

  beforeEach(async () => {
    videoRepository = {
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    };
    storageService = {
      createMultipartUpload: jest.fn().mockResolvedValue('upload-xyz'),
      getPresignedUploadPartUrl: jest
        .fn()
        .mockResolvedValue('https://minio/presigned'),
      completeMultipartUpload: jest.fn().mockResolvedValue(undefined),
      abortMultipartUpload: jest.fn().mockResolvedValue(undefined),
      getObjectStream: jest.fn(),
      getPresignedGetUrl: jest
        .fn()
        .mockResolvedValue('https://minio/thumbnail-url'),
      putObject: jest.fn().mockResolvedValue(undefined),
      deleteObject: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<StorageService>;
    queueService = {
      enqueueVideoProcessing: jest.fn().mockResolvedValue({}),
    } as unknown as jest.Mocked<QueueService>;
    channelsService = {
      findChannelByUserId: jest
        .fn()
        .mockResolvedValue({ id: CHANNEL_ID, user_id: USER_ID }),
    } as unknown as jest.Mocked<ChannelsService>;
    categoriesService = {
      findById: jest.fn().mockResolvedValue(null),
      findAll: jest.fn().mockResolvedValue([]),
      findBySlug: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<CategoriesService>;

    const module = await Test.createTestingModule({
      providers: [
        VideosService,
        { provide: getRepositoryToken(Video), useValue: videoRepository },
        { provide: StorageService, useValue: storageService },
        { provide: QueueService, useValue: queueService },
        { provide: ChannelsService, useValue: channelsService },
        { provide: CategoriesService, useValue: categoriesService },
      ],
    }).compile();

    service = module.get(VideosService);
  });

  describe('initiateUpload', () => {
    it('calls findChannelByUserId, creates multipart upload, saves draft and returns ids', async () => {
      const dto: InitiateUploadDto = {
        filename: 'video.mp4',
        mimeType: 'video/mp4',
        size: 1024,
      };
      videoRepository.findOne.mockResolvedValue(null);
      videoRepository.create.mockImplementation((data: any) => data as Video);
      videoRepository.save.mockImplementation(async (v) => v as Video);

      const result = await service.initiateUpload(USER_ID, dto);

      expect(channelsService.findChannelByUserId).toHaveBeenCalledWith(USER_ID);
      expect(storageService.createMultipartUpload).toHaveBeenCalledWith(
        expect.stringMatching(/^videos\/.+\/original$/),
        'video/mp4',
      );
      expect(videoRepository.save).toHaveBeenCalled();
      expect(result.videoId).toBeTruthy();
      expect(result.publicId).toHaveLength(21);
      expect(result.uploadId).toBe('upload-xyz');
      expect(result.key).toMatch(/^videos\/.+\/original$/);
    });

    it('retries publicId generation on collision', async () => {
      const dto: InitiateUploadDto = {
        filename: 'video.mp4',
        mimeType: 'video/mp4',
        size: 1024,
      };
      videoRepository.findOne
        .mockResolvedValueOnce(buildVideo())
        .mockResolvedValueOnce(null);
      videoRepository.create.mockImplementation((data: any) => data as Video);
      videoRepository.save.mockImplementation(async (v) => v as Video);

      const result = await service.initiateUpload(USER_ID, dto);

      expect(videoRepository.findOne).toHaveBeenCalledTimes(2);
      expect(result.publicId).toBeDefined();
    });

    it('throws after maxRetries publicId collisions', async () => {
      const dto: InitiateUploadDto = {
        filename: 'video.mp4',
        mimeType: 'video/mp4',
        size: 1024,
      };
      videoRepository.findOne.mockResolvedValue(buildVideo());

      await expect(service.initiateUpload(USER_ID, dto)).rejects.toThrow(
        'Could not generate a unique publicId',
      );
    });
  });

  describe('getPresignedPartUrl', () => {
    it('returns presigned URL for valid owner and draft video', async () => {
      videoRepository.findOne.mockResolvedValue(buildVideo());

      const dto: SignPartDto = { partNumber: 1 };
      const url = await service.getPresignedPartUrl(VIDEO_ID, USER_ID, dto);

      expect(url).toBe('https://minio/presigned');
      expect(storageService.getPresignedUploadPartUrl).toHaveBeenCalledWith(
        STORAGE_KEY,
        'upload-123',
        1,
      );
    });

    it('throws VideoNotFoundException when video not found', async () => {
      videoRepository.findOne.mockResolvedValue(null);

      await expect(
        service.getPresignedPartUrl(VIDEO_ID, USER_ID, { partNumber: 1 }),
      ).rejects.toBeInstanceOf(VideoNotFoundException);
    });

    it('throws VideoOwnershipException when different channel', async () => {
      videoRepository.findOne.mockResolvedValue(buildVideo());
      channelsService.findChannelByUserId.mockResolvedValue({
        id: 'other-channel',
      } as any);

      await expect(
        service.getPresignedPartUrl(VIDEO_ID, USER_ID, { partNumber: 1 }),
      ).rejects.toBeInstanceOf(VideoOwnershipException);
    });

    it('throws VideoNotInDraftException when video not in draft', async () => {
      videoRepository.findOne.mockResolvedValue(
        buildVideo({ status: VideoStatus.QUEUED }),
      );

      await expect(
        service.getPresignedPartUrl(VIDEO_ID, USER_ID, { partNumber: 1 }),
      ).rejects.toBeInstanceOf(VideoNotInDraftException);
    });

    it('throws VideoNotInDraftException when uploadId is null', async () => {
      videoRepository.findOne.mockResolvedValue(buildVideo({ uploadId: null }));

      await expect(
        service.getPresignedPartUrl(VIDEO_ID, USER_ID, { partNumber: 1 }),
      ).rejects.toBeInstanceOf(VideoNotInDraftException);
    });
  });

  describe('completeUpload', () => {
    it('calls completeMultipartUpload, transitions to QUEUED, clears uploadId, enqueues job', async () => {
      const video = buildVideo();
      videoRepository.findOne.mockResolvedValue(video);
      videoRepository.save.mockResolvedValue(video);

      const dto: CompleteUploadDto = {
        parts: [{ partNumber: 1, etag: '"abc"' }],
      };
      await service.completeUpload(VIDEO_ID, USER_ID, dto);

      expect(storageService.completeMultipartUpload).toHaveBeenCalledWith(
        STORAGE_KEY,
        'upload-123',
        [{ PartNumber: 1, ETag: '"abc"' }],
      );
      expect(videoRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: VideoStatus.QUEUED,
          uploadId: null,
        }),
      );
      expect(queueService.enqueueVideoProcessing).toHaveBeenCalledWith(
        VIDEO_ID,
      );
    });

    it('throws VideoNotFoundException when not found', async () => {
      videoRepository.findOne.mockResolvedValue(null);

      await expect(
        service.completeUpload(VIDEO_ID, USER_ID, { parts: [] }),
      ).rejects.toBeInstanceOf(VideoNotFoundException);
    });

    it('throws VideoOwnershipException when different channel', async () => {
      videoRepository.findOne.mockResolvedValue(buildVideo());
      channelsService.findChannelByUserId.mockResolvedValue({
        id: 'other',
      } as any);

      await expect(
        service.completeUpload(VIDEO_ID, USER_ID, { parts: [] }),
      ).rejects.toBeInstanceOf(VideoOwnershipException);
    });

    it('throws VideoNotInDraftException when not in draft', async () => {
      videoRepository.findOne.mockResolvedValue(
        buildVideo({ status: VideoStatus.QUEUED }),
      );

      await expect(
        service.completeUpload(VIDEO_ID, USER_ID, { parts: [] }),
      ).rejects.toBeInstanceOf(VideoNotInDraftException);
    });
  });

  describe('abortUpload', () => {
    it('calls abortMultipartUpload then deletes record', async () => {
      videoRepository.findOne.mockResolvedValue(buildVideo());
      videoRepository.delete.mockResolvedValue({ affected: 1 } as any);

      await service.abortUpload(VIDEO_ID, USER_ID);

      expect(storageService.abortMultipartUpload).toHaveBeenCalledWith(
        STORAGE_KEY,
        'upload-123',
      );
      expect(videoRepository.delete).toHaveBeenCalledWith(VIDEO_ID);
    });

    it('throws VideoOwnershipException when different channel', async () => {
      videoRepository.findOne.mockResolvedValue(buildVideo());
      channelsService.findChannelByUserId.mockResolvedValue({
        id: 'other',
      } as any);

      await expect(
        service.abortUpload(VIDEO_ID, USER_ID),
      ).rejects.toBeInstanceOf(VideoOwnershipException);
    });

    it('skips abortMultipartUpload when uploadId is null', async () => {
      videoRepository.findOne.mockResolvedValue(buildVideo({ uploadId: null }));
      videoRepository.delete.mockResolvedValue({ affected: 1 } as any);

      await service.abortUpload(VIDEO_ID, USER_ID);

      expect(storageService.abortMultipartUpload).not.toHaveBeenCalled();
      expect(videoRepository.delete).toHaveBeenCalledWith(VIDEO_ID);
    });
  });

  describe('streamVideo', () => {
    const mockRes = () => {
      const res: any = {
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        pipe: jest.fn(),
      };
      return res;
    };

    it('throws VideoNotFoundException when no READY video found', async () => {
      videoRepository.findOne.mockResolvedValue(null);
      const res = mockRes();

      await expect(
        service.streamVideo(PUBLIC_ID, undefined, res),
      ).rejects.toBeInstanceOf(VideoNotFoundException);
    });

    it('sets headers and pipes body for full stream (no Range)', async () => {
      const fakeBody = new Readable({ read() {} });
      fakeBody.push(null);
      videoRepository.findOne.mockResolvedValue(buildPublishedReady());
      storageService.getObjectStream.mockResolvedValue({
        body: fakeBody,
        contentLength: 100,
        contentType: 'video/mp4',
        acceptRanges: 'bytes',
        contentRange: undefined,
      });
      const res = mockRes();
      jest.spyOn(fakeBody, 'pipe').mockReturnValue(res);

      await service.streamVideo(PUBLIC_ID, undefined, res);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'video/mp4');
      expect(res.setHeader).toHaveBeenCalledWith('Accept-Ranges', 'bytes');
      expect(res.setHeader).toHaveBeenCalledWith('Content-Length', '100');
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('sets 206 status and Content-Range header when Range present and contentRange returned', async () => {
      const fakeBody = new Readable({ read() {} });
      fakeBody.push(null);
      videoRepository.findOne.mockResolvedValue(buildPublishedReady());
      storageService.getObjectStream.mockResolvedValue({
        body: fakeBody,
        contentLength: 100,
        contentType: 'video/mp4',
        acceptRanges: 'bytes',
        contentRange: 'bytes 0-99/200',
      });
      const res = mockRes();
      jest.spyOn(fakeBody, 'pipe').mockReturnValue(res);

      await service.streamVideo(PUBLIC_ID, 'bytes=0-99', res);

      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Range',
        'bytes 0-99/200',
      );
      expect(res.status).toHaveBeenCalledWith(206);
    });

    it('forwards Range header to storageService.getObjectStream', async () => {
      const fakeBody = new Readable({ read() {} });
      fakeBody.push(null);
      videoRepository.findOne.mockResolvedValue(buildPublishedReady());
      storageService.getObjectStream.mockResolvedValue({
        body: fakeBody,
        contentLength: 50,
        contentType: 'video/mp4',
        acceptRanges: 'bytes',
        contentRange: 'bytes 0-49/200',
      });
      const res = mockRes();
      jest.spyOn(fakeBody, 'pipe').mockReturnValue(res);

      await service.streamVideo(PUBLIC_ID, 'bytes=0-49', res);

      expect(storageService.getObjectStream).toHaveBeenCalledWith(
        STORAGE_KEY,
        'bytes=0-49',
      );
    });
  });

  describe('getVideoMetadata', () => {
    it('returns VideoResponseDto for READY video without auth', async () => {
      const video = buildPublishedReady({
        duration: 30.5,
        thumbnailKey: null,
      });
      videoRepository.findOne.mockResolvedValue(video);

      const dto = await service.getVideoMetadata(PUBLIC_ID, undefined);

      expect(dto.id).toBe(VIDEO_ID);
      expect(dto.publicId).toBe(PUBLIC_ID);
      expect(dto.status).toBe(VideoStatus.READY);
      expect(dto.channelId).toBe(CHANNEL_ID);
      expect(dto.thumbnailUrl).toBeNull();
    });

    it('throws VideoNotFoundException for unknown publicId', async () => {
      videoRepository.findOne.mockResolvedValue(null);

      await expect(
        service.getVideoMetadata('unknown-id', undefined),
      ).rejects.toBeInstanceOf(VideoNotFoundException);
    });

    it('throws VideoNotFoundException for non-READY video when userId is undefined', async () => {
      videoRepository.findOne.mockResolvedValue(
        buildVideo({ status: VideoStatus.DRAFT }),
      );

      await expect(
        service.getVideoMetadata(PUBLIC_ID, undefined),
      ).rejects.toBeInstanceOf(VideoNotFoundException);
    });

    it('throws VideoNotFoundException for non-READY video when userId belongs to different channel', async () => {
      videoRepository.findOne.mockResolvedValue(
        buildVideo({ status: VideoStatus.DRAFT }),
      );
      channelsService.findChannelByUserId.mockResolvedValue({
        id: 'other-channel',
      } as any);

      await expect(
        service.getVideoMetadata(PUBLIC_ID, 'other-user'),
      ).rejects.toBeInstanceOf(VideoNotFoundException);
    });

    it('returns DTO for non-READY video when userId is the owner', async () => {
      videoRepository.findOne.mockResolvedValue(
        buildVideo({ status: VideoStatus.DRAFT }),
      );

      const dto = await service.getVideoMetadata(PUBLIC_ID, USER_ID);

      expect(dto.status).toBe(VideoStatus.DRAFT);
      expect(dto.channelId).toBe(CHANNEL_ID);
    });

    it('returns DTO for non-READY video when userId is the owner (QUEUED)', async () => {
      videoRepository.findOne.mockResolvedValue(
        buildVideo({ status: VideoStatus.QUEUED }),
      );

      const dto = await service.getVideoMetadata(PUBLIC_ID, USER_ID);

      expect(dto.status).toBe(VideoStatus.QUEUED);
    });

    it('returns thumbnailUrl as null when thumbnailKey is null', async () => {
      videoRepository.findOne.mockResolvedValue(
        buildPublishedReady({ thumbnailKey: null }),
      );

      const dto = await service.getVideoMetadata(PUBLIC_ID, undefined);

      expect(dto.thumbnailUrl).toBeNull();
      expect(storageService.getPresignedGetUrl).not.toHaveBeenCalled();
    });

    it('returns thumbnailUrl as string when thumbnailKey is set', async () => {
      videoRepository.findOne.mockResolvedValue(
        buildPublishedReady({
          thumbnailKey: `videos/${VIDEO_ID}/thumbnail.jpg`,
        }),
      );

      const dto = await service.getVideoMetadata(PUBLIC_ID, undefined);

      expect(dto.thumbnailUrl).toBe('https://minio/thumbnail-url');
      expect(storageService.getPresignedGetUrl).toHaveBeenCalledWith(
        `videos/${VIDEO_ID}/thumbnail.jpg`,
        3600,
      );
    });

    it('throws VideoNotFoundException when ChannelNotFoundException is thrown for non-owner non-READY video', async () => {
      videoRepository.findOne.mockResolvedValue(
        buildVideo({ status: VideoStatus.DRAFT }),
      );
      channelsService.findChannelByUserId.mockRejectedValue(
        new ChannelNotFoundException(),
      );

      await expect(
        service.getVideoMetadata(PUBLIC_ID, 'no-channel-user'),
      ).rejects.toBeInstanceOf(VideoNotFoundException);
    });
  });
});
