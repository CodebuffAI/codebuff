#!/usr/bin/env bash
# Remove large, reproducible build artifacts from a Cloud sandbox workspace.
# Safe to run after `next build`, failed builds, or before disk-heavy agent work.
#
# Usage (from repo root):
#   bash freebuff/web/scripts/prune-sandbox-artifacts.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"

prune_path() {
  local path="$1"
  if [[ -e "$path" ]]; then
    rm -rf "$path"
    echo "[prune-sandbox-artifacts] removed $path"
  fi
}

prune_path "$ROOT/freebuff/web/.next"
prune_path "$ROOT/web/.next"
prune_path "$ROOT/node_modules/.cache"
prune_path "$ROOT/.turbo"

find "$ROOT" -name '*.tsbuildinfo' -not -path '*/node_modules/*' -delete 2>/dev/null || true
find "$ROOT" -type d -name '.next' -not -path '*/node_modules/*' -prune -exec rm -rf {} + 2>/dev/null || true

echo "[prune-sandbox-artifacts] done."
df -h "$ROOT" 2>/dev/null | tail -1 || true
