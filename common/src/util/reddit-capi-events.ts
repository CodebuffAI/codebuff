import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'

import type { FreebuffRedditRetentionMilestoneDays } from '@codebuff/common/util/reddit-freebuff-retention'

export type RedditFirstPromptSurface = 'cli' | 'web' | 'chat'

/** PostHog/analytics event fired alongside the Reddit CAPI first-prompt conversion. */
export const REDDIT_FIRST_PROMPT_ANALYTICS_EVENTS: Record<
  RedditFirstPromptSurface,
  AnalyticsEvent
> = {
  cli: AnalyticsEvent.FREEBUFF_REDDIT_FUNNEL_FIRST_PROMPT_CLI,
  web: AnalyticsEvent.FREEBUFF_REDDIT_FUNNEL_FIRST_PROMPT_WEB,
  chat: AnalyticsEvent.FREEBUFF_REDDIT_FUNNEL_FIRST_PROMPT_CHAT,
}

export type RedditFirstPromptCapiEventName =
  | 'FirstPromptCli'
  | 'FirstPromptWeb'
  | 'FirstPromptChat'

export type RedditRetentionCapiEventName =
  | 'Retention1dCli'
  | 'Retention7dCli'
  | 'Retention24dCli'

export function redditFirstPromptCapiEventName(
  surface: RedditFirstPromptSurface,
): RedditFirstPromptCapiEventName {
  switch (surface) {
    case 'cli':
      return 'FirstPromptCli'
    case 'web':
      return 'FirstPromptWeb'
    case 'chat':
      return 'FirstPromptChat'
  }
}

export function redditRetentionCapiEventName(
  milestone: FreebuffRedditRetentionMilestoneDays,
): RedditRetentionCapiEventName {
  return `Retention${milestone}dCli`
}
