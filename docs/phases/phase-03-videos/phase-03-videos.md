---
kind: phase
name: phase-03-videos
sources_mtime:
  docs/project-plan.md: "2026-08-07T18:28:32.078870-04:00"
  docs/decisions/technical-decisions-phase-03-videos.md: "2026-08-07T18:49:18.274595-04:00"
  docs/phases/phase-01-configuracao-base/context.md: "2026-08-07T18:28:32.076884-04:00"
  docs/phases/phase-02-auth/context.md: "2026-08-07T18:28:32.078445-04:00"
  .claude/skills/testing-guide-nestjs-project/SKILL.md: "2026-08-07T18:28:32.020560-04:00"
---

# Phase 03 — Upload e Processamento de Vídeos

## Objective

Deliver the complete video upload, processing, and delivery lifecycle — multipart presigned uploads directly to MinIO (up to 10 GB without API memory impact), automatic background processing via a dedicated NestJS worker (FFmpeg metadata extraction and thumbnail generation), unique public video identifiers, and streaming/download endpoints with HTTP Range/206 support — establishing the media infrastructure consumed by all subsequent phases.

---

## Step Implementations

### SI-03.1 — Dependencies, Configuration Namespaces, Docker Compose, and Worker Dockerfile

**Description:** Install all Phase 03 production dependencies, create `storage` and `queue` config namespaces following the `registerAs` pattern from Phase 01, extend the Joi validation schema, add `minio`, `minio-init`, and `redis` services to Docker Compose, and create `Dockerfile.worker` with system FFmpeg installed. Add the `video-worker` service to Compose.

**Technical actions:**

- Install production dependencies in nestjs-project: `@nestjs/bullmq@^11.x`, `bullmq@^5.x`, `@aws-sdk/client-s3@^3.x`, `@aws-sdk/s3-request-presigner@^3.x`, `nanoid@^5.x`, `fluent-ffmpeg@^2.x`
- Install dev dependency: `@types/fluent-ffmpeg@^2.x`
- Create `src/config/storage.config.ts` — `registerAs('storage', ...)` reading: `STORAGE_ENDPOINT` (string, required — Docker Compose service name, e.g. `minio`), `STORAGE_PORT` (number, default `9000`), `STORAGE_ACCESS_KEY` (string, required), `STORAGE_SECRET_KEY` (string, required), `STORAGE_BUCKET` (string, default `'streamtube'`), `STORAGE_REGION` (string, default `'us-east-1'`), `STORAGE_USE_PATH_STYLE` (boolean, default `true` — required for MinIO path-style endpoint)
- Create `src/config/queue.config.ts` — `registerAs('queue', ...)` reading: `REDIS_HOST` (string, default `'redis'` — Docker Compose service name), `REDIS_PORT` (number, default `6379`)
- Update `src/config/env.validation.ts` — add all new environment variables to the Joi schema: `STORAGE_ENDPOINT` (string, required), `STORAGE_ACCESS_KEY` (string, required), `STORAGE_SECRET_KEY` (string, required), all others optional with defaults. Update `.env.example` with all new variables and Docker Compose-compatible defaults (host names matching Compose service names)
- Add `redis` service to `nestjs-project/compose.yaml` — image `redis:7-alpine`, port `6379:6379` (host-mapped for local dev), healthcheck with `redis-cli ping`, volume for persistence; `nestjs-api` and `video-worker` depend on it
- Add `minio` service to `nestjs-project/compose.yaml` — image `minio/minio`, command `server /data --console-address ":9001"`, environment `MINIO_ROOT_USER` and `MINIO_ROOT_PASSWORD`, ports `9000:9000` (S3 API) and `9001:9001` (web console), volume for data persistence, healthcheck using `curl -f http://localhost:9000/minio/health/live`
- Add `minio-init` one-shot service to `nestjs-project/compose.yaml` — image `minio/mc`, `depends_on: { minio: { condition: service_healthy } }`, command that: configures the `mc` alias pointing to `http://minio:9000`, creates the `streamtube` bucket if it does not exist (`mc mb --ignore-existing`), and exits
- Create `nestjs-project/Dockerfile.worker` — based on the same Node base image as the main Dockerfile; in the `deps` and `build` stages reuse the workspace; in the final `runner` stage add `RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*` before copying the built dist; set `CMD ["node", "dist/main.worker.js"]`
- Add `video-worker` service to `nestjs-project/compose.yaml` — `build: { context: ., dockerfile: Dockerfile.worker }`, environment includes all database, Redis, MinIO, and queue variables, `depends_on: { db: { condition: service_healthy }, redis: { condition: service_healthy }, minio: { condition: service_healthy }, minio-init: { condition: service_completed_successfully } }`. Does not expose HTTP ports

**Dependencies:** None

**Acceptance criteria:**

- Application starts without errors when all new environment variables are provided — existing E2E test (`GET /` returns 200) still passes
- Starting the application without `STORAGE_ENDPOINT`, `STORAGE_ACCESS_KEY`, or `STORAGE_SECRET_KEY` causes a Joi validation error at bootstrap — the app does not start
- `redis` service is reachable at `localhost:6379` (host) and at `redis:6379` from within the Docker network
- `minio` service is reachable at `localhost:9000` (S3 API) and `localhost:9001` (console); after `minio-init` runs, the `streamtube` bucket exists
- `video-worker` container starts without errors, connects to DB, Redis, and MinIO, and logs a ready message
- `ffmpeg` and `ffprobe` are available as executable binaries inside the `video-worker` container
- Inside any container, `STORAGE_ENDPOINT=minio` and `REDIS_HOST=redis` are used — never `localhost`

---

### SI-03.2 — StorageModule (S3 Client, Multipart Orchestration, Ranged GetObject)

**Description:** Create `StorageModule` with an `S3Client` configured for MinIO, and `StorageService` wrapping all object-storage operations: multipart upload lifecycle (create, presign-part, complete, abort), full and ranged object retrieval (for streaming), thumbnail put, and object deletion. Consumed by `VideosService` (upload orchestration) and `VideoProcessingProcessor` (thumbnail upload and original download).

**Technical actions:**

