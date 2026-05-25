#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
manifest="$repo_root/scripts/public-export-manifest.txt"
source_ref="${PUBLIC_SOURCE_REF:-HEAD}"
public_branch="${PUBLIC_BRANCH:-main}"
dry_run="${PUBLIC_SYNC_DRY_RUN:-1}"
workdir="${PUBLIC_SYNC_WORKDIR:-$repo_root/.context/public-sync}"
export_dir="$workdir/export"
preview_dir="$repo_root/.context/public-export-preview"

if [ ! -f "$manifest" ]; then
  echo "Missing manifest: $manifest" >&2
  exit 1
fi

includes=()
excludes=()
while IFS= read -r raw_line || [ -n "$raw_line" ]; do
  line="${raw_line%%#*}"
  line="$(printf '%s' "$line" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
  [ -z "$line" ] && continue

  if [[ "$line" == !* ]]; then
    excludes+=("${line:1}")
  else
    includes+=("$line")
  fi
done < "$manifest"

rm -rf "$workdir"
mkdir -p "$export_dir"

cd "$repo_root"
git archive "$source_ref" -- "${includes[@]}" | tar -x -C "$export_dir"

cd "$export_dir"
for pattern in "${excludes[@]}"; do
  if [[ "$pattern" == *"*"* || "$pattern" == *"?"* ]]; then
    find . -path "./$pattern" -prune -exec rm -rf {} + 2>/dev/null || true
  else
    rm -rf -- "$pattern"
  fi
done

find . \( -name node_modules -o -name .next -o -name dist -o -name '*.tsbuildinfo' \) -prune -exec rm -rf {} + 2>/dev/null || true
find . \( -name knowledge.md -o -name '*.knowledge.md' \) -type f -delete

rsync -a "$repo_root/scripts/public-export/root/" .
rsync -a "$repo_root/scripts/public-export/overlays/" .

rm -f bun.lock
bun install --lockfile-only

for forbidden_path in web freebuff/web packages/internal packages/billing packages/bigquery packages/build-tools; do
  if [ -e "$forbidden_path" ]; then
    echo "Forbidden path present in export: $forbidden_path" >&2
    exit 1
  fi
done

if rg -n \
  "from ['\"]@codebuff/(internal|billing|bigquery)|import .*['\"]@codebuff/(internal|billing|bigquery)|require\\(['\"](@codebuff/(internal|billing|bigquery)|\\.\\./\\.\\./packages/internal)" \
  . \
  --glob '*.{ts,tsx,js,mjs,cjs}' \
  --glob '!**/__tests__/**' \
  --glob '!**/test/**'
then
  echo "Public export has private package imports." >&2
  exit 1
fi

if rg -n \
  "BOT_SWEEP|INFISICAL|RENDER_DEPLOY|STRIPE_SECRET|STRIPE_WEBHOOK|LOOPS_API_KEY" \
  . \
  --glob '!bun.lock' \
  --glob '!**/__tests__/**' \
  --glob '!**/test/**' \
  --glob '!evals/buffbench/*.json'
then
  echo "Public export has private secret/deploy references." >&2
  exit 1
fi

if [ "$dry_run" != "0" ]; then
  rm -rf "$preview_dir"
  mkdir -p "$(dirname "$preview_dir")"
  cp -R "$export_dir" "$preview_dir"
  echo "Dry run complete. Preview written to $preview_dir"
  exit 0
fi

if [ -z "${PUBLIC_REPO_URL:-}" ]; then
  if [ -z "${PUBLIC_REPO:-}" ] || [ -z "${PUBLIC_REPO_PUSH_TOKEN:-}" ]; then
    echo "Set PUBLIC_REPO_URL, or set PUBLIC_REPO and PUBLIC_REPO_PUSH_TOKEN, when PUBLIC_SYNC_DRY_RUN=0" >&2
    exit 1
  fi
  PUBLIC_REPO_URL="https://x-access-token:${PUBLIC_REPO_PUSH_TOKEN}@github.com/${PUBLIC_REPO}.git"
fi

public_checkout="$workdir/public"
git clone --depth=1 --branch "$public_branch" "$PUBLIC_REPO_URL" "$public_checkout"
find "$public_checkout" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
rsync -a "$export_dir/" "$public_checkout/"

cd "$public_checkout"
git add -A
if git diff --cached --quiet; then
  echo "Public repo already up to date."
  exit 0
fi

git config user.name "codebuff public sync bot"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
private_sha="$(git -C "$repo_root" rev-parse "$source_ref")"
git commit -m "Sync public snapshot from freebuff-private" -m "Source: CodebuffAI/freebuff-private@$private_sha"
git push origin "HEAD:$public_branch"
