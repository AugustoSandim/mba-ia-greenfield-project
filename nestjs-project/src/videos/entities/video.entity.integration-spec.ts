import { DataSource, Repository } from 'typeorm';
import { RefreshToken } from '../../auth/entities/refresh-token.entity';
import { VerificationToken } from '../../auth/entities/verification-token.entity';
import { Channel } from '../../channels/entities/channel.entity';
import {
  cleanAllTables,
  createTestDataSource,
} from '../../test/create-test-data-source';
import { User } from '../../users/entities/user.entity';
import { VideoStatus } from './video-status.enum';
import { Video } from './video.entity';

const ALL_ENTITIES = [User, Channel, RefreshToken, VerificationToken, Video];

describe('Video entity (integration)', () => {
  let dataSource: DataSource;
  let videoRepository: Repository<Video>;
  let userRepository: Repository<User>;
  let channelRepository: Repository<Channel>;

  beforeAll(async () => {
    dataSource = createTestDataSource(ALL_ENTITIES);
    await dataSource.initialize();
    videoRepository = dataSource.getRepository(Video);
    userRepository = dataSource.getRepository(User);
    channelRepository = dataSource.getRepository(Channel);
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  beforeEach(async () => {
    await cleanAllTables(dataSource);
  });

  async function createChannel(): Promise<Channel> {
    const user = await userRepository.save(
      userRepository.create({
        email: `owner-${Date.now()}@example.com`,
        password: 'hashed',
      }),
    );
    return channelRepository.save(
      channelRepository.create({
        name: 'Owner',
        nickname: `owner_${Date.now()}`,
        user_id: user.id,
      }),
    );
  }

  it('defaults status to draft and nullables to null', async () => {
    const channel = await createChannel();
    const saved = await videoRepository.save(
      videoRepository.create({
        publicId: 'abcdefghijk',
        channelId: channel.id,
        storageKey: `videos/temp/original`,
      }),
    );

    expect(saved.status).toBe(VideoStatus.DRAFT);
    expect(saved.title).toBeNull();
    expect(saved.description).toBeNull();
    expect(saved.uploadId).toBeNull();
    expect(saved.thumbnailKey).toBeNull();
    expect(saved.duration).toBeNull();
    expect(saved.failureReason).toBeNull();
    expect(saved.createdAt).toBeInstanceOf(Date);
    expect(saved.updatedAt).toBeInstanceOf(Date);
  });

  it('enforces unique public_id', async () => {
    const channel = await createChannel();
    await videoRepository.save(
      videoRepository.create({
        publicId: 'unique_public_id_1',
        channelId: channel.id,
      }),
    );

    await expect(
      videoRepository.save(
        videoRepository.create({
          publicId: 'unique_public_id_1',
          channelId: channel.id,
        }),
      ),
    ).rejects.toThrow();
  });

  it('rejects non-existent channel_id (FK)', async () => {
    await expect(
      videoRepository.save(
        videoRepository.create({
          publicId: 'fk_violation_id_xx',
          channelId: '00000000-0000-4000-8000-000000000000',
        }),
      ),
    ).rejects.toThrow();
  });

  it('rejects invalid VideoStatus at the database level', async () => {
    const channel = await createChannel();
    await expect(
      dataSource.query(
        `INSERT INTO videos (id, public_id, status, channel_id) VALUES (gen_random_uuid(), $1, $2, $3)`,
        ['bad_status_public_id', 'not-a-status', channel.id],
      ),
    ).rejects.toThrow();
  });
});