- Create `src/storage/storage.service.ts` — `StorageService` injecting `ConfigType<typeof storageConfig>` via `@Inject(storageConfig.KEY)`. In the constructor, instantiate `S3Client` with `endpoint: \`http://${config.endpoint}:${config.port}\``, `credentials: { accessKeyId: config.accessKey, secretAccessKey: config.secretKey }`, `region: config.region`, `forcePathStyle: config.usePathStyle`. Store the client and `config.bucket` as private fields. Implement the following methods:
  - `createMultipartUpload(key: string, contentType: string): Promise<string>` — sends `CreateMultipartUploadCommand({ Bucket, Key: key, ContentType: contentType })`; returns `UploadId` (throws if absent)
  - `getPresignedUploadPartUrl(key: string, uploadId: string, partNumber: number): Promise<string>` — calls `getSignedUrl` with `UploadPartCommand({ Bucket, Key: key, UploadId: uploadId, PartNumber: partNumber })` and `expiresIn: 3600`
  - `completeMultipartUpload(key: string, uploadId: string, parts: Array<{ PartNumber: number; ETag: string }>): Promise<void>` — sends `CompleteMultipartUploadCommand({ Bucket, Key: key, UploadId: uploadId, MultipartUpload: { Parts: parts } })`
  - `abortMultipartUpload(key: string, uploadId: string): Promise<void>` — sends `AbortMultipartUploadCommand({ Bucket, Key: key, UploadId: uploadId })`; swallows `NoSuchUpload` errors (safe to call after S3 already aborted)
  - `getObjectStream(key: string, rangeHeader?: string): Promise<{ body: Readable; contentLength: number; contentType: string; acceptRanges: string; contentRange?: string }>` — sends `GetObjectCommand({ Bucket, Key: key, ...(rangeHeader ? { Range: rangeHeader } : {}) })`; extracts `Body` as `NodeJsRuntimeStreamingBlobPayloadOutputTypes`, `ContentLength`, `ContentType`, `AcceptRanges`, `ContentRange` from the response; throws a `StorageObjectNotFoundException` (mapped to 404) if `NoSuchKey` is received
  - `putObject(key: string, body: Buffer | Readable, contentType: string, contentLength?: number): Promise<void>` — sends `PutObjectCommand({ Bucket, Key: key, Body: body, ContentType: contentType, ...(contentLength !== undefined ? { ContentLength: contentLength } : {}) })`
  - `getPresignedGetUrl(key: string, expiresIn: number): Promise<string>` — calls `getSignedUrl` with `GetObjectCommand({ Bucket, Key: key })` and the given `expiresIn`
  - `deleteObject(key: string): Promise<void>` — sends `DeleteObjectCommand({ Bucket, Key: key })`
- Create `src/storage/storage.module.ts` — `StorageModule` with `ConfigModule` in imports (to access `storageConfig`), `StorageService` in providers, `StorageService` in exports

**Tests:**

| File | Layer | Verifies |
|------|-------|----------|
| `src/storage/storage.service.integration-spec.ts` | Integration | `createMultipartUpload` returns a non-empty `uploadId`; `getPresignedUploadPartUrl` returns a URL containing `uploadId` and `partNumber` query params; `completeMultipartUpload` succeeds after uploading a part; `putObject` stores an object; `getObjectStream` retrieves it with correct `ContentType`; `getObjectStream` with `Range: bytes=0-3` returns 4 bytes; `deleteObject` removes the object — subsequent `getObjectStream` throws `StorageObjectNotFoundException`; `abortMultipartUpload` on an already-completed upload does not throw |
| `src/storage/storage.module.spec.ts` | Unit | Module compiles with `StorageService` wiring |

**Dependencies:** SI-03.1

**Acceptance criteria:**

- `StorageService.createMultipartUpload` returns a non-empty `uploadId` string when called against the MinIO service
- `StorageService.getPresignedUploadPartUrl` returns a URL that includes the part number and upload id in its query string
- `StorageService.completeMultipartUpload` assembles the object; a subsequent `getObjectStream` call streams the full content
- `StorageService.getObjectStream` with a `Range: bytes=0-9` header returns a stream of exactly 10 bytes along with a `contentRange` value in the format `bytes 0-9/<total>`
- `StorageService.putObject` stores an object retrievable via `getObjectStream` with the same `contentType`
- `StorageService.abortMultipartUpload` does not throw when the `uploadId` no longer exists on the server
- All S3 commands use `http://minio:9000` as the endpoint inside containers — path-style addressing is enforced (`forcePathStyle: true`)

---

### SI-03.3 — Video Entity, Migration, and VideosModule Skeleton

**Description:** Define the `Video` entity with all lifecycle columns (publicId, status enum, upload/storage keys, duration, failureReason), generate the migration, create the `VideosModule` skeleton, and register it in `AppModule`. The entity is consumed by API, streaming, and worker layers without modification in later SIs.

**Technical actions:**

- Create `src/videos/entities/video-status.enum.ts` — export `VideoStatus` enum: `DRAFT = 'draft'`, `QUEUED = 'queued'`, `PROCESSING = 'processing'`, `READY = 'ready'`, `FAILED = 'failed'`
- Create `src/videos/entities/video.entity.ts` — `@Entity('videos')` with columns:
  - `id` (uuid PK, `@PrimaryGeneratedColumn('uuid')`)
  - `publicId` (`@Column({ name: 'public_id', type: 'varchar', length: 21, unique: true })`) — nanoid, 21 chars, set at draft creation
  - `title` (`@Column({ type: 'varchar', length: 255, nullable: true })`) — editable from Phase 04; null at creation
  - `description` (`@Column({ type: 'text', nullable: true })`) — null at creation
  - `status` (`@Column({ type: 'enum', enum: VideoStatus, default: VideoStatus.DRAFT })`)
  - `channelId` (`@Column({ name: 'channel_id', type: 'uuid' })`) — not a TypeORM relation join column; plain FK column for the `@ManyToOne` association
  - `uploadId` (`@Column({ name: 'upload_id', type: 'varchar', nullable: true })`) — S3 multipart upload id; cleared to `null` after `completeUpload` or `abortUpload`
  - `storageKey` (`@Column({ name: 'storage_key', type: 'varchar', nullable: true })`) — S3 object key `videos/{id}/original`; set at draft creation
  - `thumbnailKey` (`@Column({ name: 'thumbnail_key', type: 'varchar', nullable: true })`) — S3 key `videos/{id}/thumbnail.jpg`; set by worker after thumbnail upload
  - `duration` (`@Column({ type: 'float', nullable: true })`) — seconds, set by worker after ffprobe
  - `failureReason` (`@Column({ name: 'failure_reason', type: 'text', nullable: true })`) — last error message from BullMQ; set by worker on exhausted retries
  - `createdAt` (`@CreateDateColumn({ name: 'created_at' })`), `updatedAt` (`@UpdateDateColumn({ name: 'updated_at' })`)
  - `@ManyToOne(() => Channel, { onDelete: 'CASCADE', eager: false })` with `@JoinColumn({ name: 'channel_id' })` — relation declaration used for TypeORM FK constraint generation; not loaded by default
- Generate migration: `npm run migration:generate -- src/database/migrations/CreateVideos`; review generated SQL for correct columns, constraints, indexes, and the `video_status_enum` PostgreSQL enum type
- Create `src/videos/videos.module.ts` — `VideosModule` with `TypeOrmModule.forFeature([Video])` in imports; empty providers (filled in SI-03.5, SI-03.7, SI-03.8); exports `TypeOrmModule`
- Add `VideosModule` to `AppModule` imports

**Tests:**

| File | Layer | Verifies |
|------|-------|----------|
| `src/videos/entities/video.entity.integration-spec.ts` | Integration | `public_id` unique constraint rejects duplicate; `status` defaults to `'draft'`; `channel_id` FK violation on non-existent channel; `title`, `description`, `upload_id`, `storage_key`, `thumbnail_key`, `duration`, `failure_reason` accept `NULL`; `created_at` and `updated_at` auto-populated; `VideoStatus` enum rejects invalid values |
| `src/videos/videos.module.spec.ts` | Unit | Module compiles with `TypeOrmModule.forFeature([Video])` |

