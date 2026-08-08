#!/usr/bin/env bash
# Start Next.js dev server inside Docker with MSW for Playwright E2E.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/next-frontend"

docker compose up -d --force-recreate

echo "Waiting for http://localhost:3001/login ..."
for i in $(seq 1 60); do
  code=$(curl -m 3 -s -o /dev/null -w "%{http_code}" http://localhost:3001/login 2>/dev/null || true)
  if [ "$code" = "200" ]; then
    echo "Dev server ready."
    exit 0
  fi
  sleep 2
done

echo "Dev server did not become ready in time. Check: docker compose logs next-frontend"
exit 1
