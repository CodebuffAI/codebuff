#!/bin/bash
set -euo pipefail

# Parameters
MODE="${1:-seed}"              # 'seed' (Drizzle) or 'bypass'
EVAL_FILE="${2:-eval-codebuff.json}"    # eval file name
COMMIT_INDEX="${3:-0}"         # commit index

echo "🚀 Remote Evaluation Parameters:"
echo "  Mode: $MODE"
echo "  Eval File: $EVAL_FILE"
echo "  Commit Index: $COMMIT_INDEX"

export CODEBUFF_WEBSOCKET_URL="ws://127.0.0.1:4242/ws"
export CODEBUFF_SKIP_BINARY_CHECK=1

# Start services
echo "📦 Starting Docker services..."
docker compose -f "$(dirname "$0")/../docker-compose.evals.yml" up -d --build db backend

# Wait for backend to be ready
echo "⏳ Waiting for backend to be ready..."
"$(dirname "$0")/wait-for-healthz.sh" "http://127.0.0.1:4242/healthz" 90 || {
  echo '❌ Healthz failed; dumping backend logs...'
  docker compose -f "$(dirname "$0")/../docker-compose.evals.yml" logs backend --tail=200 || true
  exit 1
}

# Set up authentication
if [ "$MODE" = "bypass" ]; then
  echo "🔐 Using bypass authentication..."
  export CODEBUFF_TEST_AUTH_TOKEN="$(openssl rand -hex 16)"
  export CODEBUFF_API_KEY="$CODEBUFF_TEST_AUTH_TOKEN"
else
  echo "🌱 Using database seed authentication..."
  # Drizzle seed via compose for network access to db
  KEY_LINE=$(docker compose -f "$(dirname "$0")/../docker-compose.evals.yml" run --rm seeder | tail -n1)
  export CODEBUFF_API_KEY="${KEY_LINE#CODEBUFF_API_KEY=}"
fi

# Run evaluation
echo "🤖 Running evaluation..."
echo "  File: evals/git-evals/$EVAL_FILE"
echo "  Commit Index: $COMMIT_INDEX"

bun evals/git-evals/run-single-eval.ts \
  --eval-file="evals/git-evals/$EVAL_FILE" \
  --commit-index="$COMMIT_INDEX"

# Cleanup
echo "🧹 Cleaning up..."
docker compose -f "$(dirname "$0")/../docker-compose.evals.yml" down -v

echo "✅ Remote evaluation completed successfully!"