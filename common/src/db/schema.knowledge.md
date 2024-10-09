# Referral Feature Implementation Plan

## Database Schema

The referral system uses the following tables:

### User Table

- Contains a `referral_code` field:
  - Type: `text`
  - Unique constraint
  - Default value: randomly generated UUID with a prefix of `ref-`

### Referral Table

- Structure:
  - `referrer_id` (part of composite primary key, foreign key to user table)
  - `referred_id` (part of composite primary key, foreign key to user table)
  - `status` (e.g., 'pending', 'completed')
  - `created_at` timestamp
  - `completed_at` timestamp (when the referred user signs up)

## Drizzle ORM Usage

When working with referrals, use Drizzle ORM's relational queries to efficiently fetch data:

```typescript
const user = await db.query.user.findFirst({
  where: eq(schema.user.id, userId),
  with: {
    referrals: true,
  },
})
```

This query will return the user along with their referrals. To get the referred user's information, you'll need to join with the user table again:

```typescript
const userWithReferrals = await db.query.user.findFirst({
  where: eq(schema.user.id, userId),
  with: {
    referrals: {
      with: {
        referred: true,
      },
    },
  },
})
```

This query will return the user, their referrals, and the information of the referred users.

## Best Practices

1. Use Drizzle ORM's relational queries instead of manual joins when possible.
2. Stick to the existing schema structure and avoid creating new fields or tables unless necessary.
3. When returning data from the API, transform it to match the frontend requirements while keeping the database queries efficient.

## API Response Structure

When returning referral data from the API, use a structure like this:

```typescript
export type ReferralData = {
  referralCode: string
  referrals: {
    id: string
    name: string | null
    email: string
    status: string
  }[]
}
```

This structure allows the frontend to display either the name (if available) or the email of the referred user, along with their referral status.

