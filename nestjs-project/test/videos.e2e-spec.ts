import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { randomUUID } from 'crypto';
import { DataSource, Repository } from 'typeorm';
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/require-await, @typescript-eslint/no-unsafe-argument */
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { DomainExceptionFilter } from '../src/common/filters/domain-exception.filter';
import { ValidationExceptionFilter } from '../src/common/filters/validation-exception.filter';
import { StorageService } from '../src/storage/storage.service';
import { VideoStatus } from '../src/videos/entities/video-status.enum';
import { Video } from '../src/videos/entities/video.entity';
import { cleanAllTables } from '../src/test/create-test-data-source';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';

/** Register → confirm → login, return access token */
async function registerConfirmAndLogin(
  app: INestApplication,
  email: string,
  password = 'password123',
): Promise<{ access_token: string }> {
  const authService = app.get(AuthService);
  const mailService = (authService as any).mailService;
  let token = '';
  jest
    .spyOn(mailService, 'sendConfirmationEmail')
    .mockImplementationOnce(async (_e: string, _n: string, t: string) => {
      token = t;
    });
  await request(app.getHttpServer())
    .post('/auth/register')
    .send({ email, password });
  await request(app.getHttpServer())
    .get('/auth/confirm-email')
    .query({ token });
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email, password });
  return { access_token: res.body.access_token };
}

/** Creates a ready video by:
 *  1. Storing a small fake blob in MinIO
 *  2. Inserting a Video row with status=READY pointing to that blob
 */
async function createReadyVideo(
  dataSource: DataSource,
  storage: StorageService,
  channelId: string,
): Promise<Video> {
  const videoRepo = dataSource.getRepository(Video);
  const id = randomUUID();
  const publicId = `READY${id.replace(/-/g, '').slice(0, 16)}`;
  const storageKey = `videos/${id}/original`;

  // 2 KB is enough – no real ffmpeg here; we just need the bytes to stream
  const fakeContent = Buffer.alloc(2048, 0x41); // 'A' * 2048
  await storage.putObject(
    storageKey,
    fakeContent,
    'video/mp4',
    fakeContent.length,
  );

  const video = videoRepo.create({
    id,
    publicId,
    channelId,
    storageKey,
    uploadId: null,
    status: VideoStatus.READY,
    duration: 10,
    thumbnailKey: null,
    title: null,
    description: null,
    failureReason: null,
  });
  return videoRepo.save(video);
}

