import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Video } from '../../videos/entities/video.entity';

@Entity('video_likes')
export class VideoLike {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId: string;

  @PrimaryColumn({ name: 'video_id', type: 'uuid' })
  videoId: string;

  @Column({ type: 'smallint' })
  value: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Video, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'video_id' })
  video: Video;
}
