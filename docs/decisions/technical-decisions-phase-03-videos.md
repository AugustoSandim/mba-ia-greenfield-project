---
scope_type: phase
related_phases: [3]
status: decided
date: 2026-08-07
scope_description: "Backend upload and video processing: object-storage usage, queue/worker, 10GB upload strategy, unique URLs, streaming/download, status lifecycle, and FFmpeg-based metadata/thumbnail extraction."
---

# Technical Decisions — Phase 03: Upload e Processamento de Vídeos

_Subprojects in scope:_

- `nestjs-project/` — delivers object storage (MinIO/S3), message queue, video worker, videos module (entity/migration/API), upload orchestration, streaming/download endpoints, and Compose infra for storage + queue + worker.
- `next-frontend/` — Frontend video UI is out of scope for this phase (challenge: backend-only delivery). Upload/stream contracts are still decided here as Cross-layer so a later frontend phase can consume them without reopening the handshake. No frontend TD in this document beyond those contracts.

---

## TD-01: Message Queue Technology

**Scope:** Backend

**Capability:** Serviço de processamento em segundo plano (filas)

**Context:** The architecture diagram leaves the message queue as TBD. Phase 03 requires asynchronous video processing so FFmpeg work never blocks the API. The queue choice adds Compose services, NestJS integration, and the worker consumption model. Stack today is NestJS 11 + TypeORM + PostgreSQL only — no Redis or AMQP broker yet.

**Options:**

### Option A: BullMQ + Redis (`@nestjs/bullmq`)
- NestJS-official queue package (`@nestjs/bullmq` + `bullmq`) backed by Redis. Jobs are first-class (retries, backoff, concurrency, stalled-job recovery). API publishes; a separate Nest process consumes with `@Processor`.
- **Pros:** First-class NestJS docs; built-in job lifecycle (retry, concurrency limits for CPU-heavy FFmpeg); Redis is lightweight in Compose; Node-only stack matches the monorepo; widely used for media pipelines.
- **Cons:** Adds Redis as new infra. Redis is not a full AMQP broker — complex routing/exchanges are weaker than RabbitMQ. Jobs are Node.js-centric (fine here; worker is Node + FFmpeg).

### Option B: RabbitMQ (`@nestjs/microservices` / amqplib)
- Standalone AMQP broker. API publishes messages; worker consumes via Nest microservices or a dedicated consumer. Language-agnostic.
- **Pros:** Strong durability and routing (exchanges, DLX). Polyglot-ready if a non-Node worker appears later. Mature ops tooling.
- **Cons:** Heavier Compose footprint and ops surface for a single NestJS consumer. Nest job semantics (retry/backoff/concurrency) require more manual wiring than BullMQ. Overkill for one video-processing job type.

### Option C: PostgreSQL-backed job table (SKIP LOCKED / custom poller)
- Store jobs in a `video_jobs` table; worker polls with `FOR UPDATE SKIP LOCKED`. No extra broker.
- **Pros:** Zero new infra beyond Postgres already in stack. Simple mental model.
- **Cons:** Reimplements queue semantics (retry, backoff, stalled jobs, concurrency). Diverges from NestJS queue docs. Harder to scale workers cleanly; not what the C4 diagram’s “Message Queue” container implies.

**Recommendation:** **Option A (BullMQ + Redis)** — NestJS documents BullMQ as the active queue integration; job retries and concurrency fit FFmpeg workloads; Redis in Compose is the smallest broker that still matches the architecture’s dedicated queue container.

**Decision:** A (BullMQ + Redis)

**Libraries:** `@nestjs/bullmq@^11.x`, `bullmq@^5.x`

---

## TD-02: Large-File Upload Strategy (≤10GB)

**Scope:** Cross-layer

**Capability:** Upload de vídeos com suporte a arquivos de até 10GB sem impacto na performance

**Context:** Passing a 10GB body through Nest/Express saturates API memory/bandwidth and fails the acceptance criterion (“sem travar a API”). The plan also requires resume-friendly uploads on flaky connections. Object storage is fixed as S3-compatible (MinIO locally).

**Options:**

### Option A: Presigned S3 multipart upload (client → MinIO/S3 direct)
- API creates a draft video row, starts `CreateMultipartUpload`, returns part presigned URLs (or a sign-part endpoint). Client PUTs parts directly to storage; API calls `CompleteMultipartUpload` and enqueues processing. Bytes never traverse the Nest process.
- **Pros:** API stays lightweight; native MinIO/S3 multipart (parts ≥5MB, parallel uploads, resume at part boundary); matches “upload direto ao storage”; AWS SDK v3 works against MinIO.
- **Cons:** More API surface (initiate / sign-part / complete / abort). Requires CORS on the bucket for browser clients (relevant when frontend arrives). Part-boundary resume (not byte-precise).

