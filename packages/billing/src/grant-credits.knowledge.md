# Credit Grant System

## Idempotency Patterns

Both credit operations use a standardized format for operation IDs:
`type-${userId}-${YYYY-MM-DDTHH:mm}`

The timestamp portion (YYYY-MM-DDTHH:mm) is generated from:
- Monthly Grants: The next reset date
- Auto-topup: The current time

This provides:
- Minute-level precision for uniqueness
- Human-readable timestamps with ISO-style separators
- Consistent format across operations
- Different time sources for different needs:
  - Reset date ensures one grant per cycle
  - Current time allows multiple top-ups per day

Both patterns rely on:
- Deterministic operation IDs based on user + time
- Database unique constraint on credit_ledger.operation_id
- Graceful handling of constraint violations (log and continue)