**Dependencies:** SI-03.1

**Acceptance criteria:**

- `npm run migration:run` creates the `videos` table with all columns, the `video_status_enum` PostgreSQL enum, the `public_id` unique index, and a FK constraint on `channel_id` referencing `channels.id`
- Inserting two videos with the same `public_id` fails with a unique constraint violation
- A newly created video row has `status = 'draft'` and `NULL` for all nullable columns
- Inserting a video with a non-existent `channel_id` fails with a foreign key constraint violation
- Querying `VideoStatus` with a value outside the enum fails at the PostgreSQL level

---

### SI-03.4 — QueueModule, Job Payload Contract, and Enqueue Abstraction

**Description:** Configure `BullMQ` with the Redis connection via `BullModule.forRootAsync`, define the `VideoProcessingJobPayload` type and job constants, and create `QueueService` exposing `enqueueVideoProcessing(videoId: string)` with the agreed attempt/backoff policy. Consumed by `VideosService` when an upload completes.

**Technical actions:**

- Create `src/queue/queue.constants.ts` — export `QUEUE_NAME = 'video-processing'` (string constant) and `JOB_NAME_PROCESS_VIDEO = 'process-video'` (string constant)
- Create `src/queue/queue.types.ts` — export `interface VideoProcessingJobPayload { videoId: string }`
- Create `src/queue/queue.service.ts` — `QueueService` injecting `@InjectQueue(QUEUE_NAME) private readonly queue: Queue<VideoProcessingJobPayload>`. Implement `enqueueVideoProcessing(videoId: string): Promise<Job<VideoProcessingJobPayload>>` — calls `this.queue.add(JOB_NAME_PROCESS_VIDEO, { videoId }, { attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: true, removeOnFail: false })`; returns the created job
- Create `src/queue/queue.module.ts` — `QueueModule` importing `ConfigModule` and `BullModule.registerQueueAsync({ name: QUEUE_NAME, inject: [queueConfig.KEY], useFactory: (cfg: ConfigType<typeof queueConfig>) => ({ connection: { host: cfg.host, port: cfg.port } }) })`. Provides and exports `QueueService`. Register `BullModule.forRootAsync` in `AppModule` (not in `QueueModule`) with `inject: [queueConfig.KEY], useFactory: (cfg) => ({ connection: { host: cfg.host, port: cfg.port } })`

**Tests:**

| File | Layer | Verifies |
|------|-------|----------|
| `src/queue/queue.service.integration-spec.ts` | Integration | `enqueueVideoProcessing('test-uuid')` adds a job to the `video-processing` queue; `queue.getJobs(['waiting'])` returns one job with `name = 'process-video'`, `data.videoId = 'test-uuid'`, `opts.attempts = 3`, `opts.backoff.type = 'exponential'`, `opts.backoff.delay = 5000` |
| `src/queue/queue.module.spec.ts` | Unit | Module compiles with `BullModule.registerQueueAsync` and `QueueService` |

**Dependencies:** SI-03.1

**Acceptance criteria:**

- `QueueService.enqueueVideoProcessing('some-uuid')` successfully adds a waiting job — `queue.getWaitingCount()` increases by 1
- The job is configured with `attempts: 3`, `backoff.type: 'exponential'`, `backoff.delay: 5000`
- `removeOnComplete: true` is set — successful jobs are removed from the queue automatically
- `removeOnFail: false` is set — failed jobs remain in the `failed` list for inspection
- The Redis connection inside containers uses host `redis` (never `localhost`)

---

### SI-03.5 — Upload API (Initiate, Sign-Part, Complete, Abort)

**Description:** Implement the four upload orchestration endpoints that form the multipart upload lifecycle. `POST /videos/uploads` creates a draft video row (with nanoid `publicId`) and starts an S3 multipart upload. `POST /videos/uploads/:videoId/parts` returns a presigned URL for a single part. `POST /videos/uploads/:videoId/complete` finalizes the multipart upload, transitions status to `queued`, and enqueues the processing job. `DELETE /videos/uploads/:videoId` aborts the multipart upload (if started) and removes the draft record. All four endpoints require authentication; part, complete, and abort also require channel ownership. Add `findChannelByUserId` to `ChannelsService` to enable ownership resolution from the JWT `sub`.

**Technical actions:**

- Add `findChannelByUserId(userId: string): Promise<Channel>` to `src/channels/channels.service.ts` — `this.channelRepository.findOne({ where: { userId } })`; if not found throw a new `ChannelNotFoundException` (403, code `CHANNEL_NOT_FOUND`)
- Create `src/videos/exceptions/video.exceptions.ts` — define the following `DomainException` subclasses (extend the existing base from `src/common/exceptions/domain.exception.ts`):
  - `VideoNotFoundException` — HTTP 404, errorCode `VIDEO_NOT_FOUND`, message `'Video not found'`
  - `VideoOwnershipException` — HTTP 403, errorCode `VIDEO_OWNERSHIP_REQUIRED`, message `'You do not own this video'`
  - `VideoNotInDraftException` — HTTP 422, errorCode `VIDEO_NOT_IN_DRAFT`, message `'Video is not in draft status'`
  - `VideoNotReadyException` — HTTP 422, errorCode `VIDEO_NOT_READY`, message `'Video is not ready for playback'`
