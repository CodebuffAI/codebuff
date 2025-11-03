#!/usr/bin/env bash
# Wrapper script to handle dev command with fallback SDK build

# Try to run directly
bun run src/index.tsx "$@" || {
  # If it fails, build SDK silently and retry
  bun run build:sdk > /dev/null 2>&1
  bun run src/index.tsx "$@"
}
