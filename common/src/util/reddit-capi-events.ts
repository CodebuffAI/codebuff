import type { FreebuffRedditRetentionMilestoneDays } from '@codebuff/common/util/reddit-freebuff-retention'

export type RedditConversionSurface = 'cli' | 'web' | 'cloud' | 'chat'

export type RedditCapiEventName =
  | 'FirstPrompt'
  | 'Retention1d'
  | 'Retention7d'
  | 'Retention24d'

export const REDDIT_FIRST_PROMPT_EVENT = 'FirstPrompt' as const

export function redditRetentionCapiEventName(
  milestone: FreebuffRedditRetentionMilestoneDays,
): RedditCapiEventName {
  return `Retention${milestone}d`
}
