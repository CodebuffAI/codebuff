# Codebuff Web Application

## Build Configuration

When using Next.js 15+ with contentlayer:
- Disable worker threads in next.config.mjs to prevent worker errors:
  ```js
  experimental: {
    workerThreads: false,
    cpus: 1
  }
  ```
- Add onSuccess handler in contentlayer.config.ts:
  ```js
  onSuccess: () => {
    return Promise.resolve()
  }
  ```

## Authentication Flow

1. **Auth Code Validation**:
   - Login page validates auth code from URL
   - Checks token expiration and handles invalid codes
   - Configured in `web/src/app/login/page.tsx`

2. **OAuth Flow**:
   - Uses NextAuth.js with GitHub
   - Configured in `web/src/app/api/auth/[...nextauth]/auth-options.ts`

3. **User Onboarding**:
   - After successful OAuth, the onboarding page processes the auth code
   - Creates a new session, linking the `fingerprintId` with the user's account

4. **Referral Processing**:
   - During onboarding, handles any referral codes, applying bonuses if valid

5. **Session Management**:
   - Establishes a session for the authenticated user
   - Provides necessary user data for the npm app to retrieve via WebSocket

### Interaction with Other Components

- **npm app**: Initiates the process by generating a `fingerprintId` and opening the login URL
- **Backend**: Handles WebSocket communications and session verification

### Key Security Considerations

- Validate auth codes thoroughly to prevent unauthorized access
- Use secure, HTTP-only cookies for session management
- Implement proper CSRF protection for all authenticated routes

## UI Patterns

### HTML Structure in Components

- Avoid nesting `<p>` tags inside other `<p>` tags - this causes React hydration errors
- Use `<div>` tags instead of `<p>` tags when nesting is needed
- This is especially important in card components where content may be nested

### Section Title Gradients

- Use blue-to-purple gradients for hero and call-to-action sections:
  ```tsx
  'bg-gradient-to-br from-blue-600 via-blue-800 to-purple-700 dark:from-blue-400 dark:via-blue-600 dark:to-purple-500'
  ```
- Use simple foreground fade for content section headers:
  ```tsx
  'bg-gradient-to-b from-foreground to-foreground/70'
  ```
- This creates visual hierarchy: vibrant gradients for first/last impressions, subtle fades for content sections

### CRT Screen Effects

When creating retro CRT monitor effects:

- Use linear gradients instead of radial for screen edges - radial creates unrealistic circular vignetting
- Combine horizontal and vertical gradients for authentic edge darkening
- Keep content area clear (97% transparent in middle)
- Use subtle rounded corners (40px/30px) to match real CRT monitors
- Layer multiple effects: scanlines, text flicker, and screen glow

### Demo Content Guidelines

When creating interactive demos:

- Show suggested actions rather than simulated errors
- Use welcoming, positive messaging
- Include emojis and clear descriptions for each action
- Provide a clear path for users to discover features
- Keep help/documentation easily accessible

### Terminal Component Usage

- Must provide single string/element as children
- Use theme.dark for ColorMode
- Support text wrapping and overflow handling
- Handle height responsively with Tailwind classes
- Auto-scroll to bottom on new content
- Extract code blocks from responses
- Support command history and input handling

### Card Design

- Use shadcn Card component for consistent card styling
- For floating cards (e.g., cookie consent, notifications), two approaches:
  1. Container-based positioning:
     - Use container class for consistent page margins
     - Use inset-x-0 for full-width on mobile
     - Add md:left-4 and md:right-auto for desktop positioning
     - Use md:ml-0 to override auto margins
  2. Fixed positioning with explicit margins:
     - Use fixed with bottom-4 left-4 right-4 for mobile
     - Use md:left-8 md:right-auto for desktop (matches container padding)
     - Simpler approach when container class causes positioning issues
  - Common styles for both approaches:
    - Add backdrop-blur-sm and bg-background/80 for semi-transparent effect
    - Set z-50 to ensure card appears above other content
    - Use transition-opacity for smooth fade effects

### Data Fetching

- **Prefer `useQuery` and `useMutation`**: For all data fetching and mutations, use `@tanstack/react-query`'s `useQuery` and `useMutation` hooks instead of `useEffect` with `fetch`. This provides better caching, state management, and a more declarative API.

### Code Style

- Use ts-pattern's match syntax instead of complex if/else chains
- Match syntax provides better type safety and more readable code
- Especially useful when handling multiple related conditions
- Example:
  ```typescript
  await match(input)
    .with('exact-match', () => {
      /* handle exact match */
    })
    .with(P.string.includes('partial'), () => {
      /* handle partial match */
    })
    .with(
      P.when((s: string) => s.includes('a') && s.includes('b')),
      () => {
        /* handle multiple conditions */
      }
    )
    .otherwise(() => {
      /* handle default case */
    })
  ```

### Error Handling

#### Rate Limit Handling

