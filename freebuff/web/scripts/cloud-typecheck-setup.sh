#!/usr/bin/env bash
# Minimal Freebuff Web typecheck setup for Cloud sandboxes (no Next dev/build).
#
# Run from the repo root after a shallow clone, e.g.:
#   git clone --depth 1 --filter=blob:none --single-branch \
#     https://github.com/<org>/freebuff-private.git .
#   bash freebuff/web/scripts/cloud-typecheck-setup.sh
#
# Expected disk (approximate on a 6 GB Cloud VM):
#   shallow clone (blob filter)     ~80–150 MB
#   node_modules (filtered install) ~900 MB–1.4 GB
#   sdk/dist                        ~60 MB
#   total                           ~1.0–1.6 GB  (vs ~5+ GB full monorepo install)
#
# Does NOT run `next build` — no `.next` output is created.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"

if ! command -v bun >/dev/null 2>&1; then
  echo "error: bun is required (install via golden snapshot or https://bun.sh)" >&2
  exit 1
fi

echo "[cloud-typecheck-setup] installing @codebuff/freebuff-web workspace deps only..."
bun install --filter '@codebuff/freebuff-web'

echo "[cloud-typecheck-setup] building @codebuff/sdk..."
(cd sdk && bun run build)

NEXT_ENV="$ROOT/freebuff/web/next-env.d.ts"
if [[ ! -f "$NEXT_ENV" ]]; then
  printf '/// <reference types="next" />\n/// <reference types="next/image-types/global" />\n' >"$NEXT_ENV"
fi

echo "[cloud-typecheck-setup] typechecking freebuff/web..."
(cd freebuff/web && node --max-old-space-size=4096 ./node_modules/typescript/bin/tsc --noEmit -p .)

echo "[cloud-typecheck-setup] done."
du -sh node_modules sdk/dist freebuff/web 2>/dev/null || true
