import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { JOB_NAME_PROCESS_VIDEO, QUEUE_NAME } from './queue.constants';
import { VideoProcessingJobPayload } from './queue.types';

@Injectable()
export class QueueService {
  constructor(
    @InjectQueue(QUEUE_NAME)
    private readonly queue: Queue<VideoProcessingJobPayload>,
  ) {}

  enqueueVideoProcessing(
    videoId: string,
  ): Promise<Job<VideoProcessingJobPayload>> {
    return this.queue.add(
      JOB_NAME_PROCESS_VIDEO,
      { videoId },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
  }
}
