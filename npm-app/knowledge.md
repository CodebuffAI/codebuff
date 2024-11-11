npm publish

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
