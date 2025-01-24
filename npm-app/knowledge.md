# Environment Setup

Before running the app, ensure you have the required environment files:

1. `stack.env` in project root with:
```
ENVIRONMENT=local
NEXT_PUBLIC_ENVIRONMENT=local
```

2. `.env.local` in project root with:
```
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_BACKEND_URL=localhost:3001
NEXT_PUBLIC_SUPPORT_EMAIL=support@example.com
```

# Testing Infrastructure

## Terminal Handling

### Cursor Management
- Always restore cursor visibility when exiting
- Hide cursor during loading animations
- Use ANSI escape codes:
  - Hide cursor: `\u001B[?25l`
  - Show cursor: `\u001B[?25h`
- Ensure cursor is restored:
  - On normal exit
  - On SIGTERM
  - After loading animations
  - When stopping responses
  - Via process.exit handler as fallback
- This prevents terminal from getting stuck without cursor if interrupted

### Command Execution Rules

- Skip running input as terminal command if it:
  - Starts with a skipped command (like 'help', 'find', etc.)
  - Contains 'error'
  - Contains single quotes (to avoid shell interpretation issues)
  - Has more than 5 words
  - Unless explicitly prefixed with '/run'

- Primary: Using node-pty for terminal emulation
  - PTY combines stdout and stderr into single data stream
  - All terminal output comes through onData event
  - Better matches real terminal behavior
  - Command completion detected by shell prompt reappearance
  - Must handle command echo and prompt filtering to avoid duplicate output
  - Sources appropriate shell RC file on startup:
    - ~/.zshrc for zsh
    - ~/.config/fish/config.fish for fish
    - ~/.bashrc for bash
    - PowerShell profile on Windows ($PROFILE.CurrentUserAllHosts)
  - Shell initialization requires both:
    - --login flag for Unix shells to load login shell environment
    - Explicit sourcing of RC files for shell-specific configurations
    - Windows shells don't use --login flag
    - For Unix shells, set PS1 prompt after sourcing RC files
    - Windows uses PROMPT env var, Unix uses PS1 command
  
  - Sets environment variables for optimal experience:
    - TERM='xterm-256color' for color support
    - PAGER='cat' to prevent paging
    - LESS='-FRX' for better output display
    - Windows-specific:
      - ANSICON='1' for better ANSI support
      - PROMPT='$P$G' for reliable prompt parsing (shows just path and '>')
      - PSModulePath preserved for PowerShell modules
    - Color handling:
      - Respects NO_COLOR standard
      - Forces colors with FORCE_COLOR='1'
      - Preserves CI environment settings
    
    - Environment setup:
      - History configuration:
        - HISTSIZE=10000 and HISTFILESIZE=20000 for extensive history
        - Higher than bash defaults (500) but reasonable for modern systems
        - HISTCONTROL to ignore duplicates and space-prefixed commands
      - Editor settings (EDITOR/VISUAL) preserved from user environment
      - Locale settings (LANG/LC_ALL) for consistent UTF-8 output
      - Critical environment preservation (PATH, HOME, USER)
      - Shell-specific options:
        - History enabled with 'set -o history'
        - Extended pattern matching where available
        - Emacs-style command line editing
        - SHELL env var uses base name without .exe (e.g. 'powershell' not 'powershell.exe')

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