- Create `src/videos/dto/initiate-upload.dto.ts` — `InitiateUploadDto` with: `@IsString() @IsNotEmpty() @MaxLength(255)` filename; `@IsIn(['video/mp4','video/quicktime','video/x-msvideo','video/x-matroska','video/webm'])` mimeType; `@IsInt() @Min(1) @Max(10_737_418_240)` size (bytes)
- Create `src/videos/dto/sign-part.dto.ts` — `SignPartDto` with `@IsInt() @Min(1) @Max(10000)` partNumber
- Create `src/videos/dto/complete-upload.dto.ts` — `CompleteUploadDto` with `@IsArray() @ValidateNested({ each: true }) @Type(() => UploadPartDto)` parts; inner class `UploadPartDto` with `@IsInt() @Min(1)` partNumber and `@IsString() @IsNotEmpty()` etag
- Create `src/videos/videos.service.ts` — `VideosService` injecting `@InjectRepository(Video) private readonly videoRepository: Repository<Video>`, `private readonly storageService: StorageService`, `private readonly queueService: QueueService`, `private readonly channelsService: ChannelsService`. Implement:
  - `private async generateUniquePublicId(maxRetries = 5): Promise<string>` — generate `nanoid(21)`; query `videoRepository.findOne({ where: { publicId } })`; if a row exists, retry; throw after `maxRetries`
  - `initiateUpload(userId: string, dto: InitiateUploadDto): Promise<{ videoId: string; publicId: string; uploadId: string; key: string }>` — call `channelsService.findChannelByUserId(userId)` to get `channel`; call `generateUniquePublicId()`; create a partial `Video` entity with a new UUID `id` (via `crypto.randomUUID()`); compute `key = \`videos/${id}/original\``; call `storageService.createMultipartUpload(key, dto.mimeType)` to get `uploadId`; save `Video` with `publicId`, `storageKey = key`, `uploadId`, `channelId = channel.id`, `status = DRAFT`; return `{ videoId: id, publicId, uploadId, key }`
  - `getPresignedPartUrl(videoId: string, userId: string, dto: SignPartDto): Promise<string>` — find video by `id = videoId`; if not found throw `VideoNotFoundException`; call `channelsService.findChannelByUserId(userId)`; if `video.channelId !== channel.id` throw `VideoOwnershipException`; if `video.status !== DRAFT` throw `VideoNotInDraftException`; if `video.uploadId` is null throw `VideoNotInDraftException`; call `storageService.getPresignedUploadPartUrl(video.storageKey, video.uploadId, dto.partNumber)`; return the presigned URL
  - `completeUpload(videoId: string, userId: string, dto: CompleteUploadDto): Promise<void>` — find video; ownership check; draft status check; call `storageService.completeMultipartUpload(video.storageKey, video.uploadId, dto.parts.map(p => ({ PartNumber: p.partNumber, ETag: p.etag })))`; update `video.status = QUEUED`, `video.uploadId = null`; save; call `queueService.enqueueVideoProcessing(videoId)`
  - `abortUpload(videoId: string, userId: string): Promise<void>` — find video; ownership check; draft status check; if `video.uploadId` is not null, call `storageService.abortMultipartUpload(video.storageKey, video.uploadId)` (do not throw on not-found); call `videoRepository.delete(videoId)`
- Create `src/videos/videos.controller.ts` — `@ApiTags('videos') @Controller()`:
  - `@Post('videos/uploads') @HttpCode(HttpStatus.CREATED)` — requires auth (no `@Public()`); extract `@CurrentUser() user: JwtPayload`; call `videosService.initiateUpload(user.sub, dto)`; return `{ videoId, publicId, uploadId, key }`
  - `@Post('videos/uploads/:videoId/parts') @HttpCode(HttpStatus.OK)` — auth; extract `videoId` from `@Param()` and `dto` from `@Body()`; call `videosService.getPresignedPartUrl(videoId, user.sub, dto)`; return `{ presignedUrl }`
  - `@Post('videos/uploads/:videoId/complete') @HttpCode(HttpStatus.OK)` — auth; call `videosService.completeUpload(videoId, user.sub, dto)`; return `{ videoId, status: 'queued' }`
  - `@Delete('videos/uploads/:videoId') @HttpCode(HttpStatus.NO_CONTENT)` — auth; call `videosService.abortUpload(videoId, user.sub)`; return no body
- Update `src/videos/videos.module.ts` — add `VideosService`, `VideosController` to providers/controllers; import `StorageModule`, `QueueModule`, `ChannelsModule`

**Tests:**

| File | Layer | Verifies |
|------|-------|----------|
| `src/videos/videos.service.spec.ts` | Unit | `initiateUpload`: generates publicId, calls storageService.createMultipartUpload, saves draft with correct fields; retries on publicId collision up to maxRetries; `getPresignedPartUrl`: video-not-found throws, non-owner throws, non-draft throws, returns presigned URL; `completeUpload`: ownership check, draft check, calls completeMultipartUpload, transitions to QUEUED, clears uploadId, enqueues job; `abortUpload`: ownership check, calls abortMultipartUpload, deletes record |
| `src/videos/videos.service.integration-spec.ts` | Integration | `initiateUpload` persists video in DB with `status = 'draft'`, non-null `storageKey`, non-null `uploadId`, correct `channelId`; `completeUpload` sets `status = 'queued'` and `uploadId = null` in DB, job appears in Redis `video-processing` queue; `abortUpload` removes the video record |
| `test/videos.e2e-spec.ts` | E2E | `POST /videos/uploads` 201 with valid JWT; 401 without JWT; 400 with size > 10GB; 400 with unsupported mimeType; `POST /videos/uploads/:id/parts` 200 with owner; 403 with non-owner JWT; 404 with unknown videoId; `POST /videos/uploads/:id/complete` 200 sets status queued; `DELETE /videos/uploads/:id` 204 removes record |

**Dependencies:** SI-03.2, SI-03.3, SI-03.4

**Acceptance criteria:**

- `POST /videos/uploads` with a valid authenticated request returns 201 with `{ videoId, publicId, uploadId, key }` — a `videos` row with `status = 'draft'` is persisted
- `POST /videos/uploads` with `size` exceeding 10 737 418 240 bytes returns 400 with a validation error
- `POST /videos/uploads` with an unsupported `mimeType` (e.g. `text/plain`) returns 400 with a validation error
- `POST /videos/uploads/:videoId/parts` returns 200 with `{ presignedUrl }` — the URL is a valid MinIO presigned URL for a `PUT` request targeting the correct object key
- `POST /videos/uploads/:videoId/complete` returns 200 with `{ videoId, status: 'queued' }` — `video.status = 'queued'`, `video.uploadId = null` in DB; a job with `data.videoId` exists in the `video-processing` queue
- `DELETE /videos/uploads/:videoId` returns 204 — the video record is removed from the database
- `POST /videos/uploads/:videoId/parts`, `POST /videos/uploads/:videoId/complete`, and `DELETE /videos/uploads/:videoId` return 403 when the authenticated user's channel does not own the video
- All four endpoints return 401 when the `Authorization` header is absent or contains an invalid JWT

---

### SI-03.6 — Worker Processor (FFprobe, Thumbnail, Status Transitions)

**Description:** Create the `main.worker.ts` NestJS entrypoint (no HTTP server), the `VideoWorkerModule` that wires only the dependencies the worker needs (DB, queue, storage, video entity), and `VideoProcessingProcessor` that extends `WorkerHost` and processes `process-video` jobs: sets status `processing`, downloads the original from MinIO to a temp path, runs `ffprobe` for duration/format, runs `ffmpeg` to extract a thumbnail frame, uploads the thumbnail to storage, and sets status `ready`. On job exhaustion (last attempt failed), sets status `failed` with `failureReason`. Temp files are always cleaned up.

**Technical actions:**