### Option B: Multipart POST through the API (multer / busboy streaming to S3)
- Client uploads to Nest; Nest streams the body to S3 without buffering the full file.
- **Pros:** Simpler client (single POST). No bucket CORS for browsers.
- **Cons:** Every byte still hits the API — network and connection slots scale with upload traffic; long-lived connections risk timeouts; fails the spirit of “sem travar o sistema” under concurrent 10GB uploads.

### Option C: tus protocol (tusd or Nest tus server → S3)
- Open resumable protocol with byte-offset resume; can stream into S3 multipart via a tus server.
- **Pros:** Best resume UX on unstable networks; storage-agnostic protocol.
- **Cons:** Extra service/protocol surface (tusd Companion or custom); heavier than needed for a backend-first phase where S3 multipart already resumes at part boundaries; frontend not in this phase to justify tus client complexity.

**Recommendation:** **Option A (Presigned S3 multipart)** — Keeps the API off the data path, uses MinIO’s native multipart API, and satisfies the 10GB / non-blocking requirement with resumability at part boundaries.

**Decision:** A (Presigned S3 multipart)

**Libraries:** `@aws-sdk/client-s3@^3.x`, `@aws-sdk/s3-request-presigner@^3.x`

---

## TD-03: Object Storage Client and Key Layout

**Scope:** Backend

**Capability:** Serviço de armazenamento de arquivos (vídeos e thumbnails)

**Context:** Storage technology is decided (S3-compatible; MinIO in Compose). Remaining choices: SDK, bucket organization, and object key scheme used by API, worker, streaming, and download.

**Options:**

### Option A: AWS SDK v3 (`@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`) + single bucket, prefixed keys
- One bucket (e.g. `streamtube`). Keys: `videos/{videoId}/original`, `videos/{videoId}/thumbnail.jpg`. Path-style endpoint for MinIO. Same code path swaps to AWS S3 in production via env.
- **Pros:** Official S3 API; first-class presigning; MinIO-compatible; simple ops (one bucket); keys colocated by video id.
- **Cons:** Bucket policies must distinguish public vs private prefixes carefully if mixed access is needed later.

### Option B: Two buckets (videos + thumbnails)
- Separate buckets for originals and thumbnails, possibly different ACLs/CDN rules.
- **Pros:** Cleaner ACL/CDN separation in production.
- **Cons:** Extra Compose/env surface for little gain in Phase 03; thumbnails and videos always share the same lifecycle here.

### Option C: MinIO-specific SDK / mc client wrappers
- Use MinIO’s own JS client instead of AWS SDK.
- **Pros:** MinIO-native APIs.
- **Cons:** Weaker production portability to AWS S3; diverges from the project’s “S3-compatible” framing.

**Recommendation:** **Option A (AWS SDK v3 + single bucket + prefixed keys)** — Portable S3 client, sufficient isolation via key prefixes, minimal Compose config.

**Decision:** A (AWS SDK v3 + single bucket + prefixed keys)

**Libraries:** `@aws-sdk/client-s3@^3.x`, `@aws-sdk/s3-request-presigner@^3.x`

---

## TD-04: Video Worker Topology

**Scope:** Repo-wide

**Capability:** Serviço de processamento em segundo plano (filas)

**Context:** The C4 diagram shows a separate Video Worker container that consumes the queue, reads/writes storage, and updates the DB. How that process is packaged affects Compose, Dockerfiles, and shared Nest modules.

**Options:**

### Option A: Separate NestJS application entrypoint in the same repo (`video-worker` Compose service)
- Shared `src/` libraries (TypeORM entities, storage module, config). Distinct `main.worker.ts` that boots only queue processors + DB + S3 — no HTTP server. Own Dockerfile/image with FFmpeg installed.
- **Pros:** Matches C4; API and worker scale independently; FFmpeg/CPU load isolated from request handling; reuses Nest DI and entities.
- **Cons:** Second Node process to build/run/test; must keep shared modules free of API-only coupling.

### Option B: Same NestJS process as the API (`@Processor` in-process)
- API container also runs BullMQ workers.
- **Pros:** One deployable; simpler Compose.
- **Cons:** FFmpeg CPU/memory contends with HTTP; contradicts the dedicated worker container in the architecture; harder to scale processing alone.

