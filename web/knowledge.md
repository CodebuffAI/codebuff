# Codebuff Web Application

## Build Configuration

When using Next.js with contentlayer:

- Suppress webpack infrastructure logging to prevent verbose cache messages:
  ```js
  webpack: (config) => {
    config.infrastructureLogging = {
      level: 'error',
    }
    return config
  }
  ```
- Add onSuccess handler in contentlayer.config.ts:
  ```js
  onSuccess: async () => {
    return Promise.resolve()
  }
  ```
- Build script filters contentlayer warnings: `"build": "next build 2>&1 | sed '/Contentlayer esbuild warnings:/,/^]/d'"`

### ESLint Configuration

ESLint is disabled during builds:

```js
eslint: {
  ignoreDuringBuilds: true,
}
```

## Authentication Flow

1. **Auth Code Validation**: Login page validates auth code from URL and checks expiration
2. **OAuth Flow**: Uses NextAuth.js with GitHub provider
3. **User Onboarding**: Onboarding page processes auth code, creates session linking fingerprintId with user account
4. **Referral Processing**: Handles referral codes during onboarding
5. **Session Management**: Establishes session for authenticated user

Key files:

- `web/src/app/login/page.tsx`: Auth code validation
- `web/src/app/api/auth/[...nextauth]/auth-options.ts`: NextAuth configuration
- `web/src/app/onboard/page.tsx`: Session creation and referral handling

## UI Patterns

### HTML Structure

- Avoid nesting `<p>` tags - causes React hydration errors
- Use `<div>` tags when nesting is needed

### Terminal Component

- Must provide single string/element as children
- Use `ColorMode.Dark` for dark theme
- Auto-scrolls to bottom on new content
- Handles input with onInput callback

### Card Design

- Use shadcn Card component for consistent styling
- For floating cards, use fixed positioning with backdrop-blur-sm and bg-background/80
- Set z-50 for proper layering

### Data Fetching

- Use `@tanstack/react-query`'s `useQuery` and `useMutation` instead of `useEffect` with `fetch`
- Use `isPending` instead of `isLoading` in React Query v5+

### Error Handling

- Use HTTP status 429 to detect rate limits
- Show user-friendly error messages
- Always display API error messages when present in response

### Component Architecture

- Use shadcn UI components from `web/src/components/ui/`
- Install new components: `bunx --bun shadcn@latest add [component-name]`
- Use Lucide icons from 'lucide-react' package
- Theme-aware components use CSS variables from globals.css

## Analytics Implementation

### PostHog Integration

- Initialize after user consent
- Use email as primary identifier (distinct_id)
- Store user_id as property for internal reference
- Track events with consistent naming: `category.event_name`

## Referral System

### Workflow

1. Users get unique referral codes upon account creation
2. Share referral links: `${env.NEXT_PUBLIC_CODEBUFF_APP_URL}/redeem?referral_code=${referralCode}`
3. New users redeem codes during signup/onboarding
4. Both referrer and referred user receive `CREDITS_REFERRAL_BONUS` credits
5. Referrals tracked in database with limits

### Key Components

- `web/src/app/referrals/page.tsx`: Main referrals UI
- `web/src/app/api/referrals/route.ts`: API operations
- `web/src/app/onboard/page.tsx`: Referral code processing

## Verifying Changes

After changes, run type checking:

```bash
bun run --cwd common build && bun run --cwd web tsc
```

Always build common package first before web type checking.

## File Naming Conventions

Use kebab-case for component and hook filenames (e.g., `model-config-sheet.tsx`, `use-model-config.ts`).
