#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/../docker-compose.evals.yml"

export CODEBUFF_WEBSOCKET_URL="ws://127.0.0.1:4242/ws"
export CODEBUFF_SKIP_BINARY_CHECK=1

# Start services
docker compose -f "$COMPOSE_FILE" up -d --build db backend
"$SCRIPT_DIR/wait-for-healthz.sh" "http://127.0.0.1:4242/healthz" 90 || {
  echo 'Healthz failed; dumping backend logs...'
  docker compose -f "$COMPOSE_FILE" logs backend --tail=200 || true
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
