# Deploy — StreamTube

Guia mínimo para subir o projeto em ambiente de produção ou homologação.

## Pré-requisitos

- Docker e Docker Compose
- Variáveis de ambiente configuradas (ver `.env.example` em cada subprojeto)
- Migrations aplicadas no banco (`npm run migration:run` no container da API)

## Serviços necessários

| Serviço | Função |
|---------|--------|
| PostgreSQL | Dados da aplicação |
| Redis | Fila BullMQ (`video-processing`) |
| MinIO ou S3 | Vídeos e thumbnails |
| SMTP | E-mails transacionais |
| NestJS API | Backend REST |
| Video Worker | FFmpeg + consumo da fila |
| Next.js | Frontend + BFF |

## Rede Docker

Em produção, use **nomes de serviço Compose** como hosts:

- API → `DB_HOST=db`, `REDIS_HOST=redis`, `S3_ENDPOINT=http://minio:9000`
- Frontend → `API_URL=http://nestjs-api:3000`

Nunca use `localhost` para comunicação entre containers.

## Build de produção

### Backend

```bash
cd nestjs-project
docker compose exec nestjs-api npm run build
docker compose exec nestjs-api node dist/main.js
```

Worker:

```bash
docker compose exec video-worker node dist/main.worker.js
```

### Frontend

```bash
cd next-frontend
docker compose exec next-frontend npm run build
docker compose exec next-frontend npm run start
```

A aplicação escuta na porta `3000` dentro do container (mapeie para `3001` no host em dev).

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
