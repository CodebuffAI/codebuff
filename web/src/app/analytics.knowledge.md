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

2. Client vs Server Considerations:
   - Analytics tracking must happen client-side to access localStorage
   - Avoid attempting tracking in server components or API routes
   - Use client components or client-side event handlers for tracking
