/**
 * The freebuff abuse-detection core moved to `@codebuff/internal/freebuff-abuse`
 * so it can be shared with the freebuff.com `/abuse` admin dashboard (which
 * lives in a different Next app and can't import from `web/`).
 *
 * This module is kept as a re-export shim so existing codebuff.com consumers
 * (the `/api/admin/bot-sweep` endpoint and `abuse-review.ts`) don't need to
 * change. Import directly from `@codebuff/internal/freebuff-abuse` in new code.
 */

export {
  identifyBotSuspects,
  banSuspects,
  formatSweepReport,
} from '@codebuff/internal/freebuff-abuse'

export type {
  SuspectTier,
  BotSuspect,
  SweepReport,
  CreationCluster,
} from '@codebuff/internal/freebuff-abuse'