### Option C: Sidecar shell/Python worker outside Nest
- Non-Nest consumer calling FFmpeg and updating DB via raw SQL/SDK.
- **Pros:** Can optimize the worker language for media.
- **Cons:** Duplicates entity/config knowledge; breaks Nest consistency; more integration surface for a Nest-centric course project.

**Recommendation:** **Option A (separate Nest worker entrypoint + Compose service)** — Aligns with the architecture diagram, isolates FFmpeg load, and reuses Nest modules/TypeORM.

**Decision:** A (Separate Nest worker + Compose service)

---

## TD-05: Media Metadata and Thumbnail Extraction

**Scope:** Backend

**Capability:** Transversal — covers: "Processamento automático do vídeo após upload (extração de duração e metadados)", "Geração automática de thumbnail a partir de um frame do vídeo"

**Context:** After upload completes, the worker must extract duration/metadata and generate a thumbnail from a video frame. FFmpeg is the implied tool in the architecture; the binding style and packaging still need a choice.

**Options:**

### Option A: System FFmpeg/ffprobe via `fluent-ffmpeg` (or thin spawn wrapper)
- Worker image installs `ffmpeg`/`ffprobe`. Node calls ffprobe for duration/format; ffmpeg extracts a frame (e.g. at 1s or 10% of duration) to JPEG, uploads to storage, updates DB.
- **Pros:** Industry standard for video; extracts duration + thumbnail in one toolchain; `fluent-ffmpeg` is common in Node; matches architecture label “FFmpeg”.
- **Cons:** Native binary in the worker image; must pin ffmpeg version in Dockerfile; heavier image.

### Option B: Pure JS media parsers (e.g. `mp4box.js`) + `sharp` for images
- Parse containers in JS; no FFmpeg binary.
- **Pros:** Smaller image; no native binary.
- **Cons:** Weak format coverage vs real uploads (mkv, mov, webm, etc.); thumbnail-from-frame still needs a decoder — effectively incomplete without FFmpeg.

### Option C: External SaaS transcoder (Mux, AWS MediaConvert)
- Offload processing to a cloud API.
- **Pros:** No local FFmpeg ops.
- **Cons:** Out of scope for local Docker-first course stack; cost and external dependency; contradicts self-hosted worker in the diagram.

**Recommendation:** **Option A (FFmpeg/ffprobe in the worker image)** — Required format coverage and thumbnail generation; matches the documented Video Worker.

**Decision:** A (FFmpeg/ffprobe in the worker image)

**Libraries:** `fluent-ffmpeg@^2.x`, `@types/fluent-ffmpeg@^2.x`

---

## TD-06: Unique Public Video Identifier (URL slug)

**Scope:** Backend

**Capability:** URL única por vídeo, sem conflito com outros vídeos

**Context:** Each video needs a stable public identifier for URLs (watch/stream/download) that never collides. Internal UUID primary keys may exist separately; the public id is what appears in routes.

**Options:**

### Option A: Nanoid (URL-safe, ~11 chars) with unique DB constraint
- Generate `publicId` with `nanoid` on draft creation; `UNIQUE` column. Retry on rare collision. Routes use `/videos/:publicId/...`.
- **Pros:** Short YouTube-like URLs; high entropy; no sequential leakage; trivial uniqueness via DB constraint.
- **Cons:** Extra dependency (`nanoid`); theoretical collision requires retry (negligible at 11+ chars).

### Option B: UUID v4 as the public id
- Use the row UUID directly in URLs.
- **Pros:** No extra lib; uniqueness guaranteed.
- **Cons:** Long, ugly URLs; exposes internal id shape.

### Option C: Human slug from title + numeric suffix
- `my-vacation-trip` with collision suffixes.
- **Pros:** Readable URLs.
- **Cons:** Renames complicate stability; collision logic messier; Phase 04 owns title editing — public id should stay immutable from Phase 03.

**Recommendation:** **Option A (nanoid + UNIQUE constraint)** — Short, opaque, collision-safe public ids independent of mutable titles.

**Decision:** A (nanoid + UNIQUE constraint)

**Libraries:** `nanoid@^5.x`

---

## TD-07: Streaming and Download Delivery

**Scope:** Cross-layer

**Capability:** Transversal — covers: "Reprodução via streaming (sem necessidade de download completo)", "Download do vídeo pelo usuário"

**Context:** Clients must start playback without downloading the whole file, and also download the original. Delivery can go through the API or straight to storage. Anonymous watch is a platform requirement (project overview); Phase 03 must not require a full-file download for playback.

**Options:**

