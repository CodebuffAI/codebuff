# Testing Infrastructure

## Terminal Handling

- Using node-pty for terminal emulation instead of child_process
- PTY combines stdout and stderr into single data stream
- All terminal output comes through onData event
- This better matches real terminal behavior
- Command completion detected by shell prompt reappearance
- Must handle command echo and prompt filtering to avoid duplicate output
- Terminal configuration:
  - Use 'xterm-256color' for best compatibility
  - Set TERM env var to match terminal type
  - Always provide cols/rows dimensions
  - Kill and restart PTY on command timeout instead of using Ctrl+C
  - Set environment variables to prevent paging and prompts:
    - PAGER=cat: Disable paging for commands like git log
    - GIT_PAGER=cat: Specifically disable git paging
    - GIT_TERMINAL_PROMPT=0: Prevent git from prompting
    - LESS=-FRX: Output all at once without paging

### Test Input Sources

- twitch-plays-codebuff.sh: Integrates with Twitch chat via robotty.de API
  - API endpoint: `https://recent-messages.robotty.de/api/v2/recent-messages/codebuff_ai`
  - Query params: limit=1 for single message, after/before for timestamp filtering
  - Message format: Parse "PRIVMSG #codebuff_ai :" prefix
  - Important: Cache last processed message to prevent duplicates
  - When processing historical messages in reverse order:
    - Stop on first successful send OR first duplicate
    - Never process messages older than last known processed message
    - This prevents unnecessary processing and maintains message order

## Code Style

### Variable Updates

- Prefer direct variable updates over helper methods for simple operations
- Example: For incrementing counters or updating simple state, use direct assignment rather than creating setter methods
- Keep calculations simple - prefer direct addition/subtraction over computing differences
- This keeps the code simpler and reduces unnecessary abstraction

## User Notifications

### Usage Information Flow

- Server calculates and tracks quota reset timing
- Usage information flows from server to client via websocket messages
- Client displays:
  - Credits used in current session
  - Total credits remaining
  - Quota reset timing
- Show this information at key moments:
  - When reaching usage thresholds
  - Upon user request (usage command)
  - When exiting the application

### Usage Warnings
