# Analytics Implementation

## PostHog Integration

Important: When integrating PostHog:
- Initialize after user consent
- Respect Do Not Track browser setting
- Anonymize IP addresses by setting `$ip: null`
- Use React Context to expose reinitialization function instead of reloading page
- Place PostHogProvider above other providers in component tree
- Track events with additional context (theme, referrer, etc.)
- For cookie consent:
  - Avoid page reloads which cause UI flicker
  - Use context to expose reinitialize function
  - Keep consent UI components inside PostHogProvider
  - Keep components simple - prefer single component over wrapper when possible
  - Place consent UI inside PostHogProvider to access context directly

Example event tracking:
```typescript
posthog.capture('event_name', {
  referrer: document.referrer,
  theme: theme,
  // Add other relevant context
})
```

## Event Tracking Patterns

Important event tracking considerations:
- Track location/source of identical actions (e.g., 'copy_action' from different places)
- For terminal interactions, track both the command and its result
- Pass event handlers down as props rather than accessing global posthog in child components
- Do not track UI theme in analytics events - this is not relevant for business metrics
- Track user consent events before initializing analytics to understand opt-out rates
- PostHog tracking must be done client-side - cannot be used in API routes or server components
- Track all user-facing notifications (toasts) to understand what messages users commonly see

## Event Categories

The application uses the following event categories for consistent tracking:

1. Home Page Events (`home.*`)
   - home.cta_clicked
   - home.video_opened
   - home.testimonial_clicked

2. Demo Terminal Events (`demo_terminal.*`)
   - demo_terminal.command_executed
   - demo_terminal.help_viewed
   - demo_terminal.theme_changed
   - demo_terminal.bug_fixed
   - demo_terminal.rainbow_added

3. Authentication Events (`auth.*`)
   - auth.login_started
   - auth.login_completed
   - auth.logout_completed

4. Cookie Consent Events (`cookie_consent.*`)
   - cookie_consent.accepted
   - cookie_consent.declined

4. Subscription Events (`subscription.*`)
   - subscription.plan_viewed
   - subscription.upgrade_started
   - subscription.payment_completed
   - subscription.change_confirmed

5. Referral Events (`referral.*`)
   - referral.link_copied
   - referral.code_redeemed
   - referral.invite_sent

6. Documentation Events (`docs.*`)
   - docs.viewed

7. Banner Events (`banner.*`)
   - banner.clicked

8. Usage Events (`usage.*`)
   - usage.warning_shown

Progress bar color coding:
- Blue: Normal usage (<90%)
- Yellow: High usage (90-95%)
- Red: Critical usage (>95%)
- Shows warning message when exceeding quota with overage rate details

9. Navigation Events (`navigation.*`)
   - navigation.docs_clicked
   - navigation.pricing_clicked

10. Toast Events (`toast.*`)
   - toast.shown

Properties that should be included with events:

1. Toast Events:
   ```typescript
   {
     title?: string,      // The toast title if provided
     variant?: 'default' | 'destructive'  // The toast variant
   }
   ```

Properties that should be included with events:

1. Usage Events:
   ```typescript
   {
     credits_used: number,
     credits_limit: number,
     percentage_used: number
   }
   ```

Properties that should be included with events:

1. Documentation Events:
   ```typescript
   {
     section: string // The documentation section being viewed
   }
   ```

2. Banner Events:
   ```typescript
   {
     type: 'youtube_referral' | 'referral',
     source?: string // The referrer if available
   }
   ```

Other Events:

1. Auth Events:
   ```typescript
   {
     provider: 'github' | 'google'
   }
   ```

2. Subscription Events:
   ```typescript
   {
     current_plan?: string,
     target_plan?: string
   }
   ```

3. Referral Events:
   ```typescript
   {
     referrer?: string,
     code?: string
   }
   ```

Example event tracking:
```typescript
import posthog from 'posthog-js'

// Component setup
const Component = () => {
  // Event tracking
  posthog.capture('category.event_name', {
    // Add relevant properties
  })
}
```

