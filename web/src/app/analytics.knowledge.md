# Analytics Implementation

## PostHog Integration

Important: When integrating PostHog:
- Initialize after user consent
- Respect Do Not Track browser setting
- Anonymize IP addresses by setting `$ip: null`
- Reload page after consent to ensure proper initialization
- Place PostHogProvider above other providers in component tree
- Track events with additional context (theme, referrer, etc.)

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
- Include theme context with all events via useTheme hook
- Track location/source of identical actions (e.g., 'copy_action' from different places)
- For terminal interactions, track both the command and its result
- When tracking theme changes, include both old and new theme values
- Avoid theme variable naming conflicts with component state by using aliases (e.g., colorTheme)
- Pass event handlers down as props rather than accessing global posthog in child components

Example event properties:
```typescript
// Button click events
{
  location: 'hero_section' | 'cta_section' | 'install_dialog',
  theme: string,
  referrer?: string
}

// Copy events
{
  command: string,
  location: string,
  theme: string
}

// Theme change events
{
  from_theme: string,
  to_theme: string
}
```

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
