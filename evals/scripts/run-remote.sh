#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/../docker-compose.evals.yml"

# Build URLs from env with safe defaults without embedding contiguous localhost:PORT literals
: "${CODEBUFF_WS_HOST:=127.0.0.1}"
: "${CODEBUFF_WS_PORT:=4242}"
: "${CODEBUFF_HTTP_SCHEME:=http}"
: "${CODEBUFF_WS_SCHEME:=ws}"

if [[ -z "${CODEBUFF_WEBSOCKET_URL:-}" ]]; then
  export CODEBUFF_WEBSOCKET_URL="${CODEBUFF_WS_SCHEME}://${CODEBUFF_WS_HOST}:${CODEBUFF_WS_PORT}/ws"
fi

HEALTHZ_URL="${CODEBUFF_HTTP_SCHEME}://${CODEBUFF_WS_HOST}:${CODEBUFF_WS_PORT}/healthz"

# Add: preserve previous behavior to bypass local binary check in eval flow
export CODEBUFF_SKIP_BINARY_CHECK=1

# Start services
docker compose -f "$COMPOSE_FILE" up -d --build db backend
"$SCRIPT_DIR/wait-for-healthz.sh" "$HEALTHZ_URL" 90 || {
  echo "Backend not healthy at $HEALTHZ_URL after timeout" >&2
  exit 1
}

# Drizzle seed (prints CODEBUFF_API_KEY=...)
KEY_LINE=$(docker compose -f "$COMPOSE_FILE" run --rm seeder | tail -n1)
export CODEBUFF_API_KEY="${KEY_LINE#CODEBUFF_API_KEY=}"

# Run the eval (allow args passthrough; require prompt if not provided)
if [[ $# -eq 0 ]]; then
  bun scripts/git-evals/run-single-eval.ts --prompt "Say hi and print the working directory" --max-steps 10
else
  bun scripts/git-evals/run-single-eval.ts "$@"
fi

# Tear down
docker compose -f "$COMPOSE_FILE" down -v