describe('Videos (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let storage: StorageService;
  let videoRepo: Repository<Video>;
  let throttlerStorage: ThrottlerStorageService;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(
      new DomainExceptionFilter(),
      new ValidationExceptionFilter(),
    );
    await app.init();

    dataSource = moduleFixture.get(DataSource);
    storage = moduleFixture.get(StorageService);
    videoRepo = dataSource.getRepository(Video);
    throttlerStorage =
      moduleFixture.get<ThrottlerStorageService>(ThrottlerStorage);
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTables(dataSource);
    throttlerStorage.storage.clear();
  });

  // ─── Helper to create a fully registered channel owner ───────────────────
  async function createOwner(
    suffix: string,
  ): Promise<{ access_token: string; channelId: string }> {
    const { access_token } = await registerConfirmAndLogin(
      app,
      `video-owner-${suffix}@example.com`,
    );
    // Resolve channelId from the token claims via /auth/me
    const me = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${access_token}`);
    const userId: string = me.body.sub;
    const ch = await dataSource
      .getRepository('channels')
      .findOne({ where: { user_id: userId } } as any);
    if (!ch) {
      throw new Error(`No channel found for user ${userId}`);
    }
    return { access_token, channelId: (ch as any).id };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SI-03.5 — Upload API
  // ─────────────────────────────────────────────────────────────────────────

  describe('POST /videos/uploads', () => {
    it('returns 201 with videoId/publicId/uploadId/key for valid authenticated request', async () => {
      const { access_token } = await createOwner('initiate');

      const res = await request(app.getHttpServer())
        .post('/videos/uploads')
        .set('Authorization', `Bearer ${access_token}`)
        .send({ filename: 'video.mp4', mimeType: 'video/mp4', size: 1024 })
        .expect(201);

      expect(res.body.videoId).toBeTruthy();
      expect(res.body.publicId).toHaveLength(21);
      expect(res.body.uploadId).toBeTruthy();
      expect(res.body.key).toMatch(/^videos\/.+\/original$/);

      // Cleanup
      await storage
        .abortMultipartUpload(res.body.key, res.body.uploadId)
        .catch(() => undefined);
    }, 30000);

    it('returns 401 without JWT', async () => {
      await request(app.getHttpServer())
        .post('/videos/uploads')
        .send({ filename: 'video.mp4', mimeType: 'video/mp4', size: 1024 })
        .expect(401);
    });

    it('returns 400 with VALIDATION_ERROR when size > 10 GB', async () => {
      const { access_token } = await createOwner('size-limit');

      const res = await request(app.getHttpServer())
        .post('/videos/uploads')
        .set('Authorization', `Bearer ${access_token}`)
        .send({
          filename: 'video.mp4',
          mimeType: 'video/mp4',
          size: 10_737_418_241,
        })
        .expect(400);

      expect(res.body.error).toBe('VALIDATION_ERROR');
    }, 15000);

    it('returns 400 with VALIDATION_ERROR for unsupported mimeType', async () => {
      const { access_token } = await createOwner('mime-type');

      const res = await request(app.getHttpServer())
        .post('/videos/uploads')
        .set('Authorization', `Bearer ${access_token}`)
        .send({ filename: 'file.txt', mimeType: 'text/plain', size: 1024 })
        .expect(400);

      expect(res.body.error).toBe('VALIDATION_ERROR');
    }, 15000);
  });

  describe('POST /videos/uploads/:videoId/parts', () => {
    it('returns 200 with presignedUrl for owner', async () => {
      const { access_token } = await createOwner('sign-part');

      const initRes = await request(app.getHttpServer())
        .post('/videos/uploads')
        .set('Authorization', `Bearer ${access_token}`)
        .send({ filename: 'v.mp4', mimeType: 'video/mp4', size: 1024 })
        .expect(201);

      const { videoId, key, uploadId } = initRes.body;

      const res = await request(app.getHttpServer())
        .post(`/videos/uploads/${videoId}/parts`)
        .set('Authorization', `Bearer ${access_token}`)
        .send({ partNumber: 1 })
        .expect(200);

      expect(res.body.presignedUrl).toMatch(/http/);

      await storage.abortMultipartUpload(key, uploadId).catch(() => undefined);
    }, 30000);

    it('returns 403 with non-owner JWT', async () => {
      const owner = await createOwner('sign-non-owner');
      const other = await createOwner('sign-other');

      const initRes = await request(app.getHttpServer())
        .post('/videos/uploads')
        .set('Authorization', `Bearer ${owner.access_token}`)
        .send({ filename: 'v.mp4', mimeType: 'video/mp4', size: 1024 })
        .expect(201);

      const { videoId, key, uploadId } = initRes.body;

      const res = await request(app.getHttpServer())
        .post(`/videos/uploads/${videoId}/parts`)
        .set('Authorization', `Bearer ${other.access_token}`)
        .send({ partNumber: 1 })
        .expect(403);

      expect(res.body.error).toBe('VIDEO_OWNERSHIP_REQUIRED');

      await storage.abortMultipartUpload(key, uploadId).catch(() => undefined);
    }, 30000);

    it('returns 404 for unknown videoId', async () => {
      const { access_token } = await createOwner('sign-404');

      const res = await request(app.getHttpServer())
        .post(`/videos/uploads/${randomUUID()}/parts`)
        .set('Authorization', `Bearer ${access_token}`)
        .send({ partNumber: 1 })
        .expect(404);

      expect(res.body.error).toBe('VIDEO_NOT_FOUND');
    }, 15000);
  });

  describe('POST /videos/uploads/:videoId/complete', () => {
    it('returns 200 with { videoId, status: queued } and transitions status', async () => {
      const { access_token } = await createOwner('complete');

      const initRes = await request(app.getHttpServer())
        .post('/videos/uploads')
        .set('Authorization', `Bearer ${access_token}`)
        .send({ filename: 'v.mp4', mimeType: 'video/mp4', size: 1024 })
        .expect(201);

      const { videoId, key, uploadId } = initRes.body;

      // Upload a real part (5 MB minimum for multipart)
      const partUrl = await storage.getPresignedUploadPartUrl(key, uploadId, 1);
      const body = Buffer.alloc(5 * 1024 * 1024, 0x20);
      const putRes = await fetch(partUrl, {
        method: 'PUT',
        body,
        headers: { 'Content-Length': String(body.length) },
      });
      const etag = putRes.headers.get('etag')!;

      const res = await request(app.getHttpServer())
        .post(`/videos/uploads/${videoId}/complete`)
        .set('Authorization', `Bearer ${access_token}`)
        .send({ parts: [{ partNumber: 1, etag }] })
        .expect(200);

      expect(res.body.videoId).toBe(videoId);
      expect(res.body.status).toBe('queued');

      const video = await videoRepo.findOne({ where: { id: videoId } });
      expect(video!.status).toBe(VideoStatus.QUEUED);
      expect(video!.uploadId).toBeNull();

      await storage.deleteObject(key).catch(() => undefined);
    }, 30000);
  });

  describe('DELETE /videos/uploads/:videoId', () => {
    it('returns 204 and removes the video record', async () => {
      const { access_token } = await createOwner('abort');

      const initRes = await request(app.getHttpServer())
        .post('/videos/uploads')
        .set('Authorization', `Bearer ${access_token}`)
        .send({ filename: 'v.mp4', mimeType: 'video/mp4', size: 1024 })
        .expect(201);

      const { videoId, key, uploadId } = initRes.body;

      await request(app.getHttpServer())
        .delete(`/videos/uploads/${videoId}`)
        .set('Authorization', `Bearer ${access_token}`)
        .expect(204);

      const video = await videoRepo.findOne({ where: { id: videoId } });
      expect(video).toBeNull();

      await storage.abortMultipartUpload(key, uploadId).catch(() => undefined);
    }, 30000);

    it('returns 401 without JWT', async () => {
      await request(app.getHttpServer())
        .delete(`/videos/uploads/${randomUUID()}`)
        .expect(401);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // SI-03.7 — Stream / Download
  // ─────────────────────────────────────────────────────────────────────────

  describe('GET /videos/:publicId/stream', () => {
    it('returns 200 with correct Content-Type for a ready video (no Range)', async () => {
      const { channelId } = await createOwner('stream-200');
      const video = await createReadyVideo(dataSource, storage, channelId);

      const res = await request(app.getHttpServer())
        .get(`/videos/${video.publicId}/stream`)
        .expect(200);

      expect(res.headers['content-type']).toMatch(/video\/mp4/);
      expect(res.headers['accept-ranges']).toBe('bytes');

      await storage.deleteObject(video.storageKey!).catch(() => undefined);
    }, 30000);

    it('returns 206 with Content-Range for Range: bytes=0-1023', async () => {
      const { channelId } = await createOwner('stream-206');
      const video = await createReadyVideo(dataSource, storage, channelId);

      const res = await request(app.getHttpServer())
        .get(`/videos/${video.publicId}/stream`)
        .set('Range', 'bytes=0-1023')
        .expect(206);

      expect(res.headers['content-range']).toMatch(/^bytes 0-1023\//);
      expect(Number(res.headers['content-length'])).toBe(1024);

      await storage.deleteObject(video.storageKey!).catch(() => undefined);
    }, 30000);

    it('returns 404 for unknown publicId', async () => {
      const res = await request(app.getHttpServer())
        .get('/videos/UNKNOWNPUBLICID000001/stream')
        .expect(404);

      expect(res.body.error).toBe('VIDEO_NOT_FOUND');
    });

    it('returns 404 for non-ready video (draft)', async () => {
      const { channelId } = await createOwner('stream-draft');
      const video = await videoRepo.save(
        videoRepo.create({
          id: randomUUID(),
          publicId: `DRAFT${randomUUID().replace(/-/g, '').slice(0, 16)}`,
          channelId,
          storageKey: null,
          uploadId: null,
          status: VideoStatus.DRAFT,
        }),
      );

      const res = await request(app.getHttpServer())
        .get(`/videos/${video.publicId}/stream`)
        .expect(404);

      expect(res.body.error).toBe('VIDEO_NOT_FOUND');
    }, 15000);
  });

  describe('GET /videos/:publicId/download', () => {
    it('returns 200 with Content-Disposition attachment and correct content-type', async () => {
      const { channelId } = await createOwner('download-200');
      const video = await createReadyVideo(dataSource, storage, channelId);

      const res = await request(app.getHttpServer())
        .get(`/videos/${video.publicId}/download`)
        .expect(200);

      expect(res.headers['content-disposition']).toContain('attachment');
      expect(res.headers['content-disposition']).toContain(video.publicId);
      expect(res.headers['content-type']).toMatch(/video\/mp4/);

      await storage.deleteObject(video.storageKey!).catch(() => undefined);
    }, 30000);

    it('returns 404 for non-ready video', async () => {
      const res = await request(app.getHttpServer())
        .get('/videos/UNKNOWNPUBLICID000002/download')
        .expect(404);

      expect(res.body.error).toBe('VIDEO_NOT_FOUND');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // SI-03.8 — Metadata endpoint
  // ─────────────────────────────────────────────────────────────────────────

  describe('GET /videos/:publicId', () => {
    it('returns 200 for READY video without auth', async () => {
      const { channelId } = await createOwner('meta-ready-anon');
      const video = await createReadyVideo(dataSource, storage, channelId);

      const res = await request(app.getHttpServer())
        .get(`/videos/${video.publicId}`)
        .expect(200);

      expect(res.body.id).toBe(video.id);
      expect(res.body.publicId).toBe(video.publicId);
      expect(res.body.status).toBe('ready');
      expect(res.body.channelId).toBe(channelId);
      expect(res.body.createdAt).toBeDefined();
      expect(res.body.updatedAt).toBeDefined();

      await storage.deleteObject(video.storageKey!).catch(() => undefined);
    }, 30000);

    it('returns 200 for READY video with non-owner JWT', async () => {
      const { channelId } = await createOwner('meta-ready-owner');
      const { access_token: otherToken } =
        await createOwner('meta-ready-other');
      const video = await createReadyVideo(dataSource, storage, channelId);

      await request(app.getHttpServer())
        .get(`/videos/${video.publicId}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(200);

      await storage.deleteObject(video.storageKey!).catch(() => undefined);
    }, 30000);

    it('returns 200 for DRAFT video with owner JWT', async () => {
      const { access_token, channelId } = await createOwner('meta-draft-owner');
      const video = await videoRepo.save(
        videoRepo.create({
          id: randomUUID(),
          publicId: `DRAFTMETA${randomUUID().replace(/-/g, '').slice(0, 12)}`,
          channelId,
          storageKey: null,
          uploadId: null,
          status: VideoStatus.DRAFT,
        }),
      );

      const res = await request(app.getHttpServer())
        .get(`/videos/${video.publicId}`)
        .set('Authorization', `Bearer ${access_token}`)
        .expect(200);

      expect(res.body.status).toBe('draft');
    }, 15000);

    it('returns 404 for DRAFT video without auth', async () => {
      const { channelId } = await createOwner('meta-draft-anon');
      const video = await videoRepo.save(
        videoRepo.create({
          id: randomUUID(),
          publicId: `DRAFTANON${randomUUID().replace(/-/g, '').slice(0, 12)}`,
          channelId,
          storageKey: null,
          uploadId: null,
          status: VideoStatus.DRAFT,
        }),
      );

      const res = await request(app.getHttpServer())
        .get(`/videos/${video.publicId}`)
        .expect(404);

      expect(res.body.error).toBe('VIDEO_NOT_FOUND');
    }, 15000);

    it('returns 404 for QUEUED video with non-owner JWT', async () => {
      const { channelId } = await createOwner('meta-queued-owner');
      const { access_token: otherToken } =
        await createOwner('meta-queued-other');
      const video = await videoRepo.save(
        videoRepo.create({
          id: randomUUID(),
          publicId: `QUEUEDMETA${randomUUID().replace(/-/g, '').slice(0, 11)}`,
          channelId,
          storageKey: null,
          uploadId: null,
          status: VideoStatus.QUEUED,
        }),
      );

      const res = await request(app.getHttpServer())
        .get(`/videos/${video.publicId}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(404);

      expect(res.body.error).toBe('VIDEO_NOT_FOUND');
    }, 15000);

    it('returns 404 for unknown publicId', async () => {
      const res = await request(app.getHttpServer())
        .get('/videos/UNKNOWNPUBLICID000003')
        .expect(404);

      expect(res.body.error).toBe('VIDEO_NOT_FOUND');
    });

    it('response body contains required fields', async () => {
      const { channelId } = await createOwner('meta-fields');
      const video = await createReadyVideo(dataSource, storage, channelId);

      const res = await request(app.getHttpServer())
        .get(`/videos/${video.publicId}`)
        .expect(200);

      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('publicId');
      expect(res.body).toHaveProperty('status');
      expect(res.body).toHaveProperty('channelId');
      expect(res.body).toHaveProperty('createdAt');
      expect(res.body).toHaveProperty('updatedAt');
      expect(res.body).toHaveProperty('thumbnailUrl');
      expect(res.body).toHaveProperty('duration');

      await storage.deleteObject(video.storageKey!).catch(() => undefined);
    }, 30000);
  });
});
