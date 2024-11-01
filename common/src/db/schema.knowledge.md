# Database Schema Guidelines

## Column Defaults and Calculations

- Use Postgres's built-in calculated columns (GENERATED ALWAYS AS) instead of default values when computing values from other columns
- Example: For timestamp calculations based on other columns, prefer GENERATED ALWAYS AS over DEFAULT

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
