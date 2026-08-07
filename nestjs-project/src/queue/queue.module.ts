import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAME } from './queue.constants';
import { QueueService } from './queue.service';

@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_NAME })],
  providers: [QueueService],
  exports: [QueueService, BullModule],
})
export class QueueModule {}
