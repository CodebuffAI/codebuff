# Database Schema Guidelines

## Local Development Setup

### Monitoring Database Changes

For real-time monitoring of database changes, use psql's `\watch` command:

```sql
SELECT ... FROM table \watch seconds;
```

Local database setup requires:

1. Docker running
2. Run: `bun run exec -- bun --cwd common db:start`
3. Then run schema operations

## Environment Setup

Database setup requires:

1. Running Docker instance
2. **Infisical CLI**: Must be logged in for environment variables
3. **Use `exec` runner**: All commands must use `bun run exec --` to load environment variables
4. Commands: Start Docker → `bun run exec -- bun --cwd common db:start` → schema operations

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
- Store actual values from external sources (e.g., Stripe) rather than calculating locally

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

- Stripe is source of truth for user account data
- Keep Stripe and database synced via webhooks
