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

# Compute URLs for host and docker network
export CODEBUFF_BACKEND_URL="${CODEBUFF_HTTP_SCHEME}://${CODEBUFF_WS_HOST}:${CODEBUFF_WS_PORT}"
DOCKER_HOST_ALIAS="${DOCKER_HOST_ALIAS:-host.docker.internal}"
BACKEND_DOCKER_URL="${CODEBUFF_HTTP_SCHEME}://${DOCKER_HOST_ALIAS}:${CODEBUFF_WS_PORT}"
WS_DOCKER_URL="${CODEBUFF_WS_SCHEME}://${DOCKER_HOST_ALIAS}:${CODEBUFF_WS_PORT}/ws"

# Diagnostics: print what we will use on host
echo "[evals] Host BACKEND_URL:   ${CODEBUFF_BACKEND_URL}"
echo "[evals] Host WS URL:        ${CODEBUFF_WEBSOCKET_URL}"
echo "[evals] Healthz URL:        ${HEALTHZ_URL}"
# Diagnostics: relevant env presence (mask secrets)
[[ -n "${GOOGLE_APPLICATION_CREDENTIALS:-}" ]] && echo "[evals] GOOGLE_APPLICATION_CREDENTIALS: ${GOOGLE_APPLICATION_CREDENTIALS}" || echo "[evals] GOOGLE_APPLICATION_CREDENTIALS: (unset)"
if [[ -n "${GOOGLE_APPLICATION_CREDENTIALS_JSON:-}" ]]; then
  echo "[evals] GOOGLE_APPLICATION_CREDENTIALS_JSON: present (len=${#GOOGLE_APPLICATION_CREDENTIALS_JSON})"
else
  echo "[evals] GOOGLE_APPLICATION_CREDENTIALS_JSON: (unset)"
fi
[[ -n "${NEXT_PUBLIC_CB_ENVIRONMENT:-}" ]] && echo "[evals] NEXT_PUBLIC_CB_ENVIRONMENT=${NEXT_PUBLIC_CB_ENVIRONMENT}" || true

# Start only DB in docker
docker compose -f "$COMPOSE_FILE" up -d --build db

# Start backend locally on host (adjust command if needed)
BACKEND_CMD="${BACKEND_CMD:-bun run --cwd backend dev}"
echo "[evals] Starting backend locally: $BACKEND_CMD"
$BACKEND_CMD >"${SCRIPT_DIR}/../backend.log" 2>&1 &
BACKEND_PID=$!
trap 'kill -TERM "$BACKEND_PID" 2>/dev/null || true; docker compose -f "$COMPOSE_FILE" down -v' EXIT

# Wait for backend to be healthy
"$SCRIPT_DIR/wait-for-healthz.sh" "$HEALTHZ_URL" 90 || {
  echo "Backend not healthy at $HEALTHZ_URL after timeout" >&2
  echo "[evals] Last 200 lines of backend.log:" >&2
  tail -n 200 "${SCRIPT_DIR}/../backend.log" || true
  exit 1
}

echo "[evals] Backend is healthy."

# Print env inside seeder container for verification
echo "[evals] Seeder container env (filtered):"
docker compose -f "$COMPOSE_FILE" run --rm --add-host=host.docker.internal:host-gateway \
  -e CODEBUFF_BACKEND_URL="$BACKEND_DOCKER_URL" \
  -e CODEBUFF_WEBSOCKET_URL="$WS_DOCKER_URL" \
  seeder /usr/bin/env | grep -E 'CODEBUFF|GOOGLE|NEXT_PUBLIC|BACKEND|PORT' || true

# Run seeder (prints CODEBUFF_API_KEY=...)
KEY_LINE=$(docker compose -f "$COMPOSE_FILE" run --rm --add-host=host.docker.internal:host-gateway \
  -e CODEBUFF_BACKEND_URL="$BACKEND_DOCKER_URL" \
  -e CODEBUFF_WEBSOCKET_URL="$WS_DOCKER_URL" \
  seeder | tail -n1) || {
  echo "[evals] Seeder failed. Dumping backend.log tail:" >&2
  tail -n 200 "${SCRIPT_DIR}/../backend.log" || true
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
