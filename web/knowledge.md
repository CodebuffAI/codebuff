# Manicode Web Application Knowledge

## Referral System Workflow

The referral system in Manicode follows this high-level workflow:

1. **Referral Code Generation**:
   - Each user is assigned a unique referral code upon account creation.
   - The referral code is stored in the `user` table in the database.

2. **Sharing Referral Links**:
   - Users can share their referral code or a full referral link.
   - Referral link format: `${env.NEXT_PUBLIC_APP_URL}/redeem?referral_code=${referralCode}`

3. **Redeeming Referrals**:
   - New users can enter a referral code during signup or on the referrals page.
   - Existing users can enter referral codes on the referrals page.

4. **Referral Processing**:
   - When a referral code is used, both the referrer and the referred user receive bonus credits.
   - The referral is recorded in the `referral` table, linking both users.

5. **Credit Application**:
   - Bonus credits are added to the users' quotas.
   - Credits persist across subscription changes (upgrades/downgrades).

6. **Referral Status Display**:
   - Users can view their referrals and earned credits on the referrals page.
   - The UI shows both successful referrals made and any referral that brought the user to the platform.

7. **Security Measures**:
   - Users cannot use their own referral code.
   - There's a limit on how many times a referral code can be used.
   - Referral codes are validated before processing.

8. **Integration with Subscription System**:
   - When users change subscription tiers, their accumulated referral credits are preserved and added to the new base quota.

Key Components:
- `web/src/app/referrals/page.tsx`: UI for displaying and managing referrals
- `web/src/app/api/referrals/route.ts`: API endpoints for referral operations
- `web/src/app/redeem/page.tsx`: Handles redirection for referral links
- `web/src/app/api/stripe/webhook/route.ts`: Manages subscription changes, preserving referral credits

Remember to keep this knowledge file updated as the referral system evolves or new features are added.