- Use HTTP status code 429 to detect rate limits
- Show user-friendly error messages in the UI
- For React Query mutations:

  ```typescript
  interface ApiResponse {
    // response type
  }

  const mutation = useMutation<ApiResponse, Error, string>({
    mutationFn: async (input) => {
      const response = await fetch('/api/endpoint')
      if (!response.ok) {
        const error = await response.json()
        if (response.status === 429) {
          throw new Error('Rate limit exceeded. Please try again in a minute.')
        }
        throw new Error(error.error || 'Failed to get response')
      }
      return response.json()
    }
  })

  // Use mutation.isPending (not isLoading) for loading state
  return (
    <div className={mutation.isPending ? 'opacity-50' : ''}>
      {mutation.isPending && <LoadingSpinner />}
    </div>
  )

  // Important: Use isPending instead of isLoading in React Query v5+
  // - isPending: true during the first mutation
  // - isLoading: deprecated in v5, use isPending instead
  ```

### UI Component State Management

- Separate independent visual states into their own state variables
- Avoid deriving visual states from content/data states
- Pass visual states as explicit props to child components
- Example: For a component with error and content:

  ```typescript
  // Good
  const [showError, setShowError] = useState(true)
  const [content, setContent] = useState('')

  // Avoid
  const [content, setContent] = useState('error')
  const showError = content === 'error'
  ```

### UI Component Library

- Use shadcn UI components instead of native HTML elements
- Maintain consistency with existing component patterns
- Example: Prefer shadcn Dialog over HTML dialog element
- Find components in `web/src/components/ui/`
- Install new shadcn components with: `bunx --bun shadcn@latest add [component-name]`
- Use Lucide icons instead of raw SVGs for consistency
- Import icons from 'lucide-react' package
- For theme-aware components:
  - Use CSS variables defined in globals.css (e.g. --background, --foreground)
  - Use utility classes like bg-primary and text-primary-foreground
  - These automatically handle light/dark mode transitions
  - Example: `bg-primary text-primary-foreground hover:bg-primary/90`

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

## Analytics Implementation

### PostHog Integration

- Initialize after user consent
- Respect Do Not Track setting
- Track events with consistent naming: `category.event_name`
- Include relevant context (theme, referrer, etc.)
- Place PostHogProvider above other providers
- Handle cleanup with posthog.shutdown()

### PostHog User Identification

When using PostHog analytics:

- Use email as primary identifier (distinct_id) for consistent cross-system tracking but store user_id as a property for internal reference
- This ensures consistent user tracking across different systems and services

### Event Categories

- home.\* - Home page events
- demo_terminal.\* - Terminal interactions
- auth.\* - Authentication events
- subscription.\* - Plan changes
- referral.\* - Referral system
- docs.\* - Documentation views
- usage.\* - Usage tracking
- navigation.\* - User navigation
- toast.\* - Notifications

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
  source: 'pricing_page' | 'user_menu' | 'usage_warning'
}
```

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

### High-Level Workflow

1. **Referral Code Generation**:
   - Each user is assigned a unique referral code upon account creation
   - Referral codes are stored in the `user` table of the database

2. **Sharing Referrals**:
   - Users can share their referral code or a referral link
   - Referral link format: `${env.NEXT_PUBLIC_APP_URL}/redeem?referral_code=${referralCode}`

3. **Redeeming Referrals**:
   - New users can enter a referral code during signup or on the referrals page
   - The system validates the referral code and creates a referral record
   - Each referral code has a maximum claim limit - show appropriate messaging when this limit is reached

4. **Credit Distribution**:
   - Both the referrer and the referred user receive bonus credits
   - Credit amount is defined by `CREDITS_REFERRAL_BONUS` in constants

5. **Referral Tracking**:
   - Referrals are tracked in the `referral` table, linking referrer and referred users
   - The referrals page displays a user's referral history and earned credits

6. **Quota Management**:
   - Referral credits are added to the user's quota
   - When users upgrade or downgrade their subscription, referral credits are preserved

### Key Components

- `web/src/app/referrals/page.tsx`: Main referrals UI
- `web/src/app/api/referrals/route.ts`: API route for referral operations
- `web/src/app/api/stripe/webhook/route.ts`: Handles subscription changes, preserving referral credits
- `common/src/db/schema.ts`: Database schema including user and referral tables

### Important Considerations

- Referral codes are unique per user
- Referral links redirect unauthenticated users to the login page before processing
- The system prevents users from referring themselves
- There's a limit on the number of times a referral code can be used
- Referral codes can only be submitted through the Codebuff CLI app, not through the website

## Verifying Changes

After making changes to the web application code, always run type checking:

```bash
bun run --cwd common build && bun run --cwd web tsc
```

This ensures type safety is maintained across the application.

Important: When modifying or using code from common:

- Always build common package first before running web type checking
- Changes to common won't be reflected in web until common is rebuilt
- This applies to new exports, type changes, and utility functions

## File Naming Conventions

- **Components and Hooks**: Use kebab-case for filenames (e.g., `model-config-sheet.tsx`, `use-model-config.ts`). This ensures consistency across the project.
