import {
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { Channel } from '../../channels/entities/channel.entity';
import { User } from '../../users/entities/user.entity';

@Entity('subscriptions')
export class Subscription {
  @PrimaryColumn({ name: 'subscriber_id', type: 'uuid' })
  subscriberId: string;

  @PrimaryColumn({ name: 'channel_id', type: 'uuid' })
  channelId: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'subscriber_id' })
  subscriber: User;

  @ManyToOne(() => Channel, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'channel_id' })
  channel: Channel;
}
