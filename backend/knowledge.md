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

## Important Constants

Key configuration values are in `common/src/constants.ts`.

## Testing

Run type checks: `bun run --cwd backend typecheck`

For integration tests, change to backend directory to reuse environment variables from `env.mjs`.
