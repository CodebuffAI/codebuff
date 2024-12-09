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

### Documentation Layout

- Main content should replace existing content, not shift layout
- Sidebar navigation should show both sections and subsections
- Right sidebar (table of contents) should only appear when needed
- Keep layout changes minimal when navigating between pages
- Section landing pages (e.g. Help & FAQ, Tips & Tricks) should:
  - Display an intro section at the top
  - Show subsection content below for continuous scrolling
  - Act as content aggregators, not just navigation pages
- Navigation sidebar requirements:
  - Must remain visible and static at all times while scrolling
  - Use shrink-0 to prevent width collapse
  - Avoid position: sticky which allows scrolling out of view
  - Consider the sidebar a critical navigation element that should never be hidden
  - Support dual navigation modes:
    - Scroll to sections within current page
    - Navigate between different pages when clicking subsections from another page
- Navigation sidebar requirements:
  - Must remain visible and static at all times while scrolling
  - Use shrink-0 to prevent width collapse
  - Avoid position: sticky which allows scrolling out of view
  - Consider the sidebar a critical navigation element that should never be hidden
  - Support dual navigation modes:
    - Scroll to sections within current page
    - Navigate between different pages when clicking subsections from another page
- Navigation sidebar requirements:
  - Must remain visible and static at all times while scrolling
  - Use shrink-0 to prevent width collapse
  - Avoid position: sticky which allows scrolling out of view
  - Consider the sidebar a critical navigation element that should never be hidden
  - Support dual navigation modes:
    - Scroll to sections within current page
    - Navigate between different pages when clicking subsections from another page
- Fixed elements must account for the navbar:
  - Never use absolute positioning (top: 0)
  - Fixed sidebars should maintain spacing below navbar
  - Preserve consistent layout across all pages
- Navigation sidebar requirements:
  - Must remain visible and static at all times while scrolling
  - Use shrink-0 to prevent width collapse
  - Avoid position: sticky which allows scrolling out of view
  - Consider the sidebar a critical navigation element that should never be hidden

### MDX Components

- All components used in MDX files must be explicitly imported and passed to the MDX provider
- Custom components like CodeDemo need to be registered before they can be used in MDX content
- Components referenced in MDX are not automatically imported - they must be provided through the MDX context
- MDX components must be Client Components - cannot use Server Components
- Use dynamic imports with next/dynamic for MDX components to ensure proper client-side rendering
- When using dynamic imports:
  - Export the component as named export (not default)
  - Use .then() to extract the named component: 
  ```tsx
  dynamic(() => import('@/components/docs/mdx/code-demo').then((mod) => mod.CodeDemo))
  ```
- Custom MDX components must match HTML element types:
  - For h1-h6, component must accept all HTMLHeadingElement props
  - Props type must extend DetailedHTMLProps<HTMLAttributes<HTMLHeadingElement>, HTMLHeadingElement>
  - Children prop must be explicitly typed as required

### Documentation Layout

- Main content should replace existing content, not shift layout
- Sidebar navigation should show both sections and subsections
- Right sidebar (table of contents) should only appear when needed
- Keep layout changes minimal when navigating between pages
- Section landing pages (e.g. Help & FAQ, Tips & Tricks) should:
  - Display an intro section at the top
  - Show subsection content below for continuous scrolling
  - Act as content aggregators, not just navigation pages

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

### Banner Design

- For mobile layouts:
  - Remove decorative elements (icons, illustrations) that don't add functional value
  - Focus on essential content and actions
  - Prefer clean, text-focused layouts over visual embellishments
- For desktop:
  - Can include supplementary visual elements to enhance aesthetics
  - Maintain proper spacing between icons and text
  - Consider text alignment and element placement

### Text Selection

- When users click to copy command snippets or code blocks, select the entire text
- This improves UX by making it clear what will be copied
- Implementation: Add `user-select: all` to clickable code elements
- Use this pattern for npm install commands, terminal commands, and other copyable snippets

### Video Player Behavior

- Prefer focused video watching over multitasking
- When embedding videos, implement UI that encourages users to finish or explicitly exit video before continuing page navigation
- This promotes better engagement with video content
- Consider modal/overlay implementations for video players rather than inline embedding

