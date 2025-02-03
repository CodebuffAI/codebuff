# Codebuff Web Application

## Authentication Flow

1. **Auth Code Validation**:
   - Login page validates auth code from URL
   - Checks token expiration and handles invalid codes
   - Configured in `web/src/app/login/page.tsx`

2. **OAuth Flow**:
   - Uses NextAuth.js with GitHub
   - Configured in `web/src/app/api/auth/[...nextauth]/auth-options.ts`

3. **User Onboarding**:
   - Links fingerprintId with user account
   - Processes referral codes during signup
   - Creates new session and user data

4. **Security**:
   - HTTP-only cookies for session management
   - CSRF protection for authenticated routes
   - Secure WebSocket connections in production

## Environment Setup

- Uses `@t3-oss/env-nextjs` for type-safe environment configuration
- Required variables in `.env.local`:
  - NEXT_PUBLIC_APP_URL
  - NEXT_PUBLIC_BACKEND_URL
  - NEXT_PUBLIC_SUPPORT_EMAIL

## UI Components

### Component Architecture
- Use shadcn UI components from `web/src/components/ui/`
- Install new components: `bunx --bun shadcn@latest add [component-name]`
- Keep components focused and reusable
- Extract shared styles into base components
- Let parent components control height with Tailwind classes
- Use Lucide icons from 'lucide-react' package
- Theme-aware components use CSS variables from globals.css

### Mobile Support
- Use shadcn's Sidebar component for mobile navigation
- Support swipe gestures and bottom sheets
- Preserve scroll position when dismissing sheets
- Keep drag indicators visible during scroll
- Handle responsive layouts with Tailwind breakpoints

### Terminal Component
- Must provide single string/element as children
- Use theme.dark for ColorMode
- Support text wrapping and overflow handling
- Handle height responsively with Tailwind classes
- Auto-scroll to bottom on new content
- Extract code blocks from responses
- Support command history and input handling

## Analytics Implementation

### PostHog Integration
- Initialize after user consent
- Respect Do Not Track setting
- Track events with consistent naming: `category.event_name`
- Include relevant context (theme, referrer, etc.)
- Place PostHogProvider above other providers
- Handle cleanup with posthog.shutdown()

### Event Categories
- home.* - Home page events
- demo_terminal.* - Terminal interactions
- auth.* - Authentication events
- subscription.* - Plan changes
- referral.* - Referral system
- docs.* - Documentation views
- usage.* - Usage tracking
- navigation.* - User navigation
- toast.* - Notifications

### Event Properties
Include relevant properties for each event type:
```typescript
// Auth events
{
  provider: 'github' | 'google',
  success: boolean,
  error?: string
}

// Subscription events
{
  current_plan: string,
  target_plan?: string,
  source: 'pricing_page' | 'user_menu' | 'usage_warning'
}
```

## Referral System

### Core Features
- Each user gets unique referral code
- Referral links include UTM tracking
- System tracks successful referrals
- Credits awarded to both referrer and referee
- Maximum referral limit enforced
- Referral codes only submitted via CLI

### Implementation
- Validate referral codes during signup
- Track referral status in database
- Handle referral bonuses through quota system
- Preserve referral credits through plan changes

## Content Management

### Documentation
- Content in MDX files under `src/content/`
- Categories: help, tips, showcase, case-studies
- Each doc needs frontmatter (title, section, tags, order)
- Files sorted by order within sections
- Support custom MDX components
- Handle mobile responsiveness

### API Routes
- Split complex routes into focused endpoints
- Include CORS headers in all responses
- Validate requests with Zod
- Handle rate limiting appropriately
- Return consistent error formats
- Use proper HTTP status codes

## Development Guidelines

1. Use React Query for API calls:
   - Automatic caching and revalidation
   - Loading and error states
   - Deduplication of requests

2. Keep business logic in utility files:
   - Payment flows in `src/lib/stripe.ts`
   - Analytics in `src/lib/analytics.ts`
   - Shared utils in `src/lib/utils.ts`

3. Type checking after changes:
   ```bash
   bun run --cwd common build && bun run --cwd web tsc
   ```

4. Component Guidelines:
   - Use client components for interactivity
   - Follow shadcn patterns
   - Keep state management simple
   - Handle loading states appropriately

## Stripe Integration

### Key Points
- Preview subscription changes with retrieveUpcoming()
- Handle webhooks for subscription events
- Track usage with billing.meterEvents.create
- Preserve usage data during plan changes
- Include CORS headers in all responses
- Handle rate limiting appropriately

### Subscription Management
- Cannot add duplicate prices
- Map existing items to new prices
- Set proration_behavior appropriately
- Handle unused time credits automatically
- Validate subscription states
- Track metered usage accurately
- Handle plan upgrades and downgrades