- Create `src/video-worker/video-processing.module.ts` — `VideoProcessingModule` with `TypeOrmModule.forFeature([Video])`, `StorageModule`, and `BullModule.registerQueue({ name: QUEUE_NAME })` in imports; `VideoProcessingProcessor` in providers
- Create `src/video-worker/video-worker.module.ts` — `VideoWorkerModule` importing: `ConfigModule.forRoot({ isGlobal: true, load: [databaseConfig, storageConfig, queueConfig], validationSchema })`, `TypeOrmModule.forRootAsync(...)` (same async factory as `AppModule` but using `databaseConfig`), `BullModule.forRootAsync({ inject: [queueConfig.KEY], useFactory: (cfg: ConfigType<typeof queueConfig>) => ({ connection: { host: cfg.host, port: cfg.port } }) })`, `StorageModule`, `VideoProcessingModule`. Does not import `MailModule`, `AuthModule`, `UsersModule`, `ChannelsModule`, or HTTP-only modules
- Create `src/main.worker.ts` — bootstraps `NestFactory.createApplicationContext(VideoWorkerModule)`; calls `app.enableShutdownHooks()`; calls `await app.init()`; logs `'Video worker ready'` to stdout; does not call `app.listen()`
- Create `src/video-worker/video-processing.processor.ts` — `@Processor(QUEUE_NAME) export class VideoProcessingProcessor extends WorkerHost`. Inject `@InjectRepository(Video) private readonly videoRepository: Repository<Video>` and `private readonly storageService: StorageService`. Implement `async process(job: Job<VideoProcessingJobPayload>): Promise<void>`:
  1. Find video by `job.data.videoId`; if not found throw an error (causes BullMQ to retry/fail the job)
  2. `await this.videoRepository.update(video.id, { status: VideoStatus.PROCESSING })`
  3. Create temp directory `tmpDir = /tmp/streamtube/${video.id}`; ensure it exists with `fs.promises.mkdir(tmpDir, { recursive: true })`; `tmpFilePath = path.join(tmpDir, 'original')`
  4. `const { body } = await this.storageService.getObjectStream(video.storageKey)`; pipe to `fs.createWriteStream(tmpFilePath)` — await stream completion
  5. Run `ffprobe` via `new Promise((resolve, reject) => ffmpeg.ffprobe(tmpFilePath, (err, metadata) => err ? reject(err) : resolve(metadata)))`; extract `duration = metadata.format.duration`
  6. Compute `thumbnailTimemark = String(Math.max(0, Math.min(1, (duration ?? 2) * 0.1)).toFixed(3))`; run `ffmpeg(tmpFilePath).screenshots({ count: 1, timemarks: [thumbnailTimemark], filename: 'thumbnail.jpg', folder: tmpDir, size: '1280x720' })` — await completion via event promise
  7. Read `thumbnailBuffer = await fs.promises.readFile(path.join(tmpDir, 'thumbnail.jpg'))`; `thumbnailKey = \`videos/${video.id}/thumbnail.jpg\``; call `storageService.putObject(thumbnailKey, thumbnailBuffer, 'image/jpeg', thumbnailBuffer.length)`
  8. `await this.videoRepository.update(video.id, { status: VideoStatus.READY, duration, thumbnailKey, failureReason: null })`
  9. In `finally` block: `await fs.promises.rm(tmpDir, { recursive: true, force: true })`
  - Add `@OnWorkerEvent('failed') onFailed(job: Job<VideoProcessingJobPayload>, error: Error): void` — if `job.attemptsMade >= (job.opts.attempts ?? 1)` (last attempt), update `video.status = FAILED`, `video.failureReason = error.message` in the repository (fire-and-forget with `.catch(console.error)`)
- Update `nestjs-project/nest-cli.json` — add `"entryFile": "main"` confirmation (already set) and ensure the build includes `main.worker.ts` — this is automatic since it is within `src/`

**Tests:**

| File | Layer | Verifies |
|------|-------|----------|
| `src/video-worker/video-processing.processor.spec.ts` | Unit | `process()`: sets status to PROCESSING on start; on success updates status to READY with correct `duration` and `thumbnailKey`; on `ffprobe` failure re-throws so BullMQ retries; on storage put error re-throws; `onFailed` on last attempt updates status to FAILED with `failureReason`; temp cleanup always runs (spy on `fs.promises.rm`) |
| `src/video-worker/video-processing.processor.integration-spec.ts` | Integration | Enqueue a job with a real small MP4 fixture stored in MinIO; wait up to 15 s for job completion; assert DB `status = 'ready'`, `duration > 0`, `thumbnailKey` non-null; assert MinIO has the thumbnail object at `videos/{id}/thumbnail.jpg`; assert temp directory is removed |

**Dependencies:** SI-03.2, SI-03.3, SI-03.4

**Acceptance criteria:**

- Enqueueing a `process-video` job for a video whose original is stored in MinIO causes the worker to transition status `draft → processing → ready` — `duration` (seconds, float) and `thumbnailKey` are populated in the database
- The thumbnail is stored at `videos/{videoId}/thumbnail.jpg` in MinIO and retrievable via `StorageService.getObjectStream`
- If `ffprobe` fails (e.g. corrupt file), the job is retried; after 3 failed attempts `video.status = 'failed'` and `video.failureReason` contains the error message
- Temp files under `/tmp/streamtube/{videoId}/` are removed after processing, regardless of success or failure
- The worker process does not start an HTTP server — no port is bound
- The worker connects to DB, Redis, and MinIO using Docker Compose service names as hosts

---

### SI-03.7 — Stream (Range/206) and Download Endpoints

**Description:** Implement `GET /videos/:publicId/stream` with full HTTP Range/206 partial-content support for progressive browser playback, and `GET /videos/:publicId/download` that streams the full original with `Content-Disposition: attachment`. Both endpoints are public and restricted to `READY` videos.

**Technical actions:**

- Add `streamVideo(publicId: string, rangeHeader: string | undefined, res: Response): Promise<void>` to `VideosService`:
  1. `const video = await this.videoRepository.findOne({ where: { publicId, status: VideoStatus.READY } })`; if null throw `VideoNotFoundException`
  2. `const { body, contentLength, contentType, acceptRanges, contentRange } = await this.storageService.getObjectStream(video.storageKey, rangeHeader)`
  3. Set response headers: `res.setHeader('Content-Type', contentType || 'video/mp4')`, `res.setHeader('Accept-Ranges', 'bytes')`, `res.setHeader('Content-Length', contentLength.toString())`, and if `contentRange` is defined `res.setHeader('Content-Range', contentRange)`
  4. Set status code: `res.status(rangeHeader && contentRange ? 206 : 200)`
  5. Pipe body to response: `body.pipe(res)`
- Add `downloadVideo(publicId: string, res: Response): Promise<void>` to `VideosService`:
  1. `const video = await this.videoRepository.findOne({ where: { publicId, status: VideoStatus.READY } })`; if null throw `VideoNotFoundException`
  2. `const { body, contentLength, contentType } = await this.storageService.getObjectStream(video.storageKey)`
  3. Set `res.setHeader('Content-Disposition', \`attachment; filename="${publicId}.mp4"\`)`, `Content-Type`, `Content-Length`
  4. `res.status(200)`; `body.pipe(res)`
- Add `@Public() @Get('videos/:publicId/stream')` to `VideosController` — extract `@Headers('range') range: string | undefined`, inject `@Res() res: Response` (passthrough disabled so the method controls piping); call `videosService.streamVideo(publicId, range, res)`
- Add `@Public() @Get('videos/:publicId/download')` to `VideosController` — inject `@Res() res: Response`; call `videosService.downloadVideo(publicId, res)`

