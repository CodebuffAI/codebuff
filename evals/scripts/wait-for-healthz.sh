#!/usr/bin/env bash
set -euo pipefail
URL="${1:?Missing URL}"
TIMEOUT="${2:-60}"
DEBUG_EVALS="${DEBUG_EVALS:-0}"
for i in $(seq 1 "$TIMEOUT"); do
  if curl -fsS "$URL" >/dev/null 2>&1; then
    exit 0
  fi
  echo "waiting for backend... ($i s)"
  # Add: when debugging, show HTTP status code to distinguish net vs app errors
  if [[ "$DEBUG_EVALS" == "1" ]]; then
    code=$(curl -s -o /dev/null -w "%{http_code}" "$URL" || echo "000")
    echo "healthz status: $code"
  fi
  sleep 1
done
echo "backend healthz did not become ready in $TIMEOUT seconds" >&2
exit 1
