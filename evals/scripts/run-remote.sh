#!/bin/bash
set -euo pipefail
MODE="${1:-seed}"  # 'seed' (Drizzle) or 'bypass'
export CODEBUFF_WEBSOCKET_URL="ws://127.0.0.1:4242/ws"
export CODEBUFF_SKIP_BINARY_CHECK=1  # after skip flag is added

# Start services
docker compose -f "$(dirname "$0")/../docker-compose.evals.yml" up -d --build db backend
"$(dirname "$0")/wait-for-healthz.sh" "http://127.0.0.1:4242/healthz" 90 || {
  echo 'Healthz failed; dumping backend logs...'
  docker compose -f "$(dirname "$0")/../docker-compose.evals.yml" logs backend --tail=200 || true
  exit 1
}

if [ "$MODE" = "bypass" ]; then
  export CODEBUFF_TEST_AUTH_TOKEN="$(openssl rand -hex 16)"
  export CODEBUFF_API_KEY="$CODEBUFF_TEST_AUTH_TOKEN"
else
  # Drizzle seed via compose for network access to db
  KEY_LINE=$(docker compose -f "$(dirname "$0")/../docker-compose.evals.yml" run --rm seeder | tail -n1)
  export CODEBUFF_API_KEY="${KEY_LINE#CODEBUFF_API_KEY=}"
fi

bun evals/git-evals/run-single-eval.ts \
  --eval-file="evals/git-evals/eval-codebuff.json" \
  --commit-index=0

docker compose -f "$(dirname "$0")/../docker-compose.evals.yml" down -v