## Component Architecture

### Success State Pattern
- Use CardWithBeams component for success/completion states
- Examples: Payment success, onboarding completion
- Consistent layout:
  - Title announcing success
  - Description of completed action
  - Optional next steps or instructions
  - Can include media (images, icons)
- Found in `web/src/components/card-with-beams.tsx`

### UI Component Library

- Use shadcn UI components instead of native HTML elements
- Maintain consistency with existing component patterns
- Example: Prefer shadcn Dialog over HTML dialog element
- Find components in `web/src/components/ui/`
- Install new shadcn components with: `bunx --bun shadcn@latest add [component-name]`
- Use Lucide icons instead of raw SVGs for consistency
- Import icons from 'lucide-react' package

### Component Architecture

- Extract shared styles into reusable components or base components
- Avoid duplicating Tailwind classes across similar components
- When creating variants of a component:
  - Create a base component with shared structure/styles
  - Pass variant-specific content via props
  - Keep styling consistent between variants
- Example: Banner variants should share container and button styles

### Business Logic Organization

- Shared business logic should be centralized in utility files
- Payment/checkout flows belong in stripe-related utilities
- Analytics/tracking logic belongs in dedicated tracking files
- Example locations:
  - Payment flows: `src/lib/stripe.ts`
  - Analytics: `src/lib/linkedin.ts`
  - Other shared utils: `src/lib/utils.ts`
- Avoid duplicating business logic in components
- Components should import and use shared utilities

### UI Patterns

For expandable/collapsible UI elements:
- Use React state management instead of CSS-only solutions
- Track currently open item with useState to ensure only one section is open at a time
- Toggle visibility by swapping icons rather than rotating them
- Example: Use different icons (ChevronDown/ChevronUp) based on state instead of CSS transforms

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
    <QueryProvider>{/* Interactive components go here */}</QueryProvider>
  </SessionProvider>
</ThemeProvider>
```

### Component Layering

Important considerations for interactive components:

1. Pricing Cards Layout:
   - Pricing cards must remain in a single row
   - Use appropriate grid column settings to accommodate all tiers
   - Current layout supports 4 cards: Free, Pro Plus, Pro, and Enterprise
   - Maintain consistent card heights and spacing

2. Z-index Requirements:

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

````jsx
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

The referral system is a key feature of the Codebuff web application. It allows users to refer others and earn credits for successful referrals.

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
- Referral codes can only be submitted through the Codebuff CLI app, not through the website.

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
````

- For error responses, include error field in the type:

```typescript
type ApiResponse = SuccessResponse | { error: string }
NextResponse<ApiResponse>
```

## Stripe Integration

Stripe webhooks (`web/src/app/api/stripe/webhook/route.ts`) handle:

- Subscription creation, updates, and deletions.
- Invoice payments.

Key functions:

- `handleSubscriptionChange`: Updates user quota and subscription status.
- `handleInvoicePaid`: Resets quota and updates subscription status on payment.

### Subscription Updates

Important: When updating Stripe subscriptions:
- Cannot add duplicate prices to a subscription - each price can only be used once
- When updating existing items, pass the subscription item ID in the items array:
  ```js
  items: [{ id: 'si_existing', price: 'price_new' }]
  ```
- For new prices, add without an ID:
  ```js
  items: [{ price: 'price_new' }]
  ```
- Never delete subscription items before adding new ones - this can cause subscription to become invalid
- Map existing items to new prices while preserving their IDs:
  ```js
  items = subscription.items.data.map(item => ({
    id: item.id,
    price: newPriceId
  }))
  ```
- Set `proration_behavior: 'none'` to avoid partial period charges
- Consider providing migration coupons for customer retention
- Important: Stripe automatically handles unused time when updating subscriptions:
  - By default, creates credit for unused time on next invoice
  - To make a pure price change without credits, use `proration_behavior: 'none'`
  - Do not try to manually handle unused time credits
- Important: Stripe automatically handles unused time when updating subscriptions:
  - By default, creates credit for unused time on next invoice
  - To make a pure price change without credits, use `proration_behavior: 'none'`
  - Do not try to manually handle unused time credits
