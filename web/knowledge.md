# Codebuff Web Application Knowledge

## Authentication and Login System

The authentication system in Codebuff's web application plays a crucial role in integrating with the npm app (CLI) to provide a seamless login experience. Here's what the web app needs to focus on:

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

## UI Patterns

### Logo Usage
- Include the Codebuff logo alongside the company name in key UI components
- Logo placement:
  - Navbar: Primary placement
  - Footer: Left side of sitemap
- Use Image component from Next.js for optimized loading
- Logo files:
  - `/public/favicon/apple-touch-icon.png`: Main logo
  - `/public/favicon/favicon.ico`: Favicon
  - `/public/favicon/favicon-16x16.ico`: Small variant

### Code Snippets
When displaying inline code snippets with copy buttons:
- Use `inline-block` on the container, not `inline-flex` or `flex`
- Keep the flex layout for internal alignment between code and copy button
- Example structure:
```jsx
<div className="inline-block">
  <div className="px-4 bg-gray-800 rounded-lg p-4 flex items-center gap-2">
    <code>npm install ...</code>
    <CopyIcon />
  </div>
</div>
```


### Toast Notifications

- Close buttons (X) should always be visible, not just on hover/focus
- This helps with discoverability and matches the project's emphasis on clear user interactions
- Implementation: Remove the `opacity-0` class from the close button's base styles

### Text Selection

- When users click to copy command snippets or code blocks, select the entire text
- This improves UX by making it clear what will be copied
- Implementation: Add `user-select: all` to clickable code elements
- Use this pattern for npm install commands, terminal commands, and other copyable snippets


## Component Architecture

### Client Components and Providers

- Important considerations for client-side interactivity:

1. Client Component Placement:
   - Place client components that need interactivity INSIDE provider components
   - Put client components after ThemeProvider, SessionProvider, and QueryProvider
   - Exception: Components that don't need provider context can go before providers

2. Common Issues:
   - Buttons/interactions may not work if component is placed before providers
   - State updates may fail silently when providers are missing
   - Always check component placement in layout hierarchy when debugging client-side issues

Example of correct ordering:
```jsx
<ThemeProvider>
  <SessionProvider>
    <QueryProvider>
      {/* Interactive components go here */}
    </QueryProvider>
  </SessionProvider>
</ThemeProvider>
```
### Component Layering

Important considerations for interactive components:

1. Z-index Requirements:
   - Interactive components must have proper z-index positioning AND be inside providers
   - Components with dropdowns or overlays should use z-20 or higher
   - The navbar uses z-10 by default
   - Banner and other top-level interactive components use z-20
   - Ensure parent elements have `position: relative` when using z-index

2. Common Issues:
   - Components may appear but not be clickable if z-index is too low
   - Moving components inside providers alone may not fix interactivity
   - Always check both provider context and z-index when debugging click events

Example of correct layering:
```jsx
<div className="relative z-20">...</div> // Interactive component
## Referral System

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
2. Users are directed to use the Codebuff CLI app for submitting referral codes.
3. The referrals page should include instructions for installing the CLI tool and using referral codes:
   - Install command: `npm i -g codebuff`
   - Usage: Users should paste their referral code in the CLI after installation.
4. Format CLI commands in a code-like pattern on the web interface for clarity.

This change ensures a consistent user experience across the Codebuff ecosystem and encourages CLI adoption.

## Environment Configuration

The application uses environment variables for configuration, which are managed through the `web/src/env.mjs` file. This setup ensures type-safe access to environment variables and proper validation.

### Module Resolution Troubleshooting

When encountering module resolution errors:

Important: For dotenv in Next.js:
- Use standard import: `import dotenv from 'dotenv'`
- Do not use `/lib/main.js` path as it's not exported in the package

When encountering other module resolution errors:
1. Check if package is properly installed in package.json and node_modules
2. Verify the package's module format (CommonJS vs ESM) matches how we're importing it
3. Look at the package's dist directory structure to understand how it expects to be imported
4. Consider build system configuration before assuming platform-specific (Windows/Mac) issues

Important: For Node.js ESM imports (.mjs files):
- Module resolution behaves differently between Windows and Unix systems
- Check both package.json "exports" field and physical file structure
- Reinstalling node_modules may not fix resolution issues if the underlying path resolution is incompatible
- Consider using package.json "imports" field for consistent cross-platform module resolution
- When encountering ERR_MODULE_NOT_FOUND on Windows:
  - Check if package uses CommonJS or ESM format
  - Consider switching to CommonJS alternatives (e.g., env-core instead of env-nextjs)
  - Verify package.json "type": "module" field matches expected module system
  - Look for platform-specific import paths in package dist structure

Important: For Node.js ESM imports (.mjs files):
- Module resolution behaves differently between Windows and Unix systems
- Check both package.json "exports" field and physical file structure
- Reinstalling node_modules may not fix resolution issues if the underlying path resolution is incompatible
- Consider using package.json "imports" field for consistent cross-platform module resolution
- When encountering ERR_MODULE_NOT_FOUND on Windows:
  - Check if package uses CommonJS or ESM format
  - Consider switching to CommonJS alternatives (e.g., env-core instead of env-nextjs)
  - Verify package.json "type": "module" field matches expected module system
  - Look for platform-specific import paths in package dist structure
- When encountering ERR_MODULE_NOT_FOUND on Windows:
  - Check if package uses CommonJS or ESM format
  - Consider switching to CommonJS alternatives (e.g., env-core instead of env-nextjs)
  - Verify package.json "type": "module" field matches expected module system
  - Look for platform-specific import paths in package dist structure

Important: For Node.js ESM imports (.mjs files):
- Module resolution behaves differently between Windows and Unix systems
- Check both package.json "exports" field and physical file structure
- Reinstalling node_modules may not fix resolution issues if the underlying path resolution is incompatible
- Consider using package.json "imports" field for consistent cross-platform module resolution

Important: For Node.js ESM imports (.mjs files):
- Module resolution behaves differently between Windows and Unix systems
- Check both package.json "exports" field and physical file structure
- Reinstalling node_modules may not fix resolution issues if the underlying path resolution is incompatible
- Consider using package.json "imports" field for consistent cross-platform module resolution

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
