# Manicode Web Application Knowledge
# Manicode Web Application Knowledge

## Authentication and Login System

The authentication system in Manicode's web application plays a crucial role in integrating with the npm app (CLI) to provide a seamless login experience. Here's what the web app needs to focus on:

### Web App's Role in Authentication

1. **Auth Code Validation**:

   - The login page (`web/src/app/login/page.tsx`) receives and validates the auth code from the URL.
   - It checks for token expiration and handles invalid or expired codes.

2. **OAuth Flow**:

   - Implements OAuth authentication (currently GitHub) using NextAuth.js.
   - Configured in `web/src/app/api/auth/[...nextauth]/auth-options.ts`.

3. **User Onboarding**:

   - After successful OAuth, the onboarding page (`web/src/app/onboard/page.tsx`) processes the auth code.
   - It creates a new session, linking the `fingerprintId` with the user's account.

4. **Referral Processing**:

   - During onboarding, it handles any referral codes, applying bonuses if valid.

5. **Session Management**:
   - Establishes a session for the authenticated user.
   - Provides necessary user data for the npm app to retrieve via WebSocket.

### Interaction with Other Components

- **npm app**: Initiates the process by generating a `fingerprintId` and opening the login URL.
- **Backend**: Handles WebSocket communications and session verification.

### Key Security Considerations

- Validate auth codes thoroughly to prevent unauthorized access.
- Use secure, HTTP-only cookies for session management.
- Implement proper CSRF protection for all authenticated routes.

## Referral System

## Error Handling

### API Response Errors

- Always display API error messages to users when present in the response
- Error messages from the API are pre-formatted for user display
- Check for `error` field in API responses before rendering success states
- Error messages should be shown in a prominent location, typically near the top of the component

This helps with:
- Consistent error handling across the application
- Better user experience through clear error communication
- Easier debugging by surfacing backend errors

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

   - Each referral code has a maximum claim limit - show appropriate messaging when this limit is reached.
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
- As of the latest update, referral codes can only be submitted through the Manicode CLI app, not through the website.

### CLI-based Referral Code Submission

To streamline the referral process and integrate it with the CLI tool:

1. The web interface no longer accepts referral code inputs.
2. Users are directed to use the Manicode CLI app for submitting referral codes.
3. The referrals page should include instructions for installing the CLI tool and using referral codes:
   - Install command: `npm i -g manicode`
   - Usage: Users should paste their referral code in the CLI after installation.
4. Format CLI commands in a code-like pattern on the web interface for clarity.

This change ensures a consistent user experience across the Manicode ecosystem and encourages CLI adoption.

## Environment Configuration

The application uses environment variables for configuration, which are managed through the `web/src/env.mjs` file. This setup ensures type-safe access to environment variables and proper validation.

Key points:

- Uses `@t3-oss/env-nextjs` for creating a type-safe environment configuration.
- Loads environment variables from different `.env` files based on the current environment.
- Defines separate server-side and client-side environment variables.
- Includes critical configuration like database URL, authentication secrets, and Stripe API keys.

## Pricing Structure

- Free tier: Limited credits per month
- Pro tier: $99/month with 10,000 credits
- Overage allowance: $0.90 per 100 credits
- Enterprise tier: Custom pricing and features

Pricing information is displayed on the pricing page (`web/src/app/pricing/page.tsx`).

Remember to keep this knowledge file updated as the application evolves or new features are added.

## Usage Tracking

The application includes a usage tracking feature to allow users to monitor their credit consumption:

- A separate page and API endpoint are dedicated to displaying usage data.
- The system tracks and displays the number of credits used in the current month.
- Implementation involves:
  1. Creating a new page for displaying usage data.
  2. Developing a new API endpoint to fetch usage information.
  3. Utilizing existing helper functions (if available) to calculate current month usage.
  4. Ensuring the backend only returns data for the authenticated user's current month usage.

This feature enhances user experience by providing transparency about resource consumption and helps users manage their account effectively.

## Type Management

### API Routes and Types

- When typing API responses in frontend components, use types from the corresponding API route file
- Don't create new types for API responses - reference the source of truth in the route files
- This ensures type consistency between frontend and backend

This structure helps in maintaining a clear separation of concerns while allowing necessary sharing of code between different parts of the application.

### NextResponse Typing

- Use `NextResponse<T>` to type API route responses
- Example:
```typescript
type ResponseData = { message: string }
NextResponse<ResponseData>
```
- For error responses, include error field in the type:
```typescript
type ApiResponse = SuccessResponse | { error: string }
NextResponse<ApiResponse>
```
