#!/bin/bash
set -euo pipefail

# Logging function with timestamps
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Parameters
MODE="${1:-seed}"              # 'seed' (Drizzle) or 'bypass'
EVAL_FILE="${2:-eval-codebuff.json}"    # eval file name
COMMIT_INDEX="${3:-0}"         # commit index

log "🚀 Remote Evaluation Infrastructure Starting (SDK Mode)"
log "📋 Parameters:"
log "  Mode: $MODE"
log "  Eval File: $EVAL_FILE"
log "  Commit Index: $COMMIT_INDEX"
log "  Working Directory: $(pwd)"
log "  Script Directory: $(dirname "$0")"

export CODEBUFF_WEBSOCKET_URL="ws://127.0.0.1:4242/ws"
export CODEBUFF_SKIP_BINARY_CHECK=1

# Start services
log "📦 Starting Docker services..."
log "  Compose file: $(dirname "$0")/../docker-compose.evals.yml"
docker compose -f "$(dirname "$0")/../docker-compose.evals.yml" up -d --build db backend

# Wait for backend to be ready
log "⏳ Waiting for backend to be ready..."
START_TIME=$(date +%s)
"$(dirname "$0")/wait-for-healthz.sh" "http://127.0.0.1:4242/healthz" 90 || {
  log '❌ Health check failed; dumping logs...'
  log '📋 Backend logs:'
  docker compose -f "$(dirname "$0")/../docker-compose.evals.yml" logs backend --tail=200 || true
  log '📋 Database logs:'
  docker compose -f "$(dirname "$0")/../docker-compose.evals.yml" logs db --tail=50 || true
  exit 1
}
READY_TIME=$(date +%s)
log "✅ Backend ready in $((READY_TIME - START_TIME)) seconds"

# Set up authentication
if [ "$MODE" = "bypass" ]; then
  log "🔐 Setting up bypass authentication..."
  export CODEBUFF_TEST_AUTH_TOKEN="$(openssl rand -hex 16)"
  export CODEBUFF_API_KEY="$CODEBUFF_TEST_AUTH_TOKEN"
  log "  Generated test auth token: ${CODEBUFF_TEST_AUTH_TOKEN:0:8}..."
else
  log "🌱 Setting up database seed authentication..."
  log "  Running seeder container..."
  SEED_START=$(date +%s)
  KEY_LINE=$(docker compose -f "$(dirname "$0")/../docker-compose.evals.yml" run --rm seeder | tail -n1)
  export CODEBUFF_API_KEY="${KEY_LINE#CODEBUFF_API_KEY=}"
  SEED_END=$(date +%s)
  log "  Seeding completed in $((SEED_END - SEED_START)) seconds"
  log "  Extracted API key: ${CODEBUFF_API_KEY:0:8}..."
fi

# Run evaluation (SDK mode only)
log "🤖 Starting evaluation (SDK mode)..."
log "  File: evals/git-evals/$EVAL_FILE"
log "  Commit Index: $COMMIT_INDEX"
log "  Using: CodebuffClient from SDK"
log "  Environment: CODEBUFF_WEBSOCKET_URL=$CODEBUFF_WEBSOCKET_URL"
log "  This may take 10-30 minutes depending on task complexity..."

EVAL_START=$(date +%s)
bun evals/git-evals/run-single-eval.ts \
  --eval-file="evals/git-evals/$EVAL_FILE" \
  --commit-index="$COMMIT_INDEX"

EVAL_EXIT_CODE=$?
EVAL_END=$(date +%s)
EVAL_DURATION=$((EVAL_END - EVAL_START))

if [ $EVAL_EXIT_CODE -eq 0 ]; then
  log "✅ Evaluation completed successfully in ${EVAL_DURATION} seconds!"
else
  log "❌ Evaluation failed with exit code $EVAL_EXIT_CODE after ${EVAL_DURATION} seconds"
  log "📋 Final backend logs:"
  docker compose -f "$(dirname "$0")/../docker-compose.evals.yml" logs backend --tail=100 || true
fi

# Cleanup
log "🧹 Cleaning up Docker containers..."
docker compose -f "$(dirname "$0")/../docker-compose.evals.yml" down -v

TOTAL_DURATION=$((EVAL_END - START_TIME))
log "🏁 Remote evaluation finished in ${TOTAL_DURATION} total seconds (exit code: $EVAL_EXIT_CODE)"
exit $EVAL_EXIT_CODE