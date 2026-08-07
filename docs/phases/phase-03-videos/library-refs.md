---
libs:
  "@nestjs/bullmq":
    version: "^11.x"
    context7_id: "/nestjs/docs.nestjs.com/techniques/queues"
    fetched_at: "2026-08-07T18:55:00-04:00"
  bullmq:
    version: "^5.x"
    context7_id: "/taskforcesh/bullmq"
    fetched_at: "2026-08-07T18:55:00-04:00"
  "@aws-sdk/client-s3":
    version: "^3.x"
    context7_id: "/aws/aws-sdk-js-v3"
    fetched_at: "2026-08-07T18:55:00-04:00"
  "@aws-sdk/s3-request-presigner":
    version: "^3.x"
    context7_id: "/aws/aws-sdk-js-v3"
    fetched_at: "2026-08-07T18:55:00-04:00"
  nanoid:
    version: "^5.x"
    context7_id: "/ai/nanoid"
    fetched_at: "2026-08-07T18:55:00-04:00"
  fluent-ffmpeg:
    version: "^2.x"
    context7_id: "/fluent-ffmpeg/node-fluent-ffmpeg"
    fetched_at: "2026-08-07T18:55:00-04:00"
sources_mtime:
  docs/decisions/technical-decisions-phase-03-videos.md: "2026-08-07T18:52:00-04:00"
---

# phase-03-videos — Library References

Distilled docs for libraries decided in this slice. Context7 MCP was unavailable in the authoring environment; APIs were cross-checked against NestJS Queues docs, AWS SDK v3 S3 docs, npm package metadata, and fluent-ffmpeg README. Re-fetch via `/plan-resolve` when connectivity to Context7 is restored if deeper snippets are needed.

## @nestjs/bullmq + bullmq

**Versions:** `@nestjs/bullmq@^11.x` (peer: NestJS 10|11, `bullmq` ^3–^6), `bullmq@^5.x` (pin within peer range; ^5 is the stable line widely used with Nest 11).

**Install:** `npm i --save @nestjs/bullmq bullmq`

**Root registration:**

```typescript
BullModule.forRootAsync({
  inject: [redisConfig.KEY],
  useFactory: (redis: ConfigType<typeof redisConfig>) => ({
    connection: { host: redis.host, port: redis.port },
  }),
});

BullModule.registerQueue({ name: 'video-processing' });
```

**Producer (API):** inject `@InjectQueue('video-processing') queue: Queue`, then `queue.add('process-video', { videoId }, { attempts: 3, backoff: { type: 'exponential', delay: 2000 } })`.

**Consumer (worker):** `@Processor('video-processing')` class with `@Process('process-video')` (or BullMQ WorkerHost `process(job)` depending on `@nestjs/bullmq` API for v11 — prefer `WorkerHost` + `process(job: Job<{ videoId: string }>)` as documented for BullMQ package).

**Compose:** Redis service name `redis`, host env `REDIS_HOST=redis`, port `6379`. Never `localhost` inside containers.

## @aws-sdk/client-s3 + @aws-sdk/s3-request-presigner

**Versions:** `^3.x` for both.

**Client (MinIO-compatible):**

```typescript
new S3Client({
  region: config.region,
  endpoint: config.endpoint, // e.g. http://minio:9000
  forcePathStyle: true,
  credentials: { accessKeyId, secretAccessKey },
});
```

**Multipart flow:** `CreateMultipartUpload` → per-part `UploadPart` via `getSignedUrl(client, new UploadPartCommand(...), { expiresIn })` → `CompleteMultipartUpload` with part ETags → optional `AbortMultipartUpload`.

**Ranged read:** `GetObjectCommand` with `Range: 'bytes=start-end'`. Response streams `Body`; map to HTTP 206 + `Content-Range` / `Accept-Ranges: bytes`.

**Keys:** `videos/{videoId}/original`, `videos/{videoId}/thumbnail.jpg` in bucket `streamtube` (configurable via env).

## nanoid

**Version:** `^5.x` (ESM-first; Nest/ts-jest may need `nanoid` import style compatible with project module settings — use default `import { nanoid } from 'nanoid'`).

**Usage:** `publicId = nanoid(11)` on draft creation; DB `UNIQUE` on `public_id`; retry once on rare collision.

## fluent-ffmpeg

**Version:** `^2.x` + `@types/fluent-ffmpeg@^2.x`. Requires system `ffmpeg` and `ffprobe` binaries in the **worker** image (not required on API image).

**ffprobe:** `ffprobe(pathOrUrl, (err, data) => …)` → `data.format.duration`, format/tags as needed.

**Thumbnail:** `ffmpeg(input).screenshots({ count: 1, timemarks: ['1'], filename: 'thumb.jpg', folder: tmpDir })` then upload file to S3 and delete temp files.

**Worker packaging:** Dockerfile based on Node + `apt-get install -y ffmpeg` (or equivalent).
