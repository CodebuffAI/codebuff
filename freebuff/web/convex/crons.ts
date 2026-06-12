import { internal } from '!/_generated/api'
import { cronJobs } from 'convex/server'

const crons = cronJobs()

crons.interval(
  'replenish pool if empty',
  { minutes: 10 },
  internal.pool_management.replenishPoolIfEmpty,
)

// GitHub token rotation - run every 60 minutes to keep tokens fresh
crons.interval(
  'rotate expiring github tokens',
  { minutes: 60 },
  internal.github.tokens.rotation.scheduleTokenRotation,
)

// Clean up expired OAuth states - run every 15 minutes
crons.interval(
  'cleanup expired oauth states',
  { minutes: 15 },
  internal.github.auth.oauth.cleanupExpiredStates,
)

// Send pending ticket notification emails - run every 5 minutes
crons.interval(
  'send pending ticket notification emails',
  { minutes: 5 },
  internal.tickets_email.processPendingEmails,
)

crons.interval(
  'sweep timed out freebuff agent runs',
  { minutes: 1 },
  internal.coding_agent.freebuff_bridge_mutations.sweepTimedOutFreebuffRuns,
)

// Keep the Freebuff agent Node bundle warm. Cold-loading it (@codebuff/sdk +
// all bundled agent definitions) costs ~5-9s, which used to land on the first
// user message after an idle period.
crons.interval(
  'warm freebuff agent runtime',
  { minutes: 2 },
  internal.coding_agent.cli_agent.executeFreebuff.warmFreebuffRuntime,
  {},
)

// Persist yesterday's engagement metrics (DAU, signups, projects, totals)
// shortly after UTC midnight so history survives aggregate rebuilds.
crons.daily(
  'snapshot daily stats',
  { hourUTC: 0, minuteUTC: 5 },
  internal.activity.snapshotDailyStats,
  {},
)

export default crons
