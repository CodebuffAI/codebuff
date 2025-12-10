# Common Package Knowledge

This package contains code shared across the Codebuff monorepo, including the `web` (Next.js), `cli`, and `sdk` packages.

## Key Areas

- **Database (`src/db`)**: Drizzle ORM schema (`schema.ts`), configuration, and migration logic
- **Utilities (`src/util`)**: Shared helper functions
- **Types (`src/types`)**: Shared TypeScript types and interfaces
- **Constants (`src/constants`)**: Shared constant values
- **API Keys (`src/api-keys`)**: Encryption/decryption utilities for sensitive data

## Database Migrations

- Schema defined in `common/src/db/schema.ts`
- Generate migrations: `bun run --cwd common db:generate`
- Apply migrations: `bun run --cwd common db:migrate`

## Credit Grant Management

Credit grants are managed in `packages/billing/src/grant-credits.ts`:

- Use `processAndGrantCredit` for standalone grants (handles retries and failure logging)
- Use `grantCreditOperation` for grants within a larger database transaction
- Grant types: 'free', 'referral', 'rollover', 'purchase', 'admin'
- Each type has priority level from `GRANT_PRIORITIES`
- Always include unique `operation_id` for tracking

### Credit Grant Flow

1. Create local credit grant record immediately
2. Create Stripe grant asynchronously
3. Webhook updates local grant with Stripe ID when confirmed

### Monthly Reset Flow

1. Calculate unused purchase/rollover credits
2. Create new rollover grant if needed
3. Reset usage to 0 and update `next_quota_reset`
4. Create new free/referral grants with expiration
