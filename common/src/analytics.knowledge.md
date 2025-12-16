# Analytics Architecture

This document describes the server-side and CLI analytics implementation using PostHog.

## Overview

The codebase has **two separate analytics modules** serving different use cases:

| Module | Location | Use Case |
|--------|----------|----------|
| Server-side | `common/src/analytics.ts` | Web API routes, agent-runtime, billing |
| CLI | `cli/src/utils/analytics.ts` | Interactive CLI application |

Both modules share common types and utilities from `common/src/analytics-core.ts`.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     analytics-core.ts                           │
│  • AnalyticsClient interface                                    │
│  • AnalyticsClientWithIdentify interface                        │
│  • AnalyticsConfig type                                         │
│  • createPostHogClient() factory                                │
│  • getConfigFromEnv() helper                                    │
│  • isProdEnv() helper                                           │
└─────────────────────────────────────────────────────────────────┘
                    ▲                           ▲
                    │                           │
        ┌───────────┴───────────┐   ┌──────────┴──────────┐
        │   analytics.ts        │   │  cli/utils/         │
        │   (Server-side)       │   │  analytics.ts       │
        │                       │   │  (CLI)              │
        │  • Stateless          │   │  • Stateful         │
        │  • userId per call    │   │  • identifyUser()   │
        │  • No buffering       │   │  • Event buffering  │
        └───────────────────────┘   └─────────────────────┘
```

## Server-side Analytics (`common/src/analytics.ts`)

**Stateless** - designed for multi-user server environments where each request has a different user.

### Key Functions

- `initAnalytics({ logger, clientEnv })` - Initialize PostHog client
- `trackEvent({ event, userId, properties, logger })` - Track an event (userId required per call)
- `flushAnalytics(logger?)` - Flush pending events
- `configureAnalytics(config)` - Manual configuration

### Usage

```typescript
import { initAnalytics, trackEvent } from '@codebuff/common/analytics'

// Initialize once at server startup
initAnalytics({ logger, clientEnv: env })

// Track events with userId on each call
trackEvent({
  event: AnalyticsEvent.AGENT_STEP,
  userId: 'user-123',
  properties: { step: 1 },
  logger,
})
```

### Callers

- Web API routes (`web/src/app/api/v1/*`)
- Agent runtime (`packages/agent-runtime`)
- Billing (`packages/billing`)

## CLI Analytics (`cli/src/utils/analytics.ts`)

**Stateful** - designed for single-user interactive sessions.

### Key Functions

- `initAnalytics()` - Initialize PostHog client
- `identifyUser(userId, properties?)` - Set current user (flushes buffered events)
- `trackEvent(event, properties?)` - Track an event (uses stored userId)
- `flushAnalytics()` - Flush pending events
- `logError(error, userId?, properties?)` - Capture exceptions

### Anonymous ID + Alias Pattern

The CLI uses PostHog's `alias()` feature to track pre-login events:

1. **On init**: Generate a unique anonymous ID (e.g., `anon_<uuid>`)
2. **Pre-login events**: Sent immediately with the anonymous ID
3. **On login**: Call `alias()` FIRST (to merge histories), then `identify()` (to set user properties)
4. **Post-login events**: Sent with the real user ID

**Important**: The order matters! `alias()` must be called before `identify()` to properly merge the anonymous event history into the user's profile.

This approach is simpler than client-side buffering and ensures events are in PostHog immediately (even if the CLI crashes before login).

### Usage

```typescript
import { initAnalytics, identifyUser, trackEvent } from './utils/analytics'

// Initialize at CLI startup - generates anonymous ID
initAnalytics()

// Events are sent immediately with anonymous ID
trackEvent(AnalyticsEvent.APP_LAUNCHED)

// After authentication, identify + alias merges anonymous session into user profile
identifyUser('user-123', { email: 'user@example.com' })

// Subsequent events use the real user ID
trackEvent(AnalyticsEvent.USER_INPUT_COMPLETE, { input: '...' })
```

## Testing

Both modules support **dependency injection** for testing without `mock.module()`:

### Server-side Testing

```typescript
import { resetServerAnalyticsState, type ServerAnalyticsDeps } from '@codebuff/common/analytics'

const mockClient = { capture: mock(() => {}), flush: mock(() => Promise.resolve()) }
const deps: ServerAnalyticsDeps = { createClient: () => mockClient }

beforeEach(() => {
  resetServerAnalyticsState(deps)
})
```

### CLI Testing

```typescript
import { resetAnalyticsState, type AnalyticsDeps } from './analytics'

const mockClient = { 
  capture: mock(() => {}), 
  identify: mock(() => {}), 
  alias: mock(() => {}),  // For testing alias calls
  flush: mock(() => Promise.resolve()),
  captureException: mock(() => {}),
}
const deps: AnalyticsDeps = {
  env: { NEXT_PUBLIC_POSTHOG_API_KEY: 'test', NEXT_PUBLIC_POSTHOG_HOST_URL: 'https://test' },
  isProd: true,
  createClient: () => mockClient,
  generateAnonymousId: () => 'anon_test-uuid',  // Fixed ID for predictable tests
}

beforeEach(() => {
  resetAnalyticsState(deps)
})
```

## Environment Configuration

Required environment variables:

- `NEXT_PUBLIC_POSTHOG_API_KEY` - PostHog project API key
- `NEXT_PUBLIC_POSTHOG_HOST_URL` - PostHog host URL
- `NEXT_PUBLIC_CB_ENVIRONMENT` - Environment name (`dev`, `test`, `prod`)

Analytics events are **only sent in production** (`NEXT_PUBLIC_CB_ENVIRONMENT=prod`).

## Event Definitions

All analytics events are defined in `common/src/constants/analytics-events.ts` as the `AnalyticsEvent` enum.

## Related Files

- `common/src/analytics-core.ts` - Shared types and utilities
- `common/src/analytics.ts` - Server-side implementation
- `cli/src/utils/analytics.ts` - CLI implementation
- `common/src/util/analytics-dispatcher.ts` - CLI log-based event dispatcher
- `common/src/util/analytics-log.ts` - Analytics log payload helpers
- `common/src/constants/analytics-events.ts` - Event definitions
- `web/src/app/analytics.knowledge.md` - Client-side (browser) PostHog patterns
