# Legacy Hosted Database Schema Guidelines

> **Legacy hosted-surface note:** Openbuff's active product scope is local/BYOK CLI and SDK usage. These database notes are retained only for legacy upstream schema context while `packages/internal` still exists for shared provider helpers. Do not use this file to introduce new Openbuff-hosted web, billing, credit, subscription, Stripe, or product-auth surfaces.

## Local Development Setup

### Monitoring Database Changes

For real-time monitoring of database changes, use psql's `\watch` command:

```sql
SELECT ... FROM table \watch seconds;
```

Local database setup requires:

1. Docker running
2. Run: `bun --cwd packages/internal run db:start`
3. Then run schema operations

## Environment Setup

Database setup requires:

1. Running Docker instance
2. **Infisical CLI**: Must be logged in for environment variables
3. **Use Infisical CLI**: Load environment variables via Infisical before running commands
4. Commands: Start Docker → `bun --cwd packages/internal run db:start` → schema operations

## Index Management

Define indexes in schema.ts rather than migrations:

- Keeps structural elements centralized
- Makes indexes visible during review
- Serves as documentation for query optimization

Index Performance Guidelines:

- Index foreign keys and common filter columns
- Avoid indexing high-cardinality timestamp columns with range queries
- Consider selectivity - how well indexes narrow results

Key indexing decisions:

- Index foreign keys used in joins (user_id, fingerprint_id)
- Focus on columns with high selectivity in WHERE clauses

## Column Defaults and Calculations

- Use Postgres GENERATED ALWAYS AS for computed values from other columns
- Use defaultNow() for new timestamp columns without external source
- Store actual values from external upstream sources rather than recalculating them locally when maintaining legacy hosted schemas

## Referral System Implementation

### User Table

- Unique referral code: `'ref-' + UUID`
- `referral_limit` field (default 5)

### Referral Table

- Links referrer_id and referred_id
- Tracks status ('pending', 'completed') and credits
- Composite primary key: (referrer_id, referred_id)

### Constraints

- Referral codes must be unique
- Users cannot refer themselves
- Maximum referrals per user enforced via referral_limit

## Session Management

Session table links:

- User authentication state
- Fingerprint tracking
- Session expiration

## Message Tracking

Message table stores:

- Token counts (input/output/cache)
- Cost calculations and credits
- Client request correlation
- Generated `lastMessage` column from request JSON

## Data Sources

- Legacy upstream hosted deployments treated external payment providers as source-of-truth systems for account data.
- Openbuff local/BYOK mode does not use hosted payment-provider billing or database webhook synchronization.
