#!/bin/bash
set -euo pipefail

# Logging function
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

MODE="${1:-seed}"  # 'seed' (Drizzle) or 'bypass'
log "🚀 Starting remote evaluation infrastructure (SDK mode)"
log "Mode: $MODE"

export CODEBUFF_WEBSOCKET_URL="ws://127.0.0.1:4242/ws"
export CODEBUFF_SKIP_BINARY_CHECK=1
log "Environment variables set:"
log "  CODEBUFF_WEBSOCKET_URL=$CODEBUFF_WEBSOCKET_URL"
log "  CODEBUFF_SKIP_BINARY_CHECK=$CODEBUFF_SKIP_BINARY_CHECK"

# Start services
log "📦 Starting Docker services (db + backend)..."
docker compose -f "$(dirname "$0")/../docker-compose.evals.yml" up -d --build db backend

log "⏳ Waiting for backend health check..."
"$(dirname "$0")/wait-for-healthz.sh" "http://127.0.0.1:4242/healthz" 90 || {
  log '❌ Health check failed; dumping backend logs...'
  docker compose -f "$(dirname "$0")/../docker-compose.evals.yml" logs backend --tail=200 || true
  log '❌ Dumping database logs...'
  docker compose -f "$(dirname "$0")/../docker-compose.evals.yml" logs db --tail=50 || true
  exit 1
}

if [ "$MODE" = "bypass" ]; then
  log "🔐 Setting up bypass authentication..."
  export CODEBUFF_TEST_AUTH_TOKEN="$(openssl rand -hex 16)"
  export CODEBUFF_API_KEY="$CODEBUFF_TEST_AUTH_TOKEN"
  log "  Generated test auth token: ${CODEBUFF_TEST_AUTH_TOKEN:0:8}..."
else
  log "🌱 Setting up database seed authentication..."
  log "  Running seeder container..."
  KEY_LINE=$(docker compose -f "$(dirname "$0")/../docker-compose.evals.yml" run --rm seeder | tail -n1)
  export CODEBUFF_API_KEY="${KEY_LINE#CODEBUFF_API_KEY=}"
  log "  Extracted API key: ${CODEBUFF_API_KEY:0:8}..."
fi

log "🤖 Starting evaluation (SDK mode)..."
log "  Eval file: evals/git-evals/eval-codebuff.json"
log "  Commit index: 0"
log "  Using: CodebuffClient from SDK"
log "  This may take 10-30 minutes depending on task complexity..."

bun evals/git-evals/run-single-eval.ts \
  --eval-file="evals/git-evals/eval-codebuff.json" \
  --commit-index=0

EVAL_EXIT_CODE=$?
if [ $EVAL_EXIT_CODE -eq 0 ]; then
  log "✅ Evaluation completed successfully!"
else
  log "❌ Evaluation failed with exit code $EVAL_EXIT_CODE"
fi

log "🧹 Cleaning up Docker containers..."
docker compose -f "$(dirname "$0")/../docker-compose.evals.yml" down -v

log "🏁 Remote evaluation finished (exit code: $EVAL_EXIT_CODE)"
exit $EVAL_EXIT_CODE