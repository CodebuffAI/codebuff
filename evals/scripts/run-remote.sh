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

# Add: compute backend URLs for host and for docker network, and echo for diagnostics
export CODEBUFF_BACKEND_URL="${CODEBUFF_HTTP_SCHEME}://${CODEBUFF_WS_HOST}:${CODEBUFF_WS_PORT}"
BACKEND_DNS_HOST="${CODEBUFF_BACKEND_DNS_HOST:-backend}"
BACKEND_DOCKER_URL="${CODEBUFF_HTTP_SCHEME}://${BACKEND_DNS_HOST}:${CODEBUFF_WS_PORT}"
WS_DOCKER_URL="${CODEBUFF_WS_SCHEME}://${BACKEND_DNS_HOST}:${CODEBUFF_WS_PORT}/ws"

echo "[evals] Host BACKEND_URL:   ${CODEBUFF_BACKEND_URL}"
echo "[evals] Docker BACKEND_URL: ${BACKEND_DOCKER_URL}"
echo "[evals] Host WS URL:        ${CODEBUFF_WEBSOCKET_URL}"
echo "[evals] Docker WS URL:      ${WS_DOCKER_URL}"
echo "[evals] Healthz URL:        ${HEALTHZ_URL}"

# Start services
docker compose -f "$COMPOSE_FILE" up -d --build db backend
# Add: show container status for quick visibility
docker compose -f "$COMPOSE_FILE" ps backend || true
"$SCRIPT_DIR/wait-for-healthz.sh" "$HEALTHZ_URL" 90 || {
  echo "Backend not healthy at $HEALTHZ_URL after timeout" >&2
  # Add: on failure, dump recent backend logs
  docker compose -f "$COMPOSE_FILE" logs backend --tail=200 || true
  exit 1
}

# Drizzle seed (prints CODEBUFF_API_KEY=...)
# Add: pass compose-network URLs so the seeder can reach backend from within the docker network
KEY_LINE=$(docker compose -f "$COMPOSE_FILE" run --rm \
  -e CODEBUFF_BACKEND_URL="$BACKEND_DOCKER_URL" \
  -e CODEBUFF_WEBSOCKET_URL="$WS_DOCKER_URL" \
  seeder | tail -n1) || {
  echo "[evals] Seeder failed. Dumping backend logs:" >&2
  docker compose -f "$COMPOSE_FILE" logs backend --tail=200 || true
  docker compose -f "$COMPOSE_FILE" ps || true
  exit 1
}
export CODEBUFF_API_KEY="${KEY_LINE#CODEBUFF_API_KEY=}"

# Run the eval (allow args passthrough; require prompt if not provided)
if [[ $# -eq 0 ]]; then
  bun scripts/git-evals/run-single-eval.ts --prompt "Say hi and print the working directory" --max-steps 10
else
  bun scripts/git-evals/run-single-eval.ts "$@"
fi

# Tear down
docker compose -f "$COMPOSE_FILE" down -v
