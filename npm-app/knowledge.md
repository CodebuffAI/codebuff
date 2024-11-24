# CLI Knowledge

## Core Components

### CLI Class
- Manages user input/output and WebSocket communication
- Handles file changes and version control
- Processes terminal commands
- Manages chat history and state

### Key Features

1. Input Handling:
- Non-canonical terminal mode for improved key handling
- Paste detection for multiline input
- Command history with up/down arrow navigation
- ESC to cancel ongoing responses

2. File Management:
- Tracks file versions for undo/redo
- Shows diffs of changes
- Auto-commits changes with generated commit messages
- Preserves file state between commands

3. Terminal Integration:
- Direct command execution
- Command validation and error handling
- Working directory management
- Auto-git support for staging/committing changes

4. Usage Tracking:
- Shows credits used per request
- Displays session credit usage
- Warns on quota thresholds
- Handles subscription status

## Important Commands

- `undo`/`u`: Revert last change
- `redo`/`r`: Reapply reverted change
- `diff`/`d`: Show changes from last response
- `login`: Authenticate user
- `usage`/`credits`: Show credit usage
- ESC: Cancel generation
- Direct terminal commands
- `/run`: Execute longer commands

## Testing Infrastructure

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

- Display warnings at quota thresholds
- Include upgrade/login prompts based on user status
- Show referral opportunities when appropriate