## Event Naming Convention

Event names should use dot notation to create natural groupings, with verb-first past tense actions. Format: `category.action_performed`

Examples by category:

### Demo Terminal Events
- demo_terminal.command_executed
- demo_terminal.help_viewed  
- demo_terminal.theme_changed
- demo_terminal.bug_fixed

### Authentication Events  
- auth.login_started
- auth.login_completed
- auth.logout_completed

### Subscription Events
- subscription.plan_viewed
- subscription.upgrade_started
- subscription.payment_completed

### Referral Events
- referral.link_copied
- referral.code_redeemed
- referral.invite_sent

Example event properties:
```typescript
// Terminal events
{
  command?: string,    // For command executions
  theme: string,       // Current theme
  from_theme?: string, // For theme changes
  to_theme?: string,   // For theme changes
}

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

### Best Practices

1. **Consistent Categories**: Use established categories (demo_terminal, auth, subscription, etc.) for all new events

2. **Event Properties**:
   - Include theme in all UI events
   - Add source/location for user actions
   - Include error details for failure cases
   - Keep property names consistent across similar events

3. **Naming Rules**:
   - Use snake_case for both category and action
   - Keep categories lowercase
   - Use past tense for actions
   - Be specific about the action (e.g., 'payment_completed' vs 'paid')

## Component Patterns

When adding analytics to React components:
- Pass event handlers as props (e.g., `onTestimonialClick`) rather than using global PostHog directly
- Avoid naming conflicts with component state by using aliases (e.g., `colorTheme` for theme context)
- Keep all analytics event handlers in the parent component
- Use consistent property names across similar events
- Include component-specific context in event properties (location, action type)

## TypeScript Integration

Important: When integrating PostHog with Next.js:
- Use the official PostHog React provider from 'posthog-js/react'
- Wrap the provider with the PostHog client instance: `<PostHogProvider client={posthog}>`
- Initialize PostHog before using the provider
- Handle cleanup with posthog.shutdown() in useEffect cleanup function
- Respect Do Not Track and user consent before initialization
- Consider disabling automatic pageview tracking and handling it manually for more control

Example setup:
```typescript
'use client'
import posthog from 'posthog-js'
import { PostHogProvider as PHProvider } from 'posthog-js/react'

