import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Readable } from 'stream';
import { Repository } from 'typeorm';
import { StorageService } from '../storage/storage.service';
import { VideoStatus } from '../videos/entities/video-status.enum';
import { Video } from '../videos/entities/video.entity';
import { VideoProcessingJobPayload } from '../queue/queue.types';
import { VideoProcessingProcessor } from './video-processing.processor';

jest.mock('fluent-ffmpeg', () => {
  const ffprobe = jest.fn(
    (_path: string, cb: (err: Error | null, data?: any) => void) => {
      cb(null, { format: { duration: 10 } });
    },
  );
  const ffmpegFn = jest.fn((filePath: string) => {
    const api: Record<string, unknown> = {
      on: jest.fn(function (event: string, handler: (err?: Error) => void) {
        if (event === 'end') {
          setImmediate(() => {
            const thumb = path.join(path.dirname(filePath), 'thumbnail.jpg');
            fs.writeFileSync(thumb, Buffer.from('jpg'));
            handler();
          });
        }
        return api;
      }),
      screenshots: jest.fn(function () {
        return api;
      }),
    };
    return api;
  });
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  (ffmpegFn as any).ffprobe = ffprobe;
  return { __esModule: true, default: ffmpegFn };
});

describe('VideoProcessingProcessor', () => {
  let processor: VideoProcessingProcessor;
  let videoRepository: jest.Mocked<
    Pick<Repository<Video>, 'findOne' | 'update'>
  >;
  let storageService: jest.Mocked<
    Pick<StorageService, 'getObjectStream' | 'putObject'>
  >;

  beforeEach(async () => {
    videoRepository = {
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    storageService = {
      getObjectStream: jest.fn().mockResolvedValue({
        body: Readable.from([Buffer.from('fake-video')]),
      }),
      putObject: jest.fn().mockResolvedValue(undefined),
    };

    const module = await Test.createTestingModule({
      providers: [
        VideoProcessingProcessor,
        { provide: getRepositoryToken(Video), useValue: videoRepository },
        { provide: StorageService, useValue: storageService },
      ],
    }).compile();

    processor = module.get(VideoProcessingProcessor);
  });

  afterEach(async () => {
    const streamtubeTmp = path.join(os.tmpdir(), 'streamtube');
    await fs.promises.rm(streamtubeTmp, { recursive: true, force: true });
  });

  it('marks video READY with duration and thumbnailKey', async () => {
    videoRepository.findOne.mockResolvedValue({
      id: 'v1',
      storageKey: 'videos/v1/original',
    } as Video);

    await processor.process({
      data: { videoId: 'v1' },
    } as Job<VideoProcessingJobPayload>);

    expect(videoRepository.update).toHaveBeenCalledWith('v1', {
      status: VideoStatus.PROCESSING,
    });
    expect(videoRepository.update).toHaveBeenCalledWith('v1', {
      status: VideoStatus.READY,
      duration: 10,
      thumbnailKey: 'videos/v1/thumbnail.jpg',
      failureReason: null,
    });
    expect(storageService.putObject).toHaveBeenCalledWith(
      'videos/v1/thumbnail.jpg',
      expect.any(Buffer),
      'image/jpeg',
      3,
    );
  });

  it('onFailed marks FAILED on last attempt', () => {
    processor.onFailed(
      {
        data: { videoId: 'v1' },
        attemptsMade: 3,
        opts: { attempts: 3 },
      } as Job<VideoProcessingJobPayload>,
      new Error('boom'),
    );
    expect(videoRepository.update).toHaveBeenCalledWith('v1', {
      status: VideoStatus.FAILED,
      failureReason: 'boom',
    });
  });
});
