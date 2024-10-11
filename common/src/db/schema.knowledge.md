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

3. UI Components

   - displaying referral information
   - sharing referral code
   - regenerating referral code
   - inputting referral link/code manually

4. API Routes

   - Create `web/src/app/api/referrals/route.ts` for referral-related operations
   - Implement security measures to prevent system abuse:
     a. Add validation to prevent self-referrals:
     - Check if the referred user ID is different from the referrer's ID
     - Reason: Prevents users from gaining benefits by referring themselves
       b. Limit each referral code to be used 5 times:
     - Keep a count of successful referrals for each code
     - Reject referrals once the limit is reached
     - Reason: Prevents a single code from being overused, encouraging wider distribution
       c. Implement rate limiting for referral code generation:
     - Use a local cache that clears daily
     - Limit the number of codes a user can generate per day
     - Reason: Prevents spam and abuse of the referral system
   - Implementation tips:
     - Use a middleware or decorator for rate limiting
     - Implement atomic operations for updating referral counts to handle concurrent requests
   - Update user quota when a referral is successful
     - Use a database transaction to ensure atomicity of referral creation and quota update
     - Reason: Maintains data consistency by ensuring both operations succeed or fail together
   - Important: Implement these security measures in the GET method of the referrals API route
   - Important: Implement these security measures in the GET method of the referrals API route
     - Reason: Ensures ongoing validation of referrals, not just at the point of creation
     - Helps maintain system integrity by constantly checking for potential abuse

5. Authentication Flow

   - Modify `web/src/app/api/auth/[...nextauth]/auth-options.ts` to add referral code to `redirect` URL, if it was provided.
   - Ensure proper error handling for all new operations
   - Update `web/src/app/onboard/page.tsx` to automatically create a referral and update quotas when a user visits with a `referral_code` query parameter:
     - Extract the `referral_code` from the query parameters
     - If a valid `referral_code` is present, call the referral API to create the referral and update quotas
     - Handle any errors that may occur during this process
     - Provide feedback to the user about the successful referral or any issues

6. Constants
   - Add referral-related constants (e.g., quota reward amounts) to `common/src/constants.ts`

6. Authentication Flow

   - Modify `web/src/app/api/auth/[...nextauth]/auth-options.ts` to add referral code to `redirect` URL, if it was provided.
   - Ensure proper error handling for all new operations

7. Testing

   - Add unit tests for new database operations and API routes
   - Create integration tests for the referral flow

8. Documentation

   - Update relevant documentation to include information about the referral system

## Notes

- The existing `quota` field in the `user` table will be used to manage referral rewards
- The referral system leverages the composite primary key of `referrer_id` and `referred_id` for efficiency
- The `referral_code` is stored in the `user` table for simplified lookups and management
