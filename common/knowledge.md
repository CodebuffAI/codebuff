# Common Package Knowledge

This package contains code shared between the `web` (Next.js frontend/backend) and `backend` (CLI backend) packages.

## Key Areas

- **Database (`src/db`)**: Contains Drizzle ORM schema (`schema.ts`), configuration, and migration logic.
- **Utilities (`src/util`)**: Shared helper functions.
- **Types (`src/types`)**: Shared TypeScript types and interfaces.
- **Constants (`src/constants`)**: Shared constant values.

## Important Notes

### Crypto Utilities (`src/util/crypto.ts`)

- Provides functions for encrypting/decrypting and storing sensitive data like API keys (`encryptAndStoreApiKey`, `retrieveAndDecryptApiKey`, `clearApiKey`).
- **Security**: These functions **require** the 32-byte `API_KEY_ENCRYPTION_SECRET` to be passed in as a `secretKey` parameter from the calling environment (`web` or `backend`). The secret itself must **never** be stored or exposed in the `common` package.
- The calling environment is responsible for retrieving the secret from its respective `env.mjs` file.

### Database Migrations

- Schema is defined in `common/src/db/schema.ts`.
- Migrations are managed using `drizzle-kit`.
- Run `bun run --cwd common db:generate` to create new migration files after schema changes.
- Run `bun run --cwd common db:migrate` to apply pending migrations to the database.

## Credit Grant Management

When granting credits to users (monthly reset, referrals, etc.):
- Use the shared `processAndGrantCredit` helper in `@codebuff/billing` package
- Helper handles:
  - User validation
  - Cost per credit calculation
  - Stripe monetary amount conversion
  - Grant creation with proper metadata
- Grant types:
  - 'free' for monthly quota resets (expires next cycle)
  - 'referral' for referral bonuses (expires next cycle)
  - 'rollover' for unused purchase/rollover credits (never expires)
  - 'purchase' for bought credits (never expires)
  - 'admin' for manual grants (never expires)
- Each grant type has its own priority level from GRANT_PRIORITIES
- Always include operation_id to track related grants

### Credit Ledger Operations

- Operation IDs must be unique for each credit grant operation
- When granting credits to multiple users in a single transaction (e.g. referrals), ensure each grant has a unique operation ID
- For referrals, append the role (e.g. "-referrer" or "-referred") to the base operation ID

### Credit Grant Flow
1. Create local credit grant record immediately
2. Create Stripe grant asynchronously
3. Webhook updates local grant with Stripe ID when confirmed
4. This ensures:
   - Good UX: Users get credits immediately
   - Data consistency: We track Stripe confirmations
   - Reconciliation: Can find/fix mismatches via webhook

### Monthly Reset Flow
1. `calculateAndApplyRollover`:
   - Calculates unused purchase/rollover credits
   - Creates new rollover grant if needed
   - Resets usage to 0
   - Updates next_quota_reset
2. Create new free/referral grants with expiration
3. Create Stripe grants if needed

## Credit Delegation

Credit delegation functionality (finding organizations for repositories and consuming organization credits) has been moved to the `@codebuff/billing` package to avoid circular dependencies.