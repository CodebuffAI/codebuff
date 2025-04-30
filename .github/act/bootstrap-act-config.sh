#!/usr/bin/env bash
# ci/bootstrap-act-config.sh
set -euo pipefail

# ───────── locate repo root ─────────
ROOT="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
CONFIG_DIR="$ROOT/.github/act"

# ───────── defaults ─────────
ACT_IMAGE="${ACT_IMAGE:-ghcr.io/catthehacker/ubuntu:act-22.04}"
ARTIFACT_DIR="${ARTIFACT_DIR:-$ROOT/.act/artifacts}"
# ────────────────────────────

mkdir -p "$CONFIG_DIR"

cat > "$CONFIG_DIR/actrc" <<EOF
-P ubuntu-latest=${ACT_IMAGE}
--artifact-server-path ${ARTIFACT_DIR}
--bind
EOF

cat > "$CONFIG_DIR/env.act" <<'EOF'
NEXT_PUBLIC_CB_ENVIRONMENT=local
CI=true
EOF

if [[ ! -f "$CONFIG_DIR/secrets.act" ]]; then
  cat > "$CONFIG_DIR/secrets.act" <<'EOF'
OPENAI_API_KEY=sk-dummy
STRIPE_SECRET=whsec_dummy
EOF
  chmod 600 "$CONFIG_DIR/secrets.act"
fi
