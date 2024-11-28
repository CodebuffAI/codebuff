# Analytics Implementation

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
