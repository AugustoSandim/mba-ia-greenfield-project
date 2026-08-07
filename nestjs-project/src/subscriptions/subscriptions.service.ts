import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Subscription } from './entities/subscription.entity';

@Injectable()
export class SubscriptionsService {
  constructor(
    @InjectRepository(Subscription)
    private readonly subscriptionRepository: Repository<Subscription>,
  ) {}

  async subscribe(subscriberId: string, channelId: string): Promise<void> {
    const existing = await this.subscriptionRepository.findOne({
      where: { subscriberId, channelId },
    });
    if (existing) {
      return;
    }
    await this.subscriptionRepository.save(
      this.subscriptionRepository.create({ subscriberId, channelId }),
    );
  }

  async unsubscribe(subscriberId: string, channelId: string): Promise<void> {
    await this.subscriptionRepository.delete({ subscriberId, channelId });
  }

  async isSubscribed(
    subscriberId: string,
    channelId: string,
  ): Promise<boolean> {
    const count = await this.subscriptionRepository.count({
      where: { subscriberId, channelId },
    });
    return count > 0;
  }
}
