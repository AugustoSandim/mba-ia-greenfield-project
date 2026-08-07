import { Test } from '@nestjs/testing';
import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { ConfigModule, ConfigType } from '@nestjs/config';
import { Queue } from 'bullmq';
import queueConfig from '../config/queue.config';
import { JOB_NAME_PROCESS_VIDEO, QUEUE_NAME } from './queue.constants';
import { QueueModule } from './queue.module';
import { QueueService } from './queue.service';
import { VideoProcessingJobPayload } from './queue.types';

describe('QueueService (integration)', () => {
  let queueService: QueueService;
  let queue: Queue<VideoProcessingJobPayload>;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [queueConfig] }),
        BullModule.forRootAsync({
          inject: [queueConfig.KEY],
          useFactory: (cfg: ConfigType<typeof queueConfig>) => ({
            connection: { host: cfg.host, port: cfg.port },
          }),
        }),
        QueueModule,
      ],
    }).compile();

    queueService = module.get(QueueService);
    queue = module.get(getQueueToken(QUEUE_NAME));
    await queue.obliterate({ force: true });
  }, 30000);

  afterAll(async () => {
    await queue.obliterate({ force: true });
    await queue.close();
  });

  beforeEach(async () => {
    await queue.obliterate({ force: true });
  });

  it('enqueueVideoProcessing adds a waiting process-video job with retry policy', async () => {
    const videoId = '11111111-1111-4111-8111-111111111111';
    // Pause so the video-worker Compose service cannot race-consume the job.
    await queue.pause();
    try {
      const job = await queueService.enqueueVideoProcessing(videoId);

      expect(job.name).toBe(JOB_NAME_PROCESS_VIDEO);
      expect(job.data.videoId).toBe(videoId);
      expect(job.opts.attempts).toBe(3);
      expect(job.opts.backoff).toEqual({
        type: 'exponential',
        delay: 5000,
      });
      expect(job.opts.removeOnComplete).toBe(true);
      expect(job.opts.removeOnFail).toBe(false);

      const waiting = await queue.getJobs(['waiting']);
      expect(waiting).toHaveLength(1);
      expect(waiting[0].id).toBe(job.id);
    } finally {
      await queue.resume();
    }
  });
});
