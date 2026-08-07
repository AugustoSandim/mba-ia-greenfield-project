import { DataSource } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { Channel } from '../channels/entities/channel.entity';
import { Category } from '../categories/entities/category.entity';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { VerificationToken } from '../auth/entities/verification-token.entity';
import { Video } from '../videos/entities/video.entity';
import { CreateUsersAndChannels1775687773260 } from './migrations/1775687773260-CreateUsersAndChannels';
import { CreateAuthTokens1777579850478 } from './migrations/1777579850478-CreateAuthTokens';
import { CreateVideos1786144143518 } from './migrations/1786144143518-CreateVideos';
import { Phase04CategoriesAndPublishing1786145000000 } from './migrations/1786145000000-Phase04CategoriesAndPublishing';
import { Phase06Social1786145100000 } from './migrations/1786145100000-Phase06Social';
import { createTestDataSource } from '../test/create-test-data-source';

const MANAGED_TABLES = [
  'comment_likes',
  'video_likes',
  'subscriptions',
  'comments',
  'videos',
  'categories',
  'refresh_tokens',
  'verification_tokens',
  'channels',
  'users',
];

const MANAGED_TYPES = [
  'verification_tokens_type_enum',
  'video_status_enum',
  'video_visibility_enum',
];

describe('Database migrations (integration)', () => {
  let dataSource: DataSource;

  async function dropManagedSchema(): Promise<void> {
    for (const table of MANAGED_TABLES) {
      await dataSource.query(`DROP TABLE IF EXISTS "${table}" CASCADE`);
    }
    await dataSource.query(`DROP TABLE IF EXISTS "migrations" CASCADE`);
    for (const type of MANAGED_TYPES) {
      await dataSource.query(`DROP TYPE IF EXISTS "${type}" CASCADE`);
    }
  }

  beforeAll(async () => {
    dataSource = createTestDataSource(
      [User, Channel, Category, RefreshToken, VerificationToken, Video],
      {
        synchronize: false,
        migrations: [
          CreateUsersAndChannels1775687773260,
          CreateAuthTokens1777579850478,
          CreateVideos1786144143518,
          Phase04CategoriesAndPublishing1786145000000,
          Phase06Social1786145100000,
        ],
      },
    );

    await dataSource.initialize();
    await dropManagedSchema();
  });

  afterAll(async () => {
    try {
      await dropManagedSchema();
      await dataSource.runMigrations();
    } finally {
      await dataSource.destroy();
    }
  });

  it('should apply all migrations and create all managed tables', async () => {
    const ranMigrations = await dataSource.runMigrations();

    expect(ranMigrations).toHaveLength(5);

    const result = await dataSource.query<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name = ANY($1::text[])
       ORDER BY table_name`,
      [MANAGED_TABLES],
    );
    const tableNames = result.map((r) => r.table_name);
    expect(tableNames).toEqual([
      'categories',
      'channels',
      'comment_likes',
      'comments',
      'refresh_tokens',
      'subscriptions',
      'users',
      'verification_tokens',
      'video_likes',
      'videos',
    ]);
  });

  it('should revert the last migration and remove social tables', async () => {
    await dataSource.undoLastMigration();

    const result = await dataSource.query<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name = ANY($1::text[])`,
      [['comments', 'video_likes', 'comment_likes', 'subscriptions']],
    );
    expect(result).toHaveLength(0);
  });
});
