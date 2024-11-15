#!/bin/bash

function send_input() {
  local input="$1"
  tmux send-keys -t codebuff "$input"
  sleep 1
  tmux send-keys -t codebuff Enter
}

# Create a new tmux session named 'codebuff' and start codebuff in it
tmux new-session -d -s codebuff 'codebuff'

# Track last message to avoid duplicates
last_message=""

# Run every 60 seconds
while true; do
  # Get timestamp from 1 minute ago
  timestamp=$(($(date +%s) * 1000 - 60000))
  
  # Fetch last message from API
  response=$(curl -s "https://recent-messages.robotty.de/api/v2/recent-messages/codebuff_ai?limit=1&after=$timestamp")
  
  # Extract message using jq and string splitting
  if [ ! -z "$response" ]; then
    message=$(echo "$response" | jq -r '.messages[0]' | grep -o 'PRIVMSG #codebuff_ai :.*' | sed 's/PRIVMSG #codebuff_ai ://')
    if [ ! -z "$message" ] && [ "$message" != "$last_message" ]; then
      send_input "$message"
      last_message="$message"
    fi
  fi
  
  sleep 60
done
