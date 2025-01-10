# Testing Infrastructure

## Terminal Handling

- Primary: Using node-pty for terminal emulation
  - PTY combines stdout and stderr into single data stream
  - All terminal output comes through onData event
  - Better matches real terminal behavior
  - Command completion detected by shell prompt reappearance
  - Must handle command echo and prompt filtering to avoid duplicate output

### Windows-Specific Handling

Important: Windows terminal handling requires special care:
- Avoid process.stdout.clearLine() and cursorTo() - use ANSI escape sequences instead
- Write to new lines rather than clearing existing ones
- Use '\x1b[1A\x1b[2K' for reliable line clearing (move up + clear)
- Always check process.platform === 'win32' before using platform-specific code
- Handle multiple Windows shell types (cmd.exe, powershell)
- Detect shell type using multiple fallback methods

- Fallback: Using child_process when node-pty is unavailable
  - Handles cases where node-pty prebuilds aren't available
  - Provides basic terminal functionality without PTY features
  - Maintains core command execution capabilities
  - Used automatically when node-pty fails to load

- Terminal configuration for both modes:
  - Use 'xterm-256color' for best compatibility when using PTY
  - Set TERM env var to match terminal type
  - Always provide cols/rows dimensions for PTY
  - Kill and restart shell on command timeout instead of using Ctrl+C
  - Commands timeout after 10 seconds to prevent hanging
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

## Native Dependencies

When using native dependencies that require compilation:
- Make them optional dependencies to prevent installation failures
- Implement fallbacks using pure JavaScript/Node.js alternatives
- Test both the primary and fallback implementations
- Document the fallback behavior in user-facing messages
- Example: node-pty falls back to child_process when prebuilds aren't available

## Windows Path Handling

When matching Windows paths in regex patterns:
- To match a literal backslash, use 3 backslashes in the regex:
  - One backslash to escape in JavaScript string
  - Two backslashes to create literal backslash in regex
  - Example: `/[A-Z]:\\\S+/` matches "C:\Users"
- Common Windows patterns:
  - Drive letter: `[A-Z]:`
  - Full path: `[A-Z]:\\\S+`
  - UNC path: `\\\\\S+\\\S+`

