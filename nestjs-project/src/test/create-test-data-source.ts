import {
  DataSource,
  EntitySchema,
  type EntityTarget,
  MigrationInterface,
} from 'typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigType } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Category } from '../categories/entities/category.entity';
import queueConfig from '../config/queue.config';
import storageConfig from '../config/storage.config';
import { Comment } from '../comments/entities/comment.entity';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { VerificationToken } from '../auth/entities/verification-token.entity';
import { Channel } from '../channels/entities/channel.entity';
import { CommentLike } from '../likes/entities/comment-like.entity';
import { VideoLike } from '../likes/entities/video-like.entity';
import { Subscription } from '../subscriptions/entities/subscription.entity';
import { User } from '../users/entities/user.entity';
import { Video } from '../videos/entities/video.entity';

export const FULL_APP_ENTITIES = [
  User,
  Channel,
  RefreshToken,
  VerificationToken,
  Category,
  Video,
  Comment,
  VideoLike,
  CommentLike,
  Subscription,
];

export function createSocialModuleSpecImports() {
  return [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [queueConfig, storageConfig],
    }),
    TypeOrmModule.forRoot(createTestDataSource(FULL_APP_ENTITIES).options),
    BullModule.forRootAsync({
      inject: [queueConfig.KEY],
      useFactory: (cfg: ConfigType<typeof queueConfig>) => ({
        connection: { host: cfg.host, port: cfg.port },
      }),
    }),
  ];
}

interface TestDataSourceOptions {
  synchronize?: boolean;
  migrations?: (new () => MigrationInterface)[];
}

export function createTestDataSource(
  entities: (EntityTarget<object> | EntitySchema)[],
  options: TestDataSourceOptions = {},
): DataSource {
  const { synchronize = true, migrations } = options;
  return new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST ?? 'db',
    port: Number(process.env.DB_PORT ?? 5432),
    username: process.env.DB_USERNAME ?? 'streamtube',
    password: process.env.DB_PASSWORD ?? 'streamtube',
    database: process.env.DB_DATABASE ?? 'streamtube',
    entities,
    synchronize,
    ...(migrations !== undefined && { migrations, migrationsRun: false }),
  });
}

export async function cleanAllTables(dataSource: DataSource): Promise<void> {
  await dataSource.query(`
    DO $do$ BEGIN
      IF to_regclass('public.comment_likes') IS NOT NULL THEN
        DELETE FROM "comment_likes";
      END IF;
      IF to_regclass('public.video_likes') IS NOT NULL THEN
        DELETE FROM "video_likes";
      END IF;
      IF to_regclass('public.subscriptions') IS NOT NULL THEN
        DELETE FROM "subscriptions";
      END IF;
      IF to_regclass('public.comments') IS NOT NULL THEN
        DELETE FROM "comments";
      END IF;
      IF to_regclass('public.videos') IS NOT NULL THEN
        DELETE FROM "videos";
      END IF;
    END $do$;
  `);
  await dataSource.query('DELETE FROM "refresh_tokens"');
  await dataSource.query('DELETE FROM "verification_tokens"');
  await dataSource.query('DELETE FROM "channels"');
  await dataSource.query('DELETE FROM "users"');
}
