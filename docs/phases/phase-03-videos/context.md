---
kind: phase
name: phase-03-videos
sources_mtime:
  docs/project-plan.md: "2026-08-07T18:28:32.078870-04:00"
  docs/decisions/technical-decisions-phase-03-videos.md: "2026-08-07T18:52:21.605741-04:00"
  docs/phases/phase-01-configuracao-base/context.md: "2026-08-07T18:28:32.076884-04:00"
  docs/phases/phase-02-auth/context.md: "2026-08-07T18:28:32.078445-04:00"
  docs/phases/phase-02-auth-frontend/context.md: "2026-08-07T18:28:32.077460-04:00"
  .claude/skills/testing-guide-nestjs-project/SKILL.md: "2026-08-07T18:28:32.020560-04:00"
  docs/phases/phase-03-videos/library-refs.md: "2026-08-07T18:52:48.113425-04:00"
---

# phase-03-videos — Context

## Scope

**Phase name:** Fase 03 — Upload e Processamento de Vídeos

**Capabilities** (literal, `docs/project-plan.md`):

- Serviço de armazenamento de arquivos (vídeos e thumbnails)
- Serviço de processamento em segundo plano (filas)
- Upload de vídeos com suporte a arquivos de até 10GB sem impacto na performance
- Pré-cadastro automático do vídeo como rascunho ao iniciar o upload
- Processamento automático do vídeo após upload (extração de duração e metadados)
- Geração automática de thumbnail a partir de um frame do vídeo
- URL única por vídeo, sem conflito com outros vídeos
- Reprodução via streaming (sem necessidade de download completo)
- Download do vídeo pelo usuário

**Out of scope:** Gerenciamento de metadados editáveis (título/descrição/categoria/thumbnail customizada), publicação/visibilidade, painel do canal, player de UI — Fase 04+. Interface de upload/vídeo no `next-frontend/` fora do escopo desta entrega (backend-only).

**Deliverables:** upload de até 10GB funcional, processamento automático do vídeo, streaming funcionando, URLs únicas geradas.

**Affected subprojects:** `nestjs-project/`

**Deferred subprojects:** `next-frontend/` — UI de upload/reprodução fica para fase futura; contratos Cross-layer (upload multipart, stream/download) já decididos nesta fase.

**Sequencing notes:** Depende de: Fase 01, Fase 02

**Neighbors (for boundary detection only):**

- **Phase 02:** Cadastro, Login e Gerenciamento de Conta
- **Phase 04:** Gerenciamento de Vídeos e Canal

## Decisions Index

| Ref | Source | Scope | Topic | Status | Decision | Libraries |
|-----|--------|-------|-------|--------|----------|-----------|
| phase-03-videos/TD-01 | phase | Backend | Message Queue Technology | decided | A | @nestjs/bullmq@^11.x, bullmq@^5.x |
| phase-03-videos/TD-02 | phase | Cross-layer | Large-File Upload Strategy (≤10GB) | decided | A | @aws-sdk/client-s3@^3.x, @aws-sdk/s3-request-presigner@^3.x |
| phase-03-videos/TD-03 | phase | Backend | Object Storage Client and Key Layout | decided | A | @aws-sdk/client-s3@^3.x, @aws-sdk/s3-request-presigner@^3.x |
| phase-03-videos/TD-04 | phase | Repo-wide | Video Worker Topology | decided | A | — |
| phase-03-videos/TD-05 | phase | Backend | Media Metadata and Thumbnail Extraction | decided | A | fluent-ffmpeg@^2.x, @types/fluent-ffmpeg@^2.x |
| phase-03-videos/TD-06 | phase | Backend | Unique Public Video Identifier (URL slug) | decided | A | nanoid@^5.x |
| phase-03-videos/TD-07 | phase | Cross-layer | Streaming and Download Delivery | decided | A | — |
| phase-03-videos/TD-08 | phase | Backend | Video Status Lifecycle and Processing Failure Handling | decided | A | — |

_Source files:_

- phase-03-videos — `docs/decisions/technical-decisions-phase-03-videos.md` (scope_type: phase, related_phases: [3])

## Capability Coverage

