# Referral Feature Implementation Plan

## Database Schema Changes

### User Table Update

- Add `referral_code` field to the `user` table
  - Type: `text`
  - Unique constraint
  - Default value: randomly generated UUID with a prefix of `ref-`

### New Referral Table

Create a new `referral` table with the following structure:

- `referrer_id` (part of composite primary key, foreign key to user table)
- `referred_id` (part of composite primary key, foreign key to user table)
- `status` (e.g., 'pending', 'completed')
- `created_at` timestamp
- `completed_at` timestamp (when the referred user signs up)

## Implementation Steps

1. Update Database Schema

   - Modify `common/src/db/schema.ts` to include the new `referral` table and update the `user` table

2. NextJS Pages

   - Create `web/src/app/referrals/page.tsx` for users to view and manage referrals
   - Update `web/src/app/onboard/page.tsx` to handle referral codes during sign-up

3. API Routes

   - Create `web/src/app/api/referrals/route.ts` for referral-related operations
   - Add validation to prevent self-referrals.
   - Limit each referral code to be used 5 times.
   - Implement rate limiting for referral code generation in a local cache automatically clears every day. Nothing fancy needed.

4. Backend Logic

   - Update `backend/src/websockets/websocket-action.ts` for referral code generation and validation
   - Implement logic to update user quota when a referral is successful

5. Constants

   - Add referral-related constants (e.g., quota reward amounts) to `common/src/constants.ts`

6. Authentication Flow

   - Modify `web/src/app/api/auth/[...nextauth]/auth-options.ts` to add referral code to `redirect` URL, if it was provided.
   - Ensure proper error handling for all new operations

7. UI Components

   - displaying referral information
   - sharing referral code
   - regenerating referral code
   - inputting referral link/code manually

8. Testing

   - Add unit tests for new database operations and API routes
   - Create integration tests for the referral flow

9. Documentation

   - Update relevant documentation to include information about the referral system

## Notes

- The existing `quota` field in the `user` table will be used to manage referral rewards
- The referral system leverages the composite primary key of `referrer_id` and `referred_id` for efficiency
- The `referral_code` is stored in the `user` table for simplified lookups and management
