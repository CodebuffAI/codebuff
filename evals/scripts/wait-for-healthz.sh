#!/bin/bash
set -euo pipefail
URL="$1"; TIMEOUT="${2:-60}"
for i in $(seq 1 "$TIMEOUT"); do
  if curl -fsS "$URL" >/dev/null 2>&1; then exit 0; fi
  sleep 1
  echo "waiting for backend... ($i s)"
done
echo "backend healthz did not become ready in $TIMEOUT seconds" >&2
exit 1