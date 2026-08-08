#!/usr/bin/env bash
# Run Playwright E2E from the correct package (avoids picking up Jest/Vitest files in the monorepo).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/next-frontend"

if [[ ! -d node_modules/@playwright/test ]]; then
  echo "Run: cd next-frontend && npm install"
  exit 1
fi

# Ensure Chromium is present for this @playwright/test version.
CHROMIUM_CACHE="$HOME/Library/Caches/ms-playwright"
if ! ls "$CHROMIUM_CACHE"/chromium_headless_shell-*/chrome-headless-shell-mac-arm64/chrome-headless-shell >/dev/null 2>&1; then
  echo "Installing Playwright Chromium (corporate TLS may require NODE_TLS_REJECT_UNAUTHORIZED=0)..."
  NODE_TLS_REJECT_UNAUTHORIZED=0 npx playwright install chromium
fi

# Ensure dev server is up (idempotent).
bash "$ROOT/scripts/start-e2e-dev.sh"

exec npx playwright test "$@"
