# Backend Knowledge

## Auto Top-up System

The backend implements an automatic credit top-up system that:
- Triggers when a user's balance falls below their configured threshold
- Purchases credits to reach their target balance
- Only activates if user has enabled it and configured threshold/target
- Automatically disables itself if payment fails
- Grants credits immediately while waiting for Stripe webhook confirmation

Key files:
- `common/src/billing/auto-topup.ts`: Core auto top-up logic
- `backend/src/websockets/middleware.ts`: Integration with request flow

The middleware checks for auto top-up eligibility whenever a user runs out of credits during an action. If successful, the action proceeds automatically without user intervention.

Notifications:
- Success: Send via usage-response with autoTopupAdded field
- Failure: Send via action-error with specific error type
- Both CLI and web UI handle these notifications appropriately

## Billing System

Credits are managed through a combination of:
- Local credit grants in the database
- Stripe for payment processing
- WebSocket actions for real-time updates

### Transaction Isolation Levels

Critical credit operations use SERIALIZABLE isolation with automatic retries:
- Credit consumption must be serializable to prevent "double spending"
- Monthly resets must be serializable to prevent duplicate grants
- Both operations retry on serialization failures (error code 40001)
- Helper: `withSerializableTransaction` in `common/src/db/transaction.ts`

Other operations use default isolation (READ COMMITTED):
- Grant operations (protected by unique operation IDs)
- Revocations (idempotent balance zeroing)

### Monthly Credit Resets

Monthly credit resets are handled atomically:
- Multiple processes might check reset dates simultaneously
- SERIALIZABLE isolation prevents duplicate grants
- One process will complete while others wait
- After lock release, others will see updated reset date

## Middleware System

The WebSocket middleware stack:
1. Authenticates requests
2. Checks credit balance
3. Handles auto top-up if needed
4. Manages quota resets and rollovers

Each middleware can:
- Allow the request to continue
- Return an action to send to the client
- Throw an error to halt processing

## Important Constants

Key configuration values are centralized in `common/src/constants.ts`.

## Error Handling

Errors are logged with context and returned to the client as structured responses.

## Testing

Run type checks after changes:
```bash
bun run --cwd backend typecheck
```
