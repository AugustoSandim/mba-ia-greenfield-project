import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { Channel } from './entities/channel.entity';
import { ChannelsController } from './channels.controller';
import { ChannelsService } from './channels.service';

@Module({
  imports: [TypeOrmModule.forFeature([Channel]), SubscriptionsModule],
  controllers: [ChannelsController],
  providers: [ChannelsService],
  exports: [TypeOrmModule, ChannelsService],
})
export class ChannelsModule {}
