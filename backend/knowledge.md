# Backend Knowledge

## Auto Top-up System

The backend implements automatic credit top-up for users and organizations:
- Triggers when balance falls below configured threshold
- Purchases credits to reach target balance
- Only activates if enabled and configured
- Automatically disables on payment failure
- Grants credits immediately while waiting for Stripe confirmation

Key files:
- `packages/billing/src/auto-topup.ts`: Core auto top-up logic
- `backend/src/websockets/middleware.ts`: Integration with request flow

Middleware checks auto top-up eligibility when users run out of credits. If successful, the action proceeds automatically.

Notifications:
- Success: Send via usage-response with autoTopupAdded field
- Failure: Send via action-error with specific error type
- Both CLI and web UI handle these notifications appropriately

## Billing System

Credits are managed through:
- Local credit grants in database
- Stripe for payment processing
- WebSocket actions for real-time updates

### Transaction Isolation

Critical credit operations use SERIALIZABLE isolation with automatic retries:
- Credit consumption prevents "double spending"
- Monthly resets prevent duplicate grants
- Both retry on serialization failures (error code 40001)
- Helper: `withSerializableTransaction` in `common/src/db/transaction.ts`

Other operations use default isolation (READ COMMITTED).

## WebSocket Middleware System

The middleware stack:
1. Authenticates requests
2. Checks credit balance
3. Handles auto top-up if needed
4. Manages quota resets

Each middleware can allow continuation, return an action, or throw an error.

## File Change Hooks Integration

The `run_file_change_hooks` tool allows the backend (particularly the reviewer agent) to trigger client-side file change hooks after code modifications have been applied.

### How it works:

1. **Tool Definition**: The `run_file_change_hooks` tool is defined in `backend/src/tools.ts` and takes a list of file paths that were changed.

2. **Reviewer Agent Integration**: The reviewer agent (`gemini25pro_reviewer`) has this tool in its allowed tools list and is instructed to:
   - Identify changed files by looking for `write_file`, `str_replace`, or `create_plan` tool calls
   - Call `run_file_change_hooks` with those file paths
   - Include the hook results in its review feedback

3. **Execution Flow**:
   - File changes are processed and sent to the client as tool calls
   - These are added to the beginning of `clientToolCalls` to ensure they're processed first
   - When `run_file_change_hooks` is called, the client waits briefly to ensure file changes are written to disk
   - The client then runs the appropriate hooks based on `codebuff.json` configuration
   - Results are returned to the reviewer agent

4. **Client-Side Handling**: The client's `tool-call-request` handler includes special logic for `run_file_change_hooks` to ensure proper sequencing.

### Important Notes:

- File changes must be applied before hooks run
- The reviewer agent receives hook results and can include them in its feedback
- This replaces the automatic hook execution that previously happened in `subscribeToResponse`

## Important Constants

Key configuration values are in `common/src/constants.ts`.

## Testing

Run type checks: `bun run --cwd backend typecheck`

For integration tests, change to backend directory to reuse environment variables from `env.mjs`.
