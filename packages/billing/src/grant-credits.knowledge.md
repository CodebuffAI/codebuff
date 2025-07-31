# Credit Grant System

## Operation ID Patterns

Credit operations use standardized operation IDs for idempotency:

**Format**: `{type}-{entityId}-{timestamp}`

Where:

- `type`: Operation type (free, referral, auto-topup, org-auto-topup)
- `entityId`: User ID or organization ID
- `timestamp`: `YYYY-MM-DDTHH:mm` format from `generateOperationIdTimestamp()`

**Time sources**:

- Monthly grants: Use next reset date (ensures one grant per cycle)
- Auto-topup: Use current time (allows multiple top-ups per day)

**Idempotency**:

- Primary key constraint on `credit_ledger.operation_id`
- Graceful handling of duplicate operations (log and continue)
- Deterministic IDs prevent duplicate grants
