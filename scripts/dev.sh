#!/bin/bash

# Enable job control and set up trap for cleanup
set -m
READY_FILE="/tmp/codebuff_server_ready_$$"
trap 'kill -TERM -$SERVER_PID 2>/dev/null; rm -f "$READY_FILE"; exit' EXIT INT TERM

# Start the server in background
echo "Starting server..."
bun start-server 2>&1 | tee >(grep -m 1 "🚀 Server is running on port" > /dev/null && touch "$READY_FILE") &
SERVER_PID=$!

# Wait for the ready signal
echo "Waiting for server to be ready..."
while [[ ! -f "$READY_FILE" ]]; do
    # Check if server process is still running
    if ! kill -0 $SERVER_PID 2>/dev/null; then
        echo "Server process died unexpectedly"
        exit 1
    fi
    sleep 0.1
done

echo "Server is ready! Starting client..."

# Clean up the signal file
rm -f "$READY_FILE"

# Start the client
bun start-bin -- --cwd .. "$@"
