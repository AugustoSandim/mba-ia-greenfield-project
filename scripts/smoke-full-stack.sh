#!/usr/bin/env bash
# Smoke test: full stack with real API (no MSW). Requires compose.full.yaml.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f nestjs-project/.env ]]; then
  echo "Copy nestjs-project/.env.example to nestjs-project/.env first."
  exit 1
fi

docker compose -f compose.full.yaml up -d

echo "Starting API..."
docker compose -f compose.full.yaml exec -d nestjs-api sh -c "npm run start:dev"
sleep 5

echo "Running migrations..."
docker compose -f compose.full.yaml exec -T nestjs-api npm run migration:run

echo "Starting worker..."
docker compose -f compose.full.yaml exec -d video-worker sh -c \
  "npx ts-node -r tsconfig-paths/register src/main.worker.ts"

echo "Starting frontend (real API, no MSW)..."
docker compose -f compose.full.yaml exec -d next-frontend sh -c \
  "API_URL=http://nestjs-api:3000 SESSION_PASSWORD=streamtube-session-password-123456789012 npm run dev"

for i in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/login 2>/dev/null || true)
  echo "frontend /login: $code"
  [ "$code" = "200" ] && break
  sleep 2
done

code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/categories 2>/dev/null || true)
echo "api /categories: $code"

if [ "$code" != "200" ]; then
  echo "API smoke check failed."
  exit 1
fi

echo "Smoke test OK — frontend http://localhost:3001, API http://localhost:3000"
