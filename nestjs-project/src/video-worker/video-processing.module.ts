import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Channel } from '../channels/entities/channel.entity';
import { QUEUE_NAME } from '../queue/queue.constants';
import { StorageModule } from '../storage/storage.module';
import { User } from '../users/entities/user.entity';
import { Video } from '../videos/entities/video.entity';
import { VideoProcessingProcessor } from './video-processing.processor';

@Module({
  imports: [
    TypeOrmModule.forFeature([Video, Channel, User]),
    StorageModule,
    BullModule.registerQueue({ name: QUEUE_NAME }),
  ],
  providers: [VideoProcessingProcessor],
})
export class VideoProcessingModule {}
