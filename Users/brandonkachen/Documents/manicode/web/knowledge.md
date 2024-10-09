# Manicode Web Application

## Referral System

The referral system is a key feature of the Manicode web application. It allows users to refer others and earn credits for successful referrals.

### High-Level Workflow

1. **Referral Code Generation**:
   - Each user is assigned a unique referral code upon account creation.
   - Referral codes are stored in the `user` table of the database.

2. **Sharing Referrals**:
   - Users can share their referral code or a referral link.
   - Referral link format: `${env.NEXT_PUBLIC_APP_URL}/redeem?referral_code=${referralCode}`

3. **Redeeming Referrals**:
   - New users can enter a referral code during signup or on the referrals page.
   - The system validates the referral code and creates a referral record.

4. **Credit Distribution**:
   - Both the referrer and the referred user receive bonus credits.
   - Credit amount is defined by `CREDITS_REFERRAL_BONUS` in constants.

5. **Referral Tracking**:
   - Referrals are tracked in the `referral` table, linking referrer and referred users.
   - The referrals page displays a user's referral history and earned credits.

6. **Quota Management**:
   - Referral credits are added to the user's quota.
   - When users upgrade or downgrade their subscription, referral credits are preserved.

### Key Components

- `web/src/app/referrals/page.tsx`: Main referrals UI
- `web/src/app/api/referrals/route.ts`: API route for referral operations
- `web/src/app/api/stripe/webhook/route.ts`: Handles subscription changes, preserving referral credits
- `common/src/db/schema.ts`: Database schema including user and referral tables

### Important Considerations

- Referral codes are unique per user.
- Referral links redirect unauthenticated users to the login page before processing.
- The system prevents users from referring themselves.
- There's a limit on the number of times a referral code can be used.

<!-- ... existing knowledge file ... -->
