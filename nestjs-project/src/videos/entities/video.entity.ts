import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Channel } from '../../channels/entities/channel.entity';
import { Category } from '../../categories/entities/category.entity';
import { VideoStatus } from './video-status.enum';
import { VideoVisibility } from './video-visibility.enum';

@Entity('videos')
export class Video {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'public_id', type: 'varchar', length: 21, unique: true })
  publicId: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  title: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({
    type: 'enum',
    enum: VideoStatus,
    enumName: 'video_status_enum',
    default: VideoStatus.DRAFT,
  })
  status: VideoStatus;

  @Column({ name: 'channel_id', type: 'uuid' })
  channelId: string;

  @Column({ name: 'upload_id', type: 'varchar', nullable: true })
  uploadId: string | null;

  @Column({ name: 'storage_key', type: 'varchar', nullable: true })
  storageKey: string | null;

  @Column({ name: 'thumbnail_key', type: 'varchar', nullable: true })
  thumbnailKey: string | null;

  @Column({ type: 'float', nullable: true })
  duration: number | null;

  @Column({ name: 'failure_reason', type: 'text', nullable: true })
  failureReason: string | null;

  @Column({ name: 'category_id', type: 'uuid', nullable: true })
  categoryId: string | null;

  @Column({
    type: 'enum',
    enum: VideoVisibility,
    enumName: 'video_visibility_enum',
    default: VideoVisibility.UNLISTED,
  })
  visibility: VideoVisibility;

  @Column({ name: 'published_at', type: 'timestamp', nullable: true })
  publishedAt: Date | null;

  @Column({ name: 'view_count', type: 'int', default: 0 })
  viewCount: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Channel, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'channel_id' })
  channel: Channel;

  @ManyToOne(() => Category, { onDelete: 'SET NULL', eager: false })
  @JoinColumn({ name: 'category_id' })
  category: Category | null;
}
