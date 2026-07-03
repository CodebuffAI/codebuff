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

echo "[cloud-typecheck-setup] installing @codebuff/freebuff-web workspace deps..."
# @codebuff/sdk source-imports @codebuff/agent-runtime, @codebuff/llm-providers, and
# @codebuff/code-map via tsconfig path aliases (baseUrl mapping to their src/), not as
# package.json dependencies. bun's --filter dependency graph only follows declared
# package.json deps, so those three workspaces must be filtered in explicitly or their
# own node_modules (e.g. gpt-tokenizer for agent-runtime) never get installed and the
# sdk build fails with "Could not resolve" errors.
bun install \
  --filter '@codebuff/freebuff-web' \
  --filter '@codebuff/agent-runtime' \
  --filter '@codebuff/llm-providers' \
  --filter '@codebuff/code-map'

echo "[cloud-typecheck-setup] building @codebuff/sdk..."
(cd sdk && bun run build)

NEXT_ENV="$ROOT/freebuff/web/next-env.d.ts"
if [[ ! -f "$NEXT_ENV" ]]; then
  printf '/// <reference types="next" />\n/// <reference types="next/image-types/global" />\n' >"$NEXT_ENV"
fi

echo "[cloud-typecheck-setup] typechecking freebuff/web..."
# A filtered/hoisted install does not always create the local
# freebuff/web/node_modules/typescript symlink even though typescript is a declared
# devDependency there — fall back to the hoisted root copy if the local one is missing.
TSC_BIN="$ROOT/freebuff/web/node_modules/typescript/bin/tsc"
if [[ ! -f "$TSC_BIN" ]]; then
  TSC_BIN="$ROOT/node_modules/typescript/bin/tsc"
fi
if [[ ! -f "$TSC_BIN" ]]; then
  echo "error: could not find the typescript binary in freebuff/web/node_modules or root node_modules" >&2
  exit 1
fi
(cd freebuff/web && node --max-old-space-size=4096 "$TSC_BIN" --noEmit -p .)

echo "[cloud-typecheck-setup] done."
du -sh node_modules sdk/dist freebuff/web 2>/dev/null || true
