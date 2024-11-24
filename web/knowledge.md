# Codebuff Web Application Knowledge

## Authentication and Login System

The authentication system in Codebuff's web application plays a crucial role in integrating with the npm app (CLI) to provide a seamless login experience. Here's what the web app needs to focus on:

### Web App's Role in Authentication

1. **Auth Code Validation**:
   - The login page validates the auth code from the URL
   - Checks for token expiration and handles invalid codes

2. **OAuth Flow**:
   - Implements OAuth authentication using NextAuth.js
   - Configured in `web/src/app/api/auth/[...nextauth]/auth-options.ts`

3. **User Onboarding**:
   - After successful OAuth, creates new session linking fingerprintId with user account

4. **Session Management**:
   - Establishes session for authenticated user
   - Provides user data for npm app via WebSocket

### Key Security Considerations

- Validate auth codes thoroughly
- Use secure, HTTP-only cookies for session management
- Implement CSRF protection for authenticated routes

## UI Patterns

### Logo Usage

- Include the Codebuff logo alongside company name in key UI components
- Logo placement:
  - Navbar: Primary placement
  - Footer: Left side of sitemap
- Use Image component from Next.js for optimized loading

### Code Snippets

When displaying inline code snippets with copy buttons:

- Use `inline-block` on container, not `inline-flex` or `flex`
- Keep flex layout for internal alignment between code and copy button
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
- This helps with discoverability and matches project's emphasis on clear user interactions

### Banner Design

- For mobile layouts:
  - Remove decorative elements that don't add functional value
  - Focus on essential content and actions
  - Prefer clean, text-focused layouts
- For desktop:
  - Can include supplementary visual elements
  - Maintain proper spacing between icons and text

### Text Selection

- When users click to copy command snippets or code blocks, select entire text
- Use `user-select: all` for clickable code elements
- Use this pattern for npm install commands, terminal commands, and copyable snippets

## Component Architecture

### Success State Pattern
- Use CardWithBeams component for success/completion states
- Examples: Payment success, onboarding completion
- Consistent layout:
  - Title announcing success
  - Description of completed action
  - Optional next steps or instructions
  - Can include media (images, icons)

### UI Component Library

- Use shadcn UI components instead of native HTML elements
- Maintain consistency with existing component patterns
- Example: Prefer shadcn Dialog over HTML dialog element
- Find components in `web/src/components/ui/`
- Install new shadcn components with: `bunx --bun shadcn@latest add [component-name]`
- Use Lucide icons instead of raw SVGs for consistency

### Business Logic Organization

- Shared business logic should be centralized in utility files
- Payment/checkout flows belong in stripe-related utilities
- Analytics/tracking logic belongs in dedicated tracking files
- Example locations:
  - Payment flows: `src/lib/stripe.ts`
  - Analytics: `src/lib/linkedin.ts`
  - Other shared utils: `src/lib/utils.ts`

### Client Components and Providers

Important considerations for client-side interactivity:

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

## Environment Configuration

The application uses environment variables for configuration, which are managed through the `web/src/env.mjs` file. This setup ensures type-safe access to environment variables and proper validation.

Key points:

- Uses `@t3-oss/env-nextjs` for creating a type-safe environment configuration
- Loads environment variables from different `.env` files based on the current environment
- Defines separate server-side and client-side environment variables
- Includes critical configuration like database URL, authentication secrets, and Stripe API keys

## Type Management

### API Routes and Types

- When typing API responses in frontend components, use types from the corresponding API route file
- Don't create new types for API responses - reference the source of truth in the route files
- This ensures type consistency between frontend and backend

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
