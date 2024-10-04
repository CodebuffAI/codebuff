# Billing and Usage Tracking

## Overview

This file contains information about the billing system and usage tracking for the Manicode project.

## QuotaManager

The `QuotaManager` is a key component of our billing system, responsible for tracking and managing user quotas. It has two main implementations:

1. `AnonymousQuotaManager`: Handles quota management for unauthenticated users.
2. `AuthenticatedQuotaManager`: Handles quota management for authenticated users.

### Key Features

- Separate handling for anonymous and authenticated users
- Methods for updating, checking, and resetting quotas
- Integration with the database for persistent quota tracking

### Usage

The `QuotaManager` is primarily used in `websocket-action.ts`, but it's also relevant in:

- `middleware.ts`: For checking quota exceeded status
- `cost-calculator.ts`: For calculating and saving message costs

### Implementation Details

- The `getQuotaManager` function returns the appropriate manager based on the user's authentication status.
- Quota updates are performed after each user interaction.
- Quota checks are done before processing user requests to ensure limits are not exceeded.

## Integration Points

1. WebSocket Actions: In `websocket-action.ts`, the QuotaManager is used to update quotas after processing user inputs.
2. Middleware: In `middleware.ts`, quota checks are performed as part of the request processing pipeline.
3. Cost Calculation: While not directly using QuotaManager, `cost-calculator.ts` is closely related to usage tracking and billing.

## Best Practices

1. Always use the `getQuotaManager` function to obtain the correct manager instance.
2. Perform quota checks before processing expensive operations.
3. Update quotas after successful operations that consume credits.

## Future Considerations

- Consider implementing a caching layer for frequent quota checks to reduce database load.
- Explore the possibility of real-time quota updates for a better user experience.
- Implement more granular quota controls, such as per-feature quotas.