| Capability (from project-plan.md) | Covered by |
|-----------------------------------|------------|
| Serviço de armazenamento de arquivos (vídeos e thumbnails) | phase-03-videos/TD-03 |
| Serviço de processamento em segundo plano (filas) | phase-03-videos/TD-01, phase-03-videos/TD-04 |
| Upload de vídeos com suporte a arquivos de até 10GB sem impacto na performance | phase-03-videos/TD-02 |
| Pré-cadastro automático do vídeo como rascunho ao iniciar o upload | phase-03-videos/TD-08 |
| Processamento automático do vídeo após upload (extração de duração e metadados) | phase-03-videos/TD-05, phase-03-videos/TD-08 |
| Geração automática de thumbnail a partir de um frame do vídeo | phase-03-videos/TD-05 |
| URL única por vídeo, sem conflito com outros vídeos | phase-03-videos/TD-06 |
| Reprodução via streaming (sem necessidade de download completo) | phase-03-videos/TD-07 |
| Download do vídeo pelo usuário | phase-03-videos/TD-07 |

## Decisions Detail

### phase-03-videos/TD-01

**Recommendation:** NestJS documents BullMQ as the active queue integration; job retries and concurrency fit FFmpeg workloads; Redis in Compose is the smallest broker that still matches the architecture’s dedicated queue container.
**Libraries:** `@nestjs/bullmq@^11.x`, `bullmq@^5.x`

### phase-03-videos/TD-02

**Recommendation:** Keeps the API off the data path, uses MinIO’s native multipart API, and satisfies the 10GB / non-blocking requirement with resumability at part boundaries.
**Libraries:** `@aws-sdk/client-s3@^3.x`, `@aws-sdk/s3-request-presigner@^3.x`

### phase-03-videos/TD-03

**Recommendation:** Portable S3 client, sufficient isolation via key prefixes, minimal Compose config.
**Libraries:** `@aws-sdk/client-s3@^3.x`, `@aws-sdk/s3-request-presigner@^3.x`

### phase-03-videos/TD-04

**Recommendation:** Aligns with the architecture diagram, isolates FFmpeg load, and reuses Nest modules/TypeORM.
**Libraries:** —

### phase-03-videos/TD-05

**Recommendation:** Required format coverage and thumbnail generation; matches the documented Video Worker.
**Libraries:** `fluent-ffmpeg@^2.x`, `@types/fluent-ffmpeg@^2.x`

### phase-03-videos/TD-06

**Recommendation:** Short, opaque, collision-safe public ids independent of mutable titles.
**Libraries:** `nanoid@^5.x`

### phase-03-videos/TD-07

**Recommendation:** Satisfies streaming and download with authz control and no HLS complexity; acceptable bandwidth trade-off for the course stack. (Presigned redirect can be revisited if API bandwidth becomes a bottleneck.)
**Libraries:** —

### phase-03-videos/TD-08

**Recommendation:** Matches the required draft pre-registration, makes async stages observable, and defines failure as a first-class terminal state.
**Libraries:** —

## Inherited Decisions Detail

### phase-01-configuracao-base/TD-01

**Recommendation:** Option A (@nestjs/config) — Official, core-team-maintained, guaranteed NestJS 11 compatibility. The `registerAs()` factory pattern solves the TypeORM CLI sharing problem.
**Libraries:** `@nestjs/config@^4.x`

### phase-01-configuracao-base/TD-02

**Recommendation:** Option A (Joi) — First-class integration with `@nestjs/config` via `validationSchema`, requiring zero custom wiring.
**Libraries:** `joi@^17.x`

### phase-01-configuracao-base/TD-03

**Recommendation:** Option B (Namespaced/grouped with registerAs) — Clear file boundaries per domain, typed injection via `ConfigType<typeof xxxConfig>`, natural scalability.
**Libraries:** —

### phase-01-configuracao-base/TD-04

**Recommendation:** Option A (Shared registerAs factory) — `data-source.ts` imports the factory, calls `dotenv.config()`, then calls the factory. Zero duplication.
**Libraries:** `dotenv` (transitive via `@nestjs/config`)

### phase-02-auth/TD-01

**Recommendation:** Argon2id — OWASP-recommended; native build is a one-time Docker setup cost. OWASP minimum: 19MiB memory, 2 iterations.
**Libraries:** `argon2@^0.41.x`

### phase-02-auth/TD-02

**Recommendation:** Custom guards with `@nestjs/jwt` only (decision diverged from Passport recommendation) — smaller dependency surface.
**Libraries:** `@nestjs/jwt@^11.0.0`

### phase-02-auth/TD-03

**Recommendation:** Refresh Token Rotation stored in DB — theft detection; PostgreSQL already in stack.
**Libraries:** —

### phase-02-auth/TD-06

