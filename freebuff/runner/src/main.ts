// Freebuff Render runner entrypoint (docs/freebuff-render-harness.md).
//
// One long-lived Bun process per Render instance:
//   1. Subscribes (websocket) to runner-dispatched `queued` freebuff_agent_runs.
//   2. Claims runs with a CAS mutation — replicas race safely.
//   3. Executes each turn in-process via runFreebuffTurn (@codebuff/sdk).
//   4. Watches each claimed run's ledger status to abort on user cancel.
//   5. On SIGTERM (deploy/restart): stops claiming, aborts active turns, and
//      requeues them with persisted full-context resume state.

import { internal } from '../../web/convex/_generated/api'
import { createRunnerCtx, createSubscriptionClient } from './convexBridge'
import { flushLogSink, logger } from './logger'
import { runCliTurn } from './runCliTurn'
import { runFreebuffTurn } from './runTurn'

import type { ClaimedRun, TurnResult } from './runTurn'

function requireEnv(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

const CONVEX_URL = requireEnv('CONVEX_URL')
const CONVEX_DEPLOY_KEY = requireEnv('CONVEX_DEPLOY_KEY')
// Render sets RENDER_INSTANCE_ID; fall back to a random id in local dev.
const RUNNER_ID =
  process.env.RENDER_INSTANCE_ID ?? `local-${crypto.randomUUID().slice(0, 8)}`
process.env.FREEBUFF_RUNNER_ID = RUNNER_ID
// The work is I/O-bound (waiting on model tokens / Daytona), so one instance
// comfortably multiplexes many runs. Backpressure = simply not claiming.
const MAX_CONCURRENT_RUNS = Number(process.env.RUNNER_MAX_CONCURRENT_RUNS ?? 25)
const TURN_LIMIT_MS = Number(
  process.env.FREEBUFF_TURN_LIMIT_MS ?? 60 * 60 * 1000,
)

const ctx = createRunnerCtx({
  convexUrl: CONVEX_URL,
  deployKey: CONVEX_DEPLOY_KEY,
  bridge: {
    generateRunnerUploadUrl:
      internal.coding_agent.cli_agent.runner_bridge.generateRunnerUploadUrl,
    getStorageUrl: internal.coding_agent.cli_agent.runner_bridge.getStorageUrl,
    deleteStorageBlob:
      internal.coding_agent.cli_agent.runner_bridge.deleteStorageBlob,
  },
})
const subscriptions = createSubscriptionClient({
  convexUrl: CONVEX_URL,
  deployKey: CONVEX_DEPLOY_KEY,
})

const shutdown = { requested: false }

type ActiveRun = {
  runId: string
  cancelled: boolean
  unsubscribeStatus: () => void
  done: Promise<void>
}

const activeRuns = new Map<string, ActiveRun>()
// Claims in flight (claimed but not yet in activeRuns) still count against the
// concurrency cap and must not be double-claimed from a subscription refire.
const claiming = new Set<string>()

async function executeRun(claim: ClaimedRun & { claimed: true }) {
  const active: ActiveRun = {
    runId: claim.runId,
    cancelled: false,
    unsubscribeStatus: () => {},
    done: Promise.resolve(),
  }

  // Live cancel signal: the trigger-side cancel mutation flips the ledger row
  // to 'cancelled'; this fires within ~100ms over the websocket.
  // Cast: ConvexClient.onUpdate is typed for public queries, but admin auth
  // may subscribe to internal ones.
  active.unsubscribeStatus = subscriptions.onUpdate(
    internal.coding_agent.cli_agent.runner_bridge
      .watchFreebuffAgentRunStatus as any,
    { runId: claim.runId },
    (status) => {
      if (status === 'cancelled') active.cancelled = true
    },
    (error) => {
      // Subscription errors are non-fatal: the turn keeps running and user
      // cancels degrade to the terminal-state guard in recordRunEventBatch.
      logger.warn('status subscription error', {
        runId: claim.runId,
        error,
      })
    },
  )

  active.done = (async () => {
    const startedAt = Date.now()
    try {
      const agentType = claim.payload?.agentType ?? 'Freebuff'
      const turnOptions = {
        turnLimitMs: TURN_LIMIT_MS,
        isCancelled: () => active.cancelled,
        shutdown,
      }
      const result: TurnResult =
        agentType === 'Codex' || agentType === 'Claude Code'
          ? await runCliTurn(ctx, claim, turnOptions)
          : await runFreebuffTurn(ctx, claim, turnOptions)

      if (result.outcome === 'requeue') {
        const requeued = await ctx.runMutation<{ ok: boolean }>(
          internal.coding_agent.cli_agent.runner_bridge
            .requeueFreebuffAgentRunFromRunner,
          {
            runId: claim.runId,
            runnerId: RUNNER_ID,
            resumeStorageId: result.resumeStorageId,
          },
        )
        logger.info('run requeued for another instance', {
          runId: claim.runId,
          ok: requeued.ok,
          hasResumeState: !!result.resumeStorageId,
        })
      } else {
        logger.info('run finished', {
          runId: claim.runId,
          outcome: result.outcome,
          elapsedMs: Date.now() - startedAt,
        })
      }
    } catch (error) {
      // runFreebuffTurn reports its own terminal events; reaching here means
      // even the error path failed (e.g. Convex unreachable). The sweep cron
      // will reap the run once its heartbeat goes stale.
      logger.error('run crashed', { runId: claim.runId, error })
    } finally {
      active.unsubscribeStatus()
      activeRuns.delete(claim.runId)
      // Capacity freed — pick up anything still queued.
      void claimQueued(lastSeenQueue)
    }
  })()

  activeRuns.set(claim.runId, active)
}

let lastSeenQueue: Array<{ runId: string }> = []

async function claimQueued(queue: Array<{ runId: string }>) {
  if (shutdown.requested) return
  for (const { runId } of queue) {
    if (activeRuns.size + claiming.size >= MAX_CONCURRENT_RUNS) return
    if (activeRuns.has(runId) || claiming.has(runId)) continue

    claiming.add(runId)
    try {
      const claim = await ctx.runMutation<any>(
        internal.coding_agent.cli_agent.runner_bridge.claimFreebuffAgentRun,
        { runId, runnerId: RUNNER_ID },
      )
      if (claim?.claimed) {
        logger.info('claimed run', { runId, resuming: !!claim.resumeStorageId })
        await executeRun(claim)
      }
    } catch (error) {
      logger.error('claim failed', { runId, error })
    } finally {
      claiming.delete(runId)
    }
  }
}

function subscribeToQueue() {
  subscriptions.onUpdate(
    internal.coding_agent.cli_agent.runner_bridge.listQueuedRunnerRuns as any,
    {},
    (queue: Array<{ runId: string; queuedAt: number }>) => {
      lastSeenQueue = queue ?? []
      void claimQueued(lastSeenQueue)
    },
    (error) => {
      logger.error('queue subscription error', { error })
    },
  )
}

async function gracefulShutdown(signal: string) {
  if (shutdown.requested) return
  shutdown.requested = true
  logger.info('shutdown requested', { signal, activeRuns: activeRuns.size })

  // Each active turn sees shutdown.requested on its next stream callback,
  // aborts the SDK run, persists resume state, and requeues itself. Render
  // gives ~30s of grace; leave margin for the final Convex writes.
  const deadline = Date.now() + 25_000
  while (activeRuns.size > 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  if (activeRuns.size > 0) {
    logger.warn('shutdown deadline hit with runs still active', {
      remaining: [...activeRuns.keys()],
    })
  }
  await subscriptions.close()
  await flushLogSink()
  process.exit(0)
}

process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => void gracefulShutdown('SIGINT'))

logger.info('freebuff runner started', {
  convexUrl: CONVEX_URL,
  maxConcurrentRuns: MAX_CONCURRENT_RUNS,
  turnLimitMs: TURN_LIMIT_MS,
})
subscribeToQueue()
