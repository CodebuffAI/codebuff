#!/usr/bin/env bash
set -euo pipefail

# Install a local Freebuff build on Linux or macOS.
#
# Defaults can be changed without editing this file:
#   FREEBUFF_REPO_URL=https://github.com/CodebuffAI/freebuff.git
#   FREEBUFF_BRANCH=main
#   FREEBUFF_SOURCE_DIR="$HOME/.local/share/freebuff-source"
#   FREEBUFF_BIN_DIR="$HOME/.local/bin"

repo_url="${FREEBUFF_REPO_URL:-https://github.com/CodebuffAI/freebuff.git}"
branch="${FREEBUFF_BRANCH:-main}"
source_dir="${FREEBUFF_SOURCE_DIR:-$HOME/.local/share/freebuff-source}"
bin_dir="${FREEBUFF_BIN_DIR:-$HOME/.local/bin}"

fail() {
  printf 'Freebuff installation failed: %s\n' "$1" >&2
  exit 1
}

case "$(uname -s)" in
  Linux|Darwin) ;;
  *) fail 'this installer supports Linux and macOS only' ;;
esac

command -v git >/dev/null 2>&1 || fail 'Git is required; install it and run this script again'

if ! command -v bun >/dev/null 2>&1; then
  if ! command -v curl >/dev/null 2>&1; then
    fail 'Bun is missing and curl is unavailable to install it'
  fi

  printf 'Bun was not found. Installing Bun for the current user...\n'
  curl -fsSL https://bun.sh/install | bash
  export PATH="$HOME/.bun/bin:$PATH"
fi

command -v bun >/dev/null 2>&1 || fail 'Bun could not be found after installation'

if [ ! -e "$source_dir" ]; then
  mkdir -p "$(dirname "$source_dir")"
  printf 'Cloning %s (%s)...\n' "$repo_url" "$branch"
  git clone --depth 1 --branch "$branch" "$repo_url" "$source_dir"
elif [ ! -d "$source_dir/.git" ]; then
  fail "$source_dir exists but is not a Git repository; choose another FREEBUFF_SOURCE_DIR"
else
  printf 'Updating source checkout in %s...\n' "$source_dir"
  git -C "$source_dir" fetch --depth 1 origin "$branch"

  if git -C "$source_dir" show-ref --verify --quiet "refs/heads/$branch"; then
    git -C "$source_dir" checkout "$branch"
  else
    git -C "$source_dir" checkout -b "$branch" "origin/$branch"
  fi

  git -C "$source_dir" pull --ff-only origin "$branch"
fi

printf 'Installing dependencies...\n'
bun --cwd "$source_dir" install --frozen-lockfile

printf 'Building Freebuff for %s/%s...\n' "$(uname -s)" "$(uname -m)"
bun --cwd "$source_dir" run build:freebuff

binary="$source_dir/cli/bin/freebuff"
wasm="$source_dir/cli/bin/tree-sitter.wasm"
[ -f "$binary" ] || fail "build did not produce $binary"
[ -f "$wasm" ] || fail "build did not produce $wasm"

mkdir -p "$bin_dir"
cp "$binary" "$bin_dir/freebuff"
cp "$wasm" "$bin_dir/tree-sitter.wasm"
chmod 755 "$bin_dir/freebuff"

printf '\nFreebuff installed at %s\n' "$bin_dir/freebuff"
if case ":$PATH:" in *":$bin_dir:"*) false ;; *) true ;; esac; then
  printf 'Add this directory to PATH for future terminals:\n'
  printf '  export PATH="%s:$PATH"\n' "$bin_dir"
fi

"$bin_dir/freebuff" --version || true
