# Engaged-time tracking (time spent per product)

How we measure how long users spend in each Freebuff product — CLI, web, chat,
cloud, and desktop — and read it back in PostHog as **average** and **sum** per
product.

## The model: one event per active minute

Every surface emits a single un-sampled event, **`product_active_minute`**, once
per minute of *active engagement*. Because one event == one minute, the
dashboard needs no duration math: a raw event **count is minutes**.

"Active engagement" means the user is actually present, not just that an app is
open:

- **Browser surfaces (web / chat / cloud):** the tab is **visible AND focused**,
  and there's been pointer/keyboard/scroll/touch activity within the last 5
  minutes. Switching tabs or apps stops the count immediately (focus lost);
  reading/thinking pauses up to 5 min still count.
- **CLI:** the user typed / moved the mouse within the last 5 minutes (reuses the
  existing `activity-tracker`). There's no tab concept in a terminal.
- **Desktop:** same visible+focused+active rule as the browser (the Electron
  renderer is Chromium).

A crash or hard-kill loses at most the in-flight minute — there is no
session-end event to drop.

### Event shape

| Property | Value |
| --- | --- |
| event | `product_active_minute` |
| `surface` | `cli` \| `web` \| `chat` \| `cloud` \| `desktop` |
| `engagement_session_id` | UUID per sitting (one page-load / process / tab) |
| `distinct_id` | canonical user id where known; anonymous/device id otherwise |

It is registered as **never-sampled** (`ALWAYS_TRACK_EVENTS`) and **excluded from
the Axiom mirror** (it's high-volume and PostHog is the system of record).

## Where it's wired

| Surface | Code |
| --- | --- |
| Shared core | [`common/src/util/engagement-tracker.ts`](../common/src/util/engagement-tracker.ts) — the `EngagementTracker` class + constants |
| Event def | [`common/src/constants/analytics-events.ts`](../common/src/constants/analytics-events.ts) (`PRODUCT_ACTIVE_MINUTE`) |
| CLI | [`cli/src/utils/engagement.ts`](../cli/src/utils/engagement.ts); started in `init/init-app.ts` (gated on `IS_FREEBUFF`), stopped in `utils/freebuff-exit.ts` |
| web/chat/cloud | [`freebuff/web/src/lib/EngagementTracker.tsx`](../freebuff/web/src/lib/EngagementTracker.tsx); mounted in `app/layout.tsx`. Surface derived from the route prefix (`/web`, `/chat`, `/cloud`); marketing pages are untracked |
| Desktop | inline loader + loop in [`freebuff-desktop/src/app/ui/index.html`](../freebuff-desktop/src/app/ui/index.html); PostHog key/host injected by `src/app/server.ts` at serve time |

The browser and CLI share the `EngagementTracker` class. The desktop UI is static
HTML with no bundler, so it carries a small vanilla copy of the same loop — keep
the two in sync (interval = 1 min, idle cutoff = 5 min).

## Building the PostHog dashboard

Both tiles use the same event; only the aggregation differs. Because interval =
60s, the numbers read directly in **minutes**.

**1. Sum of time per product**
- Insight type: **Trends**
- Series: event `product_active_minute`, measured by **Total count**
- Breakdown by: event property **`surface`**
- → total minutes spent in each product over the range.

**2. Average time per user per product**
- Insight type: **Trends**
- Series: event `product_active_minute`, aggregation **Average count per user**
- Breakdown by: event property **`surface`**
- → average minutes/user in each product.

**3. (Recommended) Median / p90 per product** — add a third Trends tile with the
same setup but **Median count per user** (and/or p90). Average minutes is skewed
by power users; the median is the more honest "typical session."

Filtering any tile to a single `surface` value gives that product in isolation;
no filter gives the combined number.

## Caveats

- **Desktop `distinct_id` is per-install**, not per-user — the desktop app has no
  auth yet, so it uses posthog-js's anonymous device id. "Average per user" for
  desktop reads as "average per install" until desktop auth lands.
- **CLI is Freebuff-only**, matching the `message_sent` DAU signal — codebuff CLI
  usage is intentionally excluded.
- Sub-minute sessions round to ~0 minutes (the first tick fires at the 1-minute
  mark). This is expected for a time-spent metric.
- Tracking no-ops anywhere `NEXT_PUBLIC_POSTHOG_API_KEY` isn't set (dev), so
  these events only appear in prod.