export function PostHogProvider({ children }) {
  useEffect(() => {
    if (hasConsent && !doNotTrack) {
      posthog.init(env.NEXT_PUBLIC_POSTHOG_API_KEY, {
        api_host: 'https://app.posthog.com',
        capture_pageview: false,
      })
      posthog.capture('$pageview')
    }
    return () => posthog.shutdown()
  }, [])

  return <PHProvider client={posthog}>{children}</PHProvider>
}
```

## LinkedIn Conversion Tracking

The application implements LinkedIn conversion tracking using a multi-step flow:

1. Initial Visit:
   - Capture `li_fat_id` from URL query parameters
   - Store in localStorage
   - Clear from URL for cleaner user experience

2. Conversion Points:
   - Track upgrades using `linkedInTrack` from nextjs-linkedin-insight-tag
   - Multiple conversion points exist:
     - Direct upgrade flow (trackUpgradeClick)
     - Payment success page load
     - Subscription checkout completion
   - Important: Do not remove li_fat_id from localStorage until conversion is confirmed
   - Keep li_fat_id through payment flow to ensure successful attribution
   - Always include stored `li_fat_id` in tracking calls
   - Keep li_fat_id through payment flow to ensure successful attribution
   - Always include stored `li_fat_id` in tracking calls

Important: This pattern ensures accurate attribution even when users don't convert immediately during their first visit.

## Implementation Guidelines

1. Centralize Tracking Logic:
   - Keep tracking code DRY by centralizing in shared functions
   - Multiple UI components may trigger the same conversion event
   - Maintain consistent tracking parameters across all conversion points
   - Example: Subscription conversion tracking should use same campaign ID everywhere

2. API Security:
   - When checking origins for CORS:
     - Parse URLs to compare just domain and port
     - Ignore protocol (http/https) differences
     - Handle missing or malformed origin headers
     - Keep CORS headers consistent in both success and error responses

## UTM Source Handling

Special UTM sources:
- youtube: Shows personalized banner with referrer name and bonus amount
- Referrer name passed via `referrer` parameter
- Used for tracking creator-driven referrals
- Important: Referrer display names differ from routing keys
- Maintain mapping of routing keys to display names for consistent tracking

## Referral Link Handling

Special UTM sources:
- youtube: Shows personalized banner with referrer name and bonus amount
- Referrer name passed via `referrer` parameter
- Used for tracking creator-driven referrals
- Important: Referrer display names differ from routing keys
- Maintain mapping of routing keys to display names for consistent tracking

## Route Parameters vs Display Names

- Route parameters (e.g., [sponsee-name]) are for URL routing only
- Keep routing keys simple and URL-friendly (e.g., 'berman')
- Display names should be separate from routing keys (e.g., 'Matthew Berman')
- Only use routing key validation in the page component
- Use display names only in user-facing UI components like banners
- Keep routing logic separate from display logic
- Example: /[sponsee-name] validates 'berman' for routing but displays "Matthew Berman" in UI

## Sponsee Referral Configuration

Each sponsee has three distinct identifiers:
- Routing key: URL-friendly identifier for page routing (e.g., 'berman')
- Display name: Full name for UI display (e.g., 'Matthew Berman')
- Referral code: Unique code for tracking referrals
- Important: Keep all three IDs together in sponseeConfig
- Use routing key as object key for consistent lookup

The sponseeConfig object in constants.ts is the single source of truth for:
- Route validation (/[sponsee] page)
- Display names (banner, referral pages)
- Referral code mapping (referral system)
- YouTube referral tracking

Example flow:
1. User visits /{routing-key}
2. Redirects to /?utm_source=youtube&referrer={routing-key}
3. Banner shows {display-name}
4. "Learn more" links to /referrals/{referral-code}

## Sponsee Referral Configuration

Each sponsee has three distinct identifiers:
- Routing key: URL-friendly identifier for page routing (e.g., 'berman')
- Display name: Full name for UI display (e.g., 'Matthew Berman')
- Referral code: Unique code for tracking referrals
- Important: Keep all three IDs together in sponseeConfig
- Use routing key as object key for consistent lookup

The sponseeConfig object in constants.ts is the single source of truth for:
- Route validation (/[sponsee] page)
- Display names (banner, referral pages)
- Referral code mapping (referral system)
- YouTube referral tracking

Example flow:
1. User visits /{routing-key}
2. Redirects to /?utm_source=youtube&referrer={routing-key}
3. Banner shows {display-name}
4. "Learn more" links to /referrals/{referral-code}

## Route Parameters vs Display Names

- Route parameters (e.g., [sponsee-name]) are for URL routing only
- Keep routing keys simple and URL-friendly (e.g., 'berman')
- Display names should be separate from routing keys (e.g., 'Matthew Berman')
- Only use routing key validation in the page component
- Use display names only in user-facing UI components like banners
- Keep routing logic separate from display logic
- Example: /[sponsee-name] validates 'berman' for routing but displays "Matthew Berman" in UI

## Referral Link Handling

Special UTM sources:
- youtube: Shows personalized banner with referrer name and bonus amount
- Referrer name passed via `referrer` parameter
- Used for tracking creator-driven referrals
- Important: Referrer display names differ from routing keys
- Maintain mapping of routing keys to display names for consistent tracking

2. Client vs Server Considerations:
   - Analytics tracking must happen client-side to access localStorage
   - Avoid attempting tracking in server components or API routes
   - Use client components or client-side event handlers for tracking
