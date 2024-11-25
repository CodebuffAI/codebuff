# Database Schema Guidelines

## Local Development Setup

Important: Local database must be initialized before running schema operations:

1. Docker must be running
2. Local database container needs to be created and healthy
3. Then schema operations (generate, migrate) can be run

## Environment Setup

Important: The database setup requires:

1. A running Docker instance
2. Proper environment configuration:
   - stack.env with ENVIRONMENT=local and NEXT_PUBLIC_ENVIRONMENT=local
   - .env.local with DATABASE_URL matching docker-compose.yml settings
3. Run commands in order:
   - Start Docker
   - Run database initialization (bun --cwd common db:start)
   - Run schema operations

Note: Setup has been primarily tested on Mac. Windows users may encounter platform-specific issues:

- When using \_\_dirname or path.join() in config files, convert Windows backslashes to forward slashes

## Index Management

Important: Define indexes in schema.ts rather than just migrations:
- Keeps all structural database elements in one place
- Makes indexes visible during schema review
- Serves as documentation for query optimization
- Helps track performance-critical queries

## Column Defaults and Calculations

- Use Postgres's built-in calculated columns (GENERATED ALWAYS AS) instead of default values when computing values from other columns
- Example: For timestamp calculations based on other columns, prefer GENERATED ALWAYS AS over DEFAULT
- The endDate field in quota queries is derived from next_quota_reset using COALESCE
- Important: When querying quota info, endDate already contains the next_quota_reset value - avoid redundant selection
- The endDate field in quota queries is derived from next_quota_reset using COALESCE
- Important: When querying quota info, endDate already contains the next_quota_reset value - avoid redundant selection

## Referral System Implementation

The referral system is implemented across several tables:

### User Table

- Each user has a unique referral code (format: 'ref-' + UUID)
- Tracks quota and subscription status

### Referral Table

- Links referrer and referred users
- Tracks referral status and credits awarded
- Uses composite primary key of (referrer_id, referred_id)

### Important Constraints

- Referral codes must be unique
- Users cannot refer themselves
- Maximum number of successful referrals per user is enforced

## Session Management

The session table links:

- User authentication state
- Fingerprint tracking
- Session expiration

## Message Tracking

The message table stores:

- Input/output token counts
- Cost calculations
- Cache usage metrics
- Client request correlation

- Store actual values instead of calculating them when the data comes from an external source
- Example: User creation dates should be pulled from Stripe rather than calculated locally
- Prefer defaultNow() for new timestamp columns that don't have an external source

## Data Sources

- Stripe is the source of truth for user account data including:
  - Subscription status
  - Customer IDs
- Keep Stripe and database in sync through webhooks and periodic reconciliation
