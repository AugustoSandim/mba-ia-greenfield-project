# Deploy — StreamTube

Guia para subir o projeto em ambiente local integrado ou produção.

## Compose files

| Arquivo | Uso |
|---------|-----|
| `nestjs-project/compose.yaml` | Backend isolado (dev) |
| `next-frontend/compose.yaml` | Frontend isolado com MSW (dev/E2E) |
| `compose.full.yaml` | Stack completa local — frontend → API real |
| `compose.prod.yaml` | Imagens de produção (sem bind mounts) |

## Pré-requisitos

- Docker e Docker Compose
- Variáveis de ambiente configuradas (`nestjs-project/.env` a partir de `.env.example`)
- Migrations aplicadas no banco (`npm run migration:run` no container da API)

## Rede Docker

Em produção e no `compose.full.yaml`, use **nomes de serviço Compose** como hosts:

- API → `DB_HOST=db`, `REDIS_HOST=redis`, `STORAGE_ENDPOINT=minio`
- Frontend → `API_URL=http://nestjs-api:3000`

Nunca use `localhost` para comunicação entre containers.

## Desenvolvimento integrado (API real)

```bash
cp nestjs-project/.env.example nestjs-project/.env   # se ainda não existir
bash scripts/smoke-full-stack.sh
```

Frontend: http://localhost:3001 · API: http://localhost:3000 · Mailpit: http://localhost:8025

## E2E (MSW, sem API real)

```bash
bash scripts/run-e2e.sh
```

## Build de produção

```bash
docker compose -f compose.prod.yaml build
docker compose -f compose.prod.yaml up -d
docker compose -f compose.prod.yaml exec nestjs-api npm run migration:run
```

### Imagens individuais

- `nestjs-project/Dockerfile` — API (`node dist/main.js`)
- `nestjs-project/Dockerfile.worker` — worker FFmpeg (`node dist/main.worker.js`)
- `next-frontend/Dockerfile` — Next.js standalone (`output: 'standalone'`)

## OpenAPI

Após mudanças na API:

```bash
cd nestjs-project
docker compose exec nestjs-api npx ts-node src/openapi-export.ts

cd ..
bash scripts/sync-openapi.sh
cd next-frontend
docker compose exec next-frontend npm run openapi:types
```

## Checklist antes de ir ao ar

1. `npm run migration:run` (API)
2. Suite de testes backend e frontend verde
3. `npx tsc --noEmit` em ambos os subprojetos
4. Buckets S3/MinIO criados e credenciais configuradas
5. `SESSION_PASSWORD` com pelo menos 32 caracteres no frontend
6. JWT secrets e SMTP de produção definidos no backend
