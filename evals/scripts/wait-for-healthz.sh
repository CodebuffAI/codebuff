#!/bin/bash
set -euo pipefail

# Logging function
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

URL="$1"; TIMEOUT="${2:-60}"
log "🏥 Health check starting"
log "  URL: $URL"
log "  Timeout: ${TIMEOUT}s"

for i in $(seq 1 "$TIMEOUT"); do
  if curl -fsS "$URL" >/dev/null 2>&1; then 
    log "✅ Backend is healthy and ready!"
    exit 0
  fi
  
  # Log every 10 seconds to avoid spam
  if [ $((i % 10)) -eq 0 ] || [ $i -le 5 ]; then
    log "⏳ Waiting for backend... (${i}s / ${TIMEOUT}s)"
  fi
  
  sleep 1
done

log "❌ Backend health check failed after $TIMEOUT seconds" >&2
log "🔍 Final health check attempt..."
RESPONSE=$(curl -s -w "HTTP_CODE:%{http_code}" "$URL" 2>/dev/null || echo "CURL_FAILED")
log "  Response: $RESPONSE"
exit 1