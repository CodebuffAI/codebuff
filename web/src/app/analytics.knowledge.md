# Analytics Implementation

## LinkedIn Conversion Tracking

The application implements LinkedIn conversion tracking using a multi-step flow:

1. Initial Visit:
   - Capture `li_fat_id` from URL query parameters
   - Store in localStorage
   - Clear from URL for cleaner user experience

2. Conversion Points:
   - Track upgrades using `linkedInTrack` from nextjs-linkedin-insight-tag
   - Two conversion points:
     - Direct upgrade flow
     - Subscription checkout completion
   - Always include stored `li_fat_id` in tracking calls

Important: This pattern ensures accurate attribution even when users don't convert immediately during their first visit.
