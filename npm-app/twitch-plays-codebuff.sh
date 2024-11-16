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

# Run every 15 seconds
while true; do
  # Get timestamp from 3 minutes ago
  timestamp=$(($(date +%s) * 1000 - 180000))
  
  # Fetch last 10 messages from API
  response=$(curl -s "https://recent-messages.robotty.de/api/v2/recent-messages/codebuff_ai?limit=10&after=$timestamp")
  
  # Process messages in reverse order and stop after first successful send
  if [ ! -z "$response" ]; then
    messages=$(echo "$response" | jq -r '.messages | reverse | .[]')
    while IFS= read -r msg; do
      message=$(echo "$msg" | grep -o 'PRIVMSG #codebuff_ai :>.*' | sed 's/PRIVMSG #codebuff_ai :>//')
      if [ ! -z "$message" ] && [ "$message" != "$last_message" ]; then
        send_input "$message"
        last_message="$message"
      fi
      break
    done <<< "$messages"
  fi
  
  sleep 15
done