**Tests:**

| File | Layer | Verifies |
|------|-------|----------|
| `src/videos/videos.service.spec.ts` | Unit | `streamVideo`: `VideoNotFoundException` for non-existent publicId; `VideoNotFoundException` for non-READY status; Range header forwarded to `storageService.getObjectStream`; 206 status set when Range present and contentRange returned; 200 status when no Range header |
| `test/videos.e2e-spec.ts` | E2E | `GET /videos/:publicId/stream` without Range returns 200 with correct `Content-Type` for a ready video; with `Range: bytes=0-1023` returns 206, `Content-Range` header, and 1024 bytes; 404 for unknown publicId; 404 for non-ready video; `GET /videos/:publicId/download` returns 200 with `Content-Disposition: attachment`, correct content-type; 404 for non-ready |

**Dependencies:** SI-03.2, SI-03.3

**Acceptance criteria:**

- `GET /videos/:publicId/stream` for a `ready` video without a `Range` header returns 200 with `Content-Type` matching the original MIME type, `Accept-Ranges: bytes`, and the full video body
- `GET /videos/:publicId/stream` with `Range: bytes=0-1023` returns 206 with `Content-Range: bytes 0-1023/<total>`, `Content-Length: 1024`, and exactly 1024 bytes
- `GET /videos/:publicId/stream` for an unknown or non-ready `publicId` returns 404 with `VIDEO_NOT_FOUND`
- `GET /videos/:publicId/download` for a `ready` video returns 200 with `Content-Disposition: attachment; filename="<publicId>.mp4"` and the full video body
- Both endpoints are accessible without an `Authorization` header (decorated with `@Public()`)

---

### SI-03.8 — Video Metadata Endpoint, Ownership Guard Polish, and OpenAPI Tags

**Description:** Implement `GET /videos/:publicId` returning video metadata. `READY` videos are publicly visible; the authenticated owner can also see their own videos in any non-ready status. Add `VideoResponseDto` with an OpenAPI schema. Add `@ApiTags` and `@ApiResponse` decorators across all `VideosController` endpoints.

**Technical actions:**

- Create `src/videos/dto/video-response.dto.ts` — `VideoResponseDto` with `@ApiProperty` on every field: `id: string`, `publicId: string`, `title: string | null`, `description: string | null`, `status: VideoStatus`, `duration: number | null`, `channelId: string`, `thumbnailUrl: string | null`, `createdAt: Date`, `updatedAt: Date`
- Add `getVideoMetadata(publicId: string, userId: string | undefined): Promise<VideoResponseDto>` to `VideosService`:
  1. `const video = await this.videoRepository.findOne({ where: { publicId } })`; if null throw `VideoNotFoundException`
  2. If `video.status !== VideoStatus.READY`: call `channelsService.findChannelByUserId(userId)` (catch `ChannelNotFoundException`) — if `userId` is not provided, or the channel lookup fails, or `video.channelId !== channel.id`, throw `VideoNotFoundException` (do not reveal non-ready videos to non-owners)
  3. Compute `thumbnailUrl`: if `video.thumbnailKey` is non-null, call `storageService.getPresignedGetUrl(video.thumbnailKey, 3600)` — await the promise; otherwise `null`
  4. Map entity to `VideoResponseDto` and return
- Add `@Public() @Get('videos/:publicId')` to `VideosController` — use `@CurrentUser()` as an optional parameter (type `JwtPayload | undefined`); pass `user?.sub` to `videosService.getVideoMetadata`; return the `VideoResponseDto`

  Note: Since the endpoint is `@Public()`, the `JwtAuthGuard` allows the request through without a token. When a token is present and valid, `CurrentUser()` still resolves. When no token is present, `request.user` is `undefined` — the guard must not throw for `@Public()` routes with missing tokens (already guaranteed by SI-02.9 implementation).

- Add `@ApiTags('videos')` to `VideosController`; add `@ApiOperation`, `@ApiResponse` (201/200/204/400/401/403/404/422), and `@ApiBearerAuth` where applicable to all endpoints in the controller, following the OpenAPI patterns established in the auth controller
- Add `VideoNotFoundException`, `VideoOwnershipException`, `VideoNotInDraftException`, `VideoNotReadyException` to the domain exception registry in `src/common/exceptions/domain.exception.ts` if a central mapping is maintained there; otherwise confirm the `DomainExceptionFilter` from Phase 02 catches them via the `DomainException` base class without modification

**Tests:**

| File | Layer | Verifies |
|------|-------|----------|
| `src/videos/videos.service.spec.ts` | Unit | `getVideoMetadata`: returns `VideoResponseDto` for READY video; throws `VideoNotFoundException` for unknown publicId; throws `VideoNotFoundException` for non-READY video when userId is undefined; throws `VideoNotFoundException` for non-READY video when userId belongs to a different channel; returns DTO for non-READY video when userId is the owner's; `thumbnailUrl` is null when `thumbnailKey` is null; `thumbnailUrl` is a string when `thumbnailKey` is set |
| `test/videos.e2e-spec.ts` | E2E | `GET /videos/:publicId` 200 for READY video without auth; 200 for READY video with non-owner JWT (publicly visible); 200 for DRAFT video with owner JWT; 404 for DRAFT video without auth; 404 for QUEUED video with non-owner JWT; 404 for unknown publicId; response body contains `id`, `publicId`, `status`, `channelId`, `createdAt`, `updatedAt` |

**Dependencies:** SI-03.3, SI-03.5

**Acceptance criteria:**

- `GET /videos/:publicId` for a `ready` video without authentication returns 200 with a `VideoResponseDto` including `status: 'ready'`, `duration`, `channelId`, `publicId`, `thumbnailUrl` (non-null string if thumbnail exists)
- `GET /videos/:publicId` for a `ready` video with a valid but non-owner JWT returns 200 — ready videos are publicly visible regardless of who requests them
- `GET /videos/:publicId` for a `draft`, `queued`, `processing`, or `failed` video without authentication returns 404 with `VIDEO_NOT_FOUND`
- `GET /videos/:publicId` for a non-ready video with the owning channel's JWT returns 200 with the actual status
- `GET /videos/:publicId` for a non-existent `publicId` returns 404 with `VIDEO_NOT_FOUND`
- The response includes a `thumbnailUrl` field: a non-null presigned MinIO GET URL (expiring in 3600 s) when the thumbnail has been generated, or `null` otherwise

---

## Technical Specifications

### Data Model

