#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
CONFIG_DIR="$ROOT/.github/act"

# --- Backup .env.local ---
BACKUP_FILE=".env.local.bak.$(date +%s)"
RESTORE_NEEDED=false
if [[ -f ".env.local" ]]; then
  echo "🔒 Backing up .env.local to ${BACKUP_FILE}..."
  cp ".env.local" "${BACKUP_FILE}"  # Use cp instead of mv to keep original in place until act runs
  RESTORE_NEEDED=true
fi

# --- Cleanup function ---
cleanup() {
  if [[ "${RESTORE_NEEDED}" == "true" ]]; then
    # Remove the .env.local potentially created by act
    if [[ -f ".env.local" ]]; then
      echo "🧹 Cleaning up..."
      rm -f ".env.local"  # Remove any .env.local created by act
    fi

    # Restore the original .env.local
    if [[ -f "${BACKUP_FILE}" ]]; then
      echo "⏪ Restoring original .env.local from ${BACKUP_FILE}..."
      mv "${BACKUP_FILE}" ".env.local"  # Use mv for atomic restore
    else
      echo "⚠️  Warning: Backup file ${BACKUP_FILE} not found!"
    fi
  fi

  # Clean up temporary act config files
  echo "🧹 Removing temporary act config files..."
  rm -f "$CONFIG_DIR/actrc" "$CONFIG_DIR/env.act" "$CONFIG_DIR/secrets.act"
}

# --- Trap for cleanup ---
trap cleanup EXIT INT TERM

# --- Generate act config (AFTER backup) ---
bash "${SCRIPT_DIR}/bootstrap-act-config.sh"

# --- Tell act where its config lives ---
export XDG_CONFIG_HOME="$ROOT/.github"

EVENT_PATH="$ROOT/.github/act/events/push.json"

# ------------------------------------------------------------------
# Ensure a minimal push-event JSON exists so `act` always has input.
# ------------------------------------------------------------------
if [[ ! -f "${EVENT_PATH}" ]]; then
  echo "🔧  Generating stub ${EVENT_PATH}…"
  mkdir -p "$(dirname "${EVENT_PATH}")"
  cat > "${EVENT_PATH}" <<EOF
{
  "ref": "refs/heads/$(git -C "$ROOT" symbolic-ref --short HEAD 2>/dev/null || echo main)",
  "repository": { "full_name": "$(git config --get remote.origin.url | sed 's#.*/##;s/\.git$//')" },
  "after": "$(git rev-parse --verify HEAD)",
  "head_commit": { "message": "local act stub" },
  "pusher": { "name": "$(git config user.name 2>/dev/null || echo local)" }
}
EOF
fi

# --- Run act ---
echo "🚀 Running act..."
DEFAULT_FLAGS=(
  -P ubuntu-latest=ghcr.io/catthehacker/ubuntu:act-22.04
  --artifact-server-path ./.act/artifacts
  --bind
)

act "${DEFAULT_FLAGS[@]}" "$@" \
    --env-file "$CONFIG_DIR/env.act" \
    --secret-file "$CONFIG_DIR/secrets.act" \
    --eventpath "$EVENT_PATH"

# --- Cleanup will run automatically on exit ---
echo "✅ act finished."