### Option A: API proxy with HTTP Range (206 Partial Content) + separate download endpoint
- `GET /videos/:publicId/stream` reads from MinIO with ranged GetObject, forwards `Accept-Ranges` / `Content-Range`. `GET /videos/:publicId/download` streams full object with `Content-Disposition: attachment`. Auth: stream/download readable for ready videos per visibility rules (anonymous allowed for public/ready in later phases; Phase 03 can allow authenticated owner + public-ready as specified in the plan).
- **Pros:** Single origin for clients (no bucket CORS for playback); full control of authz; Range/206 is the standard progressive-download streaming model without HLS complexity.
- **Cons:** Media bytes flow through the API (bandwidth cost); must implement Range correctly.

### Option B: Redirect / presigned GET URLs to MinIO/S3
- API authorizes then returns 302 or JSON with a short-lived presigned URL; browser hits storage directly (Range supported by S3/MinIO).
- **Pros:** API off the media path for playback; excellent scalability.
- **Cons:** Bucket CORS and public URL exposure; harder uniform authz logging; frontend must handle storage host (still ok later).

### Option C: HLS/DASH packaging (FFmpeg → segments + playlist)
- Transcode to adaptive streaming.
- **Pros:** True adaptive bitrate.
- **Cons:** Far beyond Phase 03 scope (transcoding ladder, playlists, CDN); deliverables ask for streaming without full download, not ABR.

**Recommendation:** **Option A (API Range proxy + download endpoint)** — Satisfies streaming and download with authz control and no HLS complexity; acceptable bandwidth trade-off for the course stack. (Presigned redirect can be revisited if API bandwidth becomes a bottleneck.)

**Decision:** A (API Range/206 proxy + download endpoint)

---

## TD-08: Video Status Lifecycle and Processing Failure Handling

**Scope:** Backend

**Capability:** Transversal — covers: "Pré-cadastro automático do vídeo como rascunho ao iniciar o upload", "Processamento automático do vídeo após upload (extração de duração e metadados)"

**Context:** Upload starts with a draft row; after bytes land in storage, processing runs asynchronously; failures must be visible and safe to reason about. Status drives API guards (e.g. stream only when ready).

**Options:**

### Option A: Explicit status enum with terminal error + bounded retries
- States: `draft` (upload in progress / not completed) → `queued` (multipart completed, job enqueued) → `processing` → `ready` | `failed`. BullMQ retries transient failures (e.g. 3 attempts, exponential backoff). After exhaustion, status=`failed` with `failureReason`. No auto-requeue without an explicit API action (out of scope unless needed).
- **Pros:** Clear UX/API contract; aligns with draft-on-start requirement; retries absorb flaky FFmpeg/storage blips; terminal `failed` is auditable.
- **Cons:** Slightly more states than a 3-value model; clients must handle `failed`.

### Option B: Minimal three-state model (`draft` → `processing` → `ready`/`error`) without queue distinction
- Collapse queued into processing; weaker separation between “upload done” and “worker started”.
- **Pros:** Fewer states.
- **Cons:** Harder to diagnose “job never picked up” vs “FFmpeg running”; weaker ops signals.

### Option C: Soft-delete + recreate on failure
- Delete failed rows and force re-upload.
- **Pros:** Simple DB.
- **Cons:** Loses failure diagnostics; poor UX; wastes uploaded storage until GC.

**Recommendation:** **Option A (draft → queued → processing → ready|failed + BullMQ bounded retries)** — Matches the required draft pre-registration, makes async stages observable, and defines failure as a first-class terminal state.

**Decision:** A (draft → queued → processing → ready|failed + bounded retries)

---

## Decisions Summary

| ID | Scope | Decision | Recommendation | Choice |
|----|-------|----------|----------------|--------|
| TD-01 | Backend | Message queue technology | A — BullMQ + Redis | **A** |
| TD-02 | Cross-layer | Large-file upload strategy | A — Presigned S3 multipart | **A** |
| TD-03 | Backend | Object storage client & key layout | A — AWS SDK v3 + single bucket | **A** |
| TD-04 | Repo-wide | Video worker topology | A — Separate Nest worker + Compose | **A** |
| TD-05 | Backend | Metadata & thumbnail extraction | A — FFmpeg/ffprobe in worker | **A** |
| TD-06 | Backend | Unique public video id | A — nanoid + UNIQUE | **A** |
| TD-07 | Cross-layer | Streaming & download delivery | A — API Range/206 + download | **A** |
| TD-08 | Backend | Status lifecycle & failure handling | A — draft→queued→processing→ready\|failed | **A** |