#### Video

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, generated | Internal identifier |
| public_id | varchar(21) | unique, not null | nanoid(21), URL-safe public identifier |
| title | varchar(255) | nullable | Editable from Phase 04; null at creation |
| description | text | nullable | Editable from Phase 04; null at creation |
| status | enum (`video_status_enum`) | not null, default `'draft'` | Values: `draft`, `queued`, `processing`, `ready`, `failed` |
| channel_id | uuid | FK → channels.id, not null, ON DELETE CASCADE | Owning channel; not loaded by default |
| upload_id | varchar | nullable | S3 multipart upload id; cleared to null after complete or abort |
| storage_key | varchar | nullable | S3 object key `videos/{id}/original`; set at draft creation |
| thumbnail_key | varchar | nullable | S3 object key `videos/{id}/thumbnail.jpg`; set by worker |
| duration | float | nullable | Duration in seconds, extracted by ffprobe; set by worker |
| failure_reason | text | nullable | Last BullMQ job error message; set by worker on exhausted retries |
| created_at | timestamp | not null, auto-generated | `@CreateDateColumn` |
| updated_at | timestamp | not null, auto-generated | `@UpdateDateColumn` |

**Relations:** Video → Channel (many-to-one, `channel_id` FK)
**Indexes:** `(public_id)` — unique; `(channel_id)` — FK index; `(status)` — for status-filtered queries

**Status lifecycle:**

```
draft ──(completeUpload)──▶ queued ──(worker picks up)──▶ processing ──(ffmpeg ok)──▶ ready
                                                                         └───(exhausted retries)──▶ failed
```

**Object storage key layout (bucket: `streamtube`):**

| Key pattern | Owner | Created by |
|-------------|-------|-----------|
| `videos/{videoId}/original` | API (multipart upload) | Client via presigned PUT parts |
| `videos/{videoId}/thumbnail.jpg` | Worker | `VideoProcessingProcessor` after ffmpeg |

---

### API Contracts

#### POST /videos/uploads (SI-03.5)

**Request headers:**
- Authorization: Bearer \<access_token\>
- Content-Type: application/json

**Request body:**
- filename: string, required — original filename (max 255 chars)
- mimeType: string, required — one of: `video/mp4`, `video/quicktime`, `video/x-msvideo`, `video/x-matroska`, `video/webm`
- size: integer, required — file size in bytes, min 1, max 10 737 418 240 (10 GB)

**Response 201:**
- videoId: string (uuid) — internal video id for subsequent upload calls
- publicId: string (21 chars) — nanoid public identifier for watch/stream/download URLs
- uploadId: string — S3 multipart upload id (opaque; client uses it to track parts)
- key: string — S3 object key where parts will be assembled (informational)

**Error responses:**
- 401: missing or invalid JWT
- 400 VALIDATION_ERROR: body fails schema validation (size out of range, unsupported mimeType)

---

#### POST /videos/uploads/:videoId/parts (SI-03.5)

**Request headers:**
- Authorization: Bearer \<access_token\>
- Content-Type: application/json

**Path parameters:**
- videoId: string (uuid)

**Request body:**
- partNumber: integer, required — S3 part number, min 1, max 10 000

**Response 200:**
- presignedUrl: string — presigned PUT URL valid for 3600 seconds; client uses this to upload the part bytes directly to MinIO

**Error responses:**
- 401: missing or invalid JWT
- 403 VIDEO_OWNERSHIP_REQUIRED: authenticated user is not the channel owner of the video
- 404 VIDEO_NOT_FOUND: videoId does not exist
- 422 VIDEO_NOT_IN_DRAFT: video status is not `draft` (upload already completed or aborted)

---

#### POST /videos/uploads/:videoId/complete (SI-03.5)

**Request headers:**
- Authorization: Bearer \<access_token\>
- Content-Type: application/json

**Path parameters:**
- videoId: string (uuid)

**Request body:**
- parts: array, required — list of completed parts; each element:
  - partNumber: integer, required — min 1
  - etag: string, required — ETag value returned by S3 when the part was uploaded (client must capture from the PUT response)

**Response 200:**
- videoId: string (uuid)
- status: string — `'queued'`

**Error responses:**
- 401: missing or invalid JWT
- 403 VIDEO_OWNERSHIP_REQUIRED: authenticated user is not the channel owner
- 404 VIDEO_NOT_FOUND: videoId does not exist
- 422 VIDEO_NOT_IN_DRAFT: video not in `draft` status

---

#### DELETE /videos/uploads/:videoId (SI-03.5)

**Request headers:**
- Authorization: Bearer \<access_token\>

**Path parameters:**
- videoId: string (uuid)

**Response 204:** No content.

**Error responses:**
- 401: missing or invalid JWT
- 403 VIDEO_OWNERSHIP_REQUIRED: authenticated user is not the channel owner
- 404 VIDEO_NOT_FOUND: videoId does not exist
- 422 VIDEO_NOT_IN_DRAFT: video not in `draft` status

---

#### GET /videos/:publicId (SI-03.8)

**Request headers:**
- Authorization: Bearer \<access_token\> (optional — if omitted, only READY videos are visible)

**Path parameters:**
- publicId: string (21 chars)

**Response 200:**
- id: string (uuid)
- publicId: string
- title: string | null
- description: string | null
- status: string (`'draft'` | `'queued'` | `'processing'` | `'ready'` | `'failed'`)
- duration: number | null (seconds, float)
- channelId: string (uuid)
- thumbnailUrl: string | null (presigned GET URL expiring in 3600 s; null if thumbnail not yet generated)
- createdAt: string (ISO 8601)
- updatedAt: string (ISO 8601)

**Error responses:**
- 404 VIDEO_NOT_FOUND: publicId not found, or video is not READY and the requester is not the owner

---

#### GET /videos/:publicId/stream (SI-03.7)

**Request headers:**
- Range: bytes=\<start\>-\<end\> (optional — if present, triggers 206 partial response)

**Path parameters:**
- publicId: string (21 chars)

**Response 200** (no Range header):
- Headers: `Content-Type`, `Accept-Ranges: bytes`, `Content-Length`
- Body: full video bytes

**Response 206** (Range header present and honored):
- Headers: `Content-Type`, `Accept-Ranges: bytes`, `Content-Length` (chunk size), `Content-Range: bytes <start>-<end>/<total>`
- Body: the requested byte range

**Error responses:**
- 404 VIDEO_NOT_FOUND: publicId not found or video status is not `ready`

---

#### GET /videos/:publicId/download (SI-03.7)

**Path parameters:**
- publicId: string (21 chars)

**Response 200:**
- Headers: `Content-Type`, `Content-Length`, `Content-Disposition: attachment; filename="<publicId>.mp4"`
- Body: full video bytes

**Error responses:**
- 404 VIDEO_NOT_FOUND: publicId not found or video status is not `ready`

---

### Authorization Matrix

| Endpoint | Public | Authenticated (any) | Authenticated (owner) | Notes |
|----------|--------|---------------------|-----------------------|-------|
| POST /videos/uploads | | | ✓ | Owner = authenticated user whose channel owns the video |
| POST /videos/uploads/:videoId/parts | | | ✓ | |
| POST /videos/uploads/:videoId/complete | | | ✓ | |
| DELETE /videos/uploads/:videoId | | | ✓ | |
| GET /videos/:publicId | ✓ (READY only) | ✓ (READY only) | ✓ (any status) | Non-owners see 404 for non-ready videos |
| GET /videos/:publicId/stream | ✓ (READY only) | ✓ (READY only) | ✓ (READY only) | |
| GET /videos/:publicId/download | ✓ (READY only) | ✓ (READY only) | ✓ (READY only) | |

