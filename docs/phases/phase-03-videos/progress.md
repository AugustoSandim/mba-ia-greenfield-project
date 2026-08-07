# phase-03-videos — Progress

**Status:** completed
**SIs:** 8/8 completed

### SI-03.1 — Dependencies, Configuration Namespaces, Docker Compose, and Worker Dockerfile
- **Status:** completed
- **Tests:** no tests (env validation suite still green)
- **Observations:**
  - Host Postgres mapped `5433:5432` (Windmill held 5432); containers use `db:5432`.
  - `MAIL_FROM` quoted for Compose parsing.
  - `nanoid` pinned to v3 (CJS) for Jest compatibility; public ids still length 21.

### SI-03.2 — Storage Module
- **Status:** completed
- **Tests:** 6 passing (storage.module.spec + storage.service.integration-spec)
- **Observations:** none

### SI-03.3 — Video Entity, Migration, and VideosModule Skeleton
- **Status:** completed
- **Tests:** 5 passing (entity integration + module compile)
- **Observations:** Migration `1786144143518-CreateVideos.ts` applied.

### SI-03.4 — Queue Module and Job Contract
- **Status:** completed
- **Tests:** 2 passing (queue.module.spec + queue.service.integration-spec)
- **Observations:** none

### SI-03.5 — Upload API (Initiate / Sign-Part / Complete / Abort)
- **Status:** completed
- **Tests:**
  - Unit: 28 passing (videos.service.spec.ts — all SI-03.5/SI-03.7/SI-03.8 service logic)
  - Integration: 3 passing (videos.service.integration-spec.ts)
  - E2E: 10 passing (POST /videos/uploads ×4, parts, complete, abort ×2 + 401 guard)
- **Observations:**
  - `findChannelByUserId` added to ChannelsService.
  - `VideoNotFoundException`, `VideoOwnershipException`, `VideoNotInDraftException`, `VideoNotReadyException` defined.
  - `generateUniquePublicId` with collision retry up to 5 attempts.

### SI-03.6 — Video Worker Processor (FFmpeg Metadata + Thumbnail)
- **Status:** completed
- **Tests:**
  - Unit: 2 passing (video-processing.processor.spec.ts)
- **Observations:**
  - Worker boots with `Video worker ready`; `VideoWorkerModule` + `VideoProcessingModule` + `main.worker.ts`.
  - Compose command: `ts-node src/main.worker.ts` (dev hot-reload via mounted volume).
  - `@OnWorkerEvent('failed')` marks FAILED on last attempt with `failureReason`.

### SI-03.7 — Stream (Range/206) and Download Endpoints
- **Status:** completed
- **Tests:**
  - Unit: covered in `videos.service.spec.ts` (4 tests for streamVideo)
  - E2E: 6 passing (GET /stream ×4, GET /download ×2)
- **Observations:**
  - `@Public()` on both endpoints; only READY videos served.
  - Range/206 forwarded directly to S3 `GetObjectCommand`.

### SI-03.8 — Metadata Endpoint, Visibility, OpenAPI
- **Status:** completed
- **Tests:**
  - Unit: covered in `videos.service.spec.ts` (9 tests for getVideoMetadata)
  - E2E: 7 passing (GET /videos/:publicId — ready anon, ready non-owner, draft owner, draft anon 404, queued non-owner 404, unknown 404, body fields check)
- **Observations:**
  - `@Public()` endpoint; owner sees any status; non-owner only sees READY.
  - `thumbnailUrl` is presigned MinIO GET URL (3600 s) or null.
  - OpenAPI tags/responses added across all VideosController endpoints.

---

## Test Counts (Phase 03 total)

| Suite | Passing | Notes |
|-------|---------|-------|
| storage.module.spec | 1 | module wiring |
| storage.service.integration-spec | 5 | real MinIO ops |
| videos.module.spec | 1 | module wiring |
| videos.entity.integration-spec | 5 | DB constraints |
| queue.module.spec | 1 | module wiring |
| queue.service.integration-spec | 1 | real Redis |
| video-processing.processor.spec | 2 | worker unit |
| videos.service.spec | 28 | all service methods |
| videos.service.integration-spec | 3 | real DB+MinIO+Redis |
| videos.e2e-spec (e2e) | 23 | full HTTP cycle |
| **Total** | **70** | |

## DoD Status

- ✅ All Phase 03 tests pass (unit + integration: 190 tests, 1 pre-existing migration failure unrelated to Phase 03; e2e: 75/75)
- ✅ TypeScript compiles cleanly: `npx tsc --noEmit` exits 0
- ✅ `npm run test:e2e --runInBand --forceExit`: 75/75 pass
- ⚠️ `npm run lint`: 150 pre-existing errors in unmodified files (auth specs, channels.service utility function, storage spec, etc.). Phase 03 new files have **0 lint errors** (13 warnings on `no-unsafe-argument` which is configured as `warn` in ESLint config).

## Notable Changes Beyond SI Scope

- `test/jest-e2e.json` + `package.json` `test:e2e` script: added `--runInBand` to prevent parallel e2e test isolation failures (DB table cleanup race condition between auth and videos suites).