**Recommendation:** class-validator + class-transformer for request DTOs.
**Libraries:** `class-validator@^0.14.x`, `class-transformer@^0.5.x`

### phase-02-auth/TD-07

**Recommendation:** Custom Domain Exception Filter — `{ statusCode, error, message }` with domain codes.
**Libraries:** —

### phase-02-auth/TD-08

**Recommendation:** `@nestjs/throttler` for rate limiting.
**Libraries:** `@nestjs/throttler@^6.x`

## Inherited Conventions

- Backend config uses `@nestjs/config` with namespaced `registerAs(name, () => ({...}))` factories — one file per domain in `src/config/`. _(from phase 01)_
- Env variables are validated by a Joi schema in `src/config/env.validation.ts`, passed to `ConfigModule.forRoot({ validationSchema, validationOptions: { allowUnknown: true, abortEarly: false } })`. _(from phase 01)_
- Config is injected into modules via `ConfigType<typeof xxxConfig>` and `@Inject(xxxConfig.KEY)`; the same factory is importable as a plain function for non-DI contexts (e.g., TypeORM CLI). _(from phase 01)_
- `data-source.ts` loads `.env` via `import 'dotenv/config'` at the top, then imports `databaseConfig` and calls it as a plain function. _(from phase 01)_
- Database connection parameters are sourced from a single `databaseConfig` factory — never duplicated between `AppModule` and `data-source.ts`. _(from phase 01)_
- `TypeOrmModule.forRootAsync` is used (not `forRoot`), with `autoLoadEntities: true`, `synchronize: false`. _(from phase 01)_
- Services throw domain exceptions; exception filters map them to HTTP responses. _(from phase 02)_
- Auth uses global JWT guard with `@Public()` opt-out; channels are 1:1 with users. _(from phase 02)_
- Repository pattern and module boundaries follow NestJS best-practices (single responsibility per module). _(from phase 02)_

## Inherited Deferred Capabilities

| Capability | Status | Origin phase | Rationale |
|-----------|--------|--------------|-----------|
| Telas de frontend | deferred | phase-01-configuracao-base | `next-frontend/` UI surfaces start in a later phase. |
| Telas de cadastro, login, confirmação de conta e recuperação de senha | deferred | phase-02-auth | Covered by phase-02-auth-frontend; remaining confirmation/reset destination gaps deferred. |
| "Confirmação de conta via e-mail com link de ativação" (UI landing) | deferred | phase-02-auth-frontend | UI landing screen de-scoped; BE side unchanged. |
| "Logout" (chrome button) | deferred | phase-02-auth-frontend | Logout button lives in authenticated chrome (typically Phase 04). |
| "Recuperação de senha (destination screen / set-new-password)" | deferred | phase-02-auth-frontend | Reset-password destination screen absent from Figma at phase-02-auth-frontend ship. |

## Non-UI / Deferred Capabilities

| Capability | Status | Rationale | TD refs |
|------------|--------|-----------|---------|
| Interface de upload / player de vídeo no `next-frontend/` | deferred | Backend-only delivery for Phase 03 challenge; Cross-layer contracts (TD-02, TD-07) are decided for a future FE phase. | phase-03-videos/TD-02, phase-03-videos/TD-07 |
| Edição de título/descrição/categoria/thumbnail customizada, publicação e painel do canal | deferred | Owned by Fase 04 — Gerenciamento de Vídeos e Canal. | — |
| Transcoding HLS/DASH / adaptive bitrate | deferred | Out of Phase 03 deliverables; streaming via progressive Range/206 (TD-07). | phase-03-videos/TD-07 |

## Testing Requirements

Refer to the `testing-guide-nestjs-project` Skill for layer requirements per artifact type in `nestjs-project/`.

| Artifact created | Required tests |
|---|---|
| Entity (`*.entity.ts`) | Integration: constraints, defaults |
| Service with branching + DB | Unit (mock repo) + Integration (DB contract) |
| Service with side-effect dep (storage, queue) | Integration: real MinIO / Redis+BullMQ where Compose provides them |
| Module with configured imports | Unit: compilation test |
| Controller | E2E only (supertest) — no controller unit tests |
| DTO | E2E: one validation wiring test per endpoint |
| Guard (ownership) | E2E (+ Unit if complex) |
| Exception Filter mappings | Unit + E2E |

Phase 03 adds storage, queue, worker, and Range streaming — exercise real Compose services in integration/e2e; do not mock what Compose can run. Specific layer coverage by SI is recorded in `progress.md`.