**Ownership definition:** the authenticated user has a `Channel` whose `id` equals `video.channelId`. Resolved by calling `ChannelsService.findChannelByUserId(userId)` inside `VideosService`.

---

### Error Catalog

**Error response format:** (inherited from Phase 02 — applies to all nestjs-project HTTP endpoints)
```
{ statusCode: number, error: string, message: string }
```

| Code | HTTP | Message | Trigger |
|------|------|---------|---------|
| VIDEO_NOT_FOUND | 404 | Video not found | `GET /videos/:publicId` for unknown publicId, or non-READY video accessed by a non-owner; `GET /videos/:publicId/stream` or `/download` for unknown or non-READY video |
| VIDEO_OWNERSHIP_REQUIRED | 403 | You do not own this video | `POST /videos/uploads/:videoId/parts`, `/complete`, `DELETE /videos/uploads/:videoId` when `video.channelId` does not match the authenticated user's channel |
| VIDEO_NOT_IN_DRAFT | 422 | Video is not in draft status | `POST /videos/uploads/:videoId/parts`, `/complete`, `DELETE /videos/uploads/:videoId` when `video.status !== 'draft'` |
| VIDEO_NOT_READY | 422 | Video is not ready for playback | Reserved for explicit 422 scenarios in future phases; stream/download currently return 404 for non-ready |
| CHANNEL_NOT_FOUND | 403 | Channel not found | `POST /videos/uploads` or ownership-checked endpoints when the authenticated user has no channel (should not occur in practice after Phase 02 registration) |

---

### Events / Messages

**Queue name:** `video-processing`
**Broker:** BullMQ + Redis (Compose service name: `redis:6379`)
**Job name:** `process-video`

**Job payload type:**
```typescript
interface VideoProcessingJobPayload {
  videoId: string; // uuid, matches videos.id
}
```

**Job options:**

| Option | Value | Rationale |
|--------|-------|-----------|
| attempts | 3 | Absorbs transient FFmpeg or MinIO blips without permanent failure |
| backoff.type | `'exponential'` | Avoids thundering-herd on storage errors |
| backoff.delay | 5000 ms | Initial delay; doubles on each retry (5 s → 10 s → 20 s) |
| removeOnComplete | `true` | Successful jobs removed from Redis to avoid unbounded growth |
| removeOnFail | `false` | Failed jobs retained for post-mortem inspection |

**Job lifecycle and status transitions:**

| BullMQ job event | Video status transition | Actor |
|------------------|------------------------|-------|
| Job enqueued | `queued` (set by `completeUpload`) | `VideosService` |
| Job picked up | `processing` (set inside `process()`) | `VideoProcessingProcessor` |
| Job completed | `ready` (set inside `process()` on success) | `VideoProcessingProcessor` |
| Job failed (last attempt) | `failed` (set inside `onFailed` handler) | `VideoProcessingProcessor` |

**Worker entrypoint:** `src/main.worker.ts` → compiled to `dist/main.worker.js`
**Worker Compose service:** `video-worker` — built from `Dockerfile.worker`; shares DB, Redis, MinIO environment variables with `nestjs-api`; does not bind any TCP port

---

## Dependency Map

```
SI-03.1 (no deps)
├── SI-03.2
│   ├── SI-03.5 (also needs SI-03.3, SI-03.4)
│   ├── SI-03.6 (also needs SI-03.3, SI-03.4)
│   └── SI-03.7 (also needs SI-03.3)
├── SI-03.3
│   ├── SI-03.5 (also needs SI-03.2, SI-03.4)
│   ├── SI-03.6 (also needs SI-03.2, SI-03.4)
│   ├── SI-03.7 (also needs SI-03.2)
│   └── SI-03.8 (also needs SI-03.5)
└── SI-03.4
    ├── SI-03.5 (also needs SI-03.2, SI-03.3)
    └── SI-03.6 (also needs SI-03.2, SI-03.3)

SI-03.2 + SI-03.3 + SI-03.4
└── SI-03.5
    └── SI-03.8 (also needs SI-03.3)

SI-03.2 + SI-03.3
└── SI-03.7

SI-03.2 + SI-03.3 + SI-03.4
└── SI-03.6
```

Linearized implementation order: SI-03.1 → SI-03.2, SI-03.3, SI-03.4 (parallel) → SI-03.5 → SI-03.6, SI-03.7 (parallel) → SI-03.8

---

## Deliverables

- [ ] `@nestjs/bullmq` + BullMQ + Redis queue integration with exponential-backoff retry policy (3 attempts)
- [ ] `@aws-sdk/client-s3` StorageModule with multipart upload lifecycle (create / presign-part / complete / abort), ranged object retrieval, thumbnail put, and object deletion — MinIO compatible via path-style endpoint
- [ ] `Video` entity with `draft → queued → processing → ready | failed` status enum and migration
- [ ] nanoid `publicId` (21 chars) UNIQUE column on `videos` — collision-safe public URL identifier
- [ ] Upload API: `POST /videos/uploads` (initiate), `POST /videos/uploads/:videoId/parts` (sign-part), `POST /videos/uploads/:videoId/complete` (finalize + enqueue), `DELETE /videos/uploads/:videoId` (abort) — all auth-guarded, owner-checked
- [ ] `VideoProcessingProcessor` (BullMQ `WorkerHost`) — ffprobe duration extraction, ffmpeg thumbnail at 10% mark, thumbnail upload to MinIO, `READY` status on success, `FAILED` with `failureReason` after exhausted retries
- [ ] Dedicated `main.worker.ts` NestJS application context (no HTTP server) — `video-worker` Compose service with FFmpeg installed
- [ ] `GET /videos/:publicId/stream` — HTTP Range/206 partial-content progressive streaming, public for READY videos
- [ ] `GET /videos/:publicId/download` — `Content-Disposition: attachment` full-object download, public for READY videos
- [ ] `GET /videos/:publicId` — video metadata; READY publicly visible; owner sees any status; presigned `thumbnailUrl` included
- [ ] `minio` and `redis` services in Docker Compose; `minio-init` creates `streamtube` bucket on startup
- [ ] `Dockerfile.worker` — FFmpeg + ffprobe installed via apt; separate image from API
- [ ] `storage` and `queue` config namespaces (`registerAs`) with Joi validation — all service hosts use Docker Compose service names (`minio`, `redis`) as hosts, never `localhost`
- [ ] Domain exceptions for all video error cases (`VideoNotFoundException`, `VideoOwnershipException`, `VideoNotInDraftException`) handled by the existing `DomainExceptionFilter`
- [ ] All SI-03 tests pass (`docker compose exec nestjs-api npm test -- --runInBand`)
- [ ] E2E tests pass (`docker compose exec nestjs-api npm run test:e2e`)
- [ ] TypeScript compilation passes (`docker compose exec nestjs-api npx tsc --noEmit`)
- [ ] Project builds successfully (`docker compose exec nestjs-api npm run build`)
