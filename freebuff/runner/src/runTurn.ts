// The Freebuff turn loop, ported from the Convex action
// convex/coding_agent/cli_agent/executeFreebuff.ts (runFreebuffAgent).
// Differences from the action (docs/freebuff-render-harness.md):
//   - No 10-minute ceiling → no mid-turn continuation chaining. One turn is
//     one in-process SDK run bounded by a single wall-clock limit.
//   - Events ship in batches (eventBatcher) instead of one mutation per delta.
//   - Cancellation arrives over a websocket subscription (isCancelled), not a
//     1.5s query poll.
//   - On runner shutdown (SIGTERM/deploy) the turn persists full resume state
//     and reports `requeue`, so another replica resumes the SAME turn.

import { run } from '@codebuff/sdk'

import { isFreebuffMultimodalModelId } from '@codebuff/common/constants/freebuff-models'

import { internal } from '../../web/convex/_generated/api'
import { extractGravitySearchResult } from '../../web/convex/gravity_parse'
import { DaytonaCodebase } from '../../web/codebase-utils/codebase/DaytonaCodebase'
import { initializeCodebase } from '../../web/codebase-utils/codebase/initializeCodebase'
import {
  bundledAgentDefinitions,
  resolveFreebuffAgentId,
  WEBCONTAINER_AGENT_GUIDANCE,
} from '../../web/convex/coding_agent/cli_agent/freebuff_bundled_agents'
import { createEventBatcher } from './eventBatcher'
import { logger } from './logger'
import {
  buildCommitMessage,
  buildDaytonaProjectFiles,
  buildFreebuffOverrideTools,
  buildResumeState,
  createAskUserPauseError,
  getAskUserPauseInput,
  getErrorMessage,
  gravityIndexStatusEvent,
  installPromiseWithResolversPolyfill,
  isAskUserPauseError,
  isAskUserPauseMessage,
  sanitizeAskUserQuestions,
  sanitizeRunState,
  SANDBOX_PROJECT_ROOT,
} from './harness'
import { buildWebContainerOverrideTools } from './webcontainerTools'

import type { AskUserQuestion } from './harness'
import type { RunnerCtx } from './convexBridge'

export type ClaimedRun = {
  runId: string
  userId?: string
  projectId: string
  threadId: string
  messageId: string
  payload: {
    userMessage: string
    freebuffModel?: string
    images?: string[]
    sandboxId: string
    packageManager?: 'bun' | 'pnpm'
    // Absent = 'Freebuff' (rows created before Codex/Claude joined the runner).
    agentType?: 'Freebuff' | 'Codex' | 'Claude Code'
  }
  resumeStorageId?: string
}

export type TurnResult =
  | { outcome: 'final' | 'ask_user_pause' | 'time_limit_pause' | 'error' | 'cancelled' }
  | { outcome: 'requeue'; resumeStorageId?: string }

const CANCELLED_BY_USER = 'freebuff_cancelled_by_user'
const RUNNER_SHUTDOWN = 'freebuff_runner_shutdown'

const CONTINUATION_PROMPT =
  'Continue working on the current task from exactly where you left off. ' +
  'Do not restart or repeat work that is already done — pick up the next step ' +
  'and keep going until the task is fully complete.'

const TIME_LIMIT_MESSAGE =
  'Maximum time limit for a prompt reached. Engagement required to continue.'

function requireEnv(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

async function fetchJsonBlob(url: string): Promise<any | undefined> {
  try {
    const response = await fetch(url)
    if (!response.ok) return undefined
    return await response.json()
  } catch (error) {
    logger.error('failed to fetch run state blob', { error })
    return undefined
  }
}

async function persistRunState(
  ctx: RunnerCtx,
  runState: unknown,
  // Storage id of the resume blob this one replaces; deleted best-effort so
  // stale blobs don't accumulate in file storage / backups.
  supersedesStorageId?: string,
): Promise<string | undefined> {
  try {
    const resumeState = buildResumeState(runState)
    if (!resumeState) return undefined
    const blob = new Blob([JSON.stringify(resumeState)], {
      type: 'application/json',
    })
    const storageId = await ctx.storage.store(blob)
    if (supersedesStorageId && supersedesStorageId !== storageId) {
      await ctx.storage.delete(supersedesStorageId).catch(() => {})
    }
    return storageId
  } catch (error) {
    logger.error('failed to persist run state', { error })
    return undefined
  }
}

/** Append uploaded image URLs to the prompt as text (fallback for text-only
 *  models that can't accept real image input). */
async function appendImageUrlsToMessage(
  ctx: RunnerCtx,
  userMessage: string,
  images: string[] | undefined,
) {
  if (!images?.length) return userMessage

  const imageUrls: string[] = []
  for (const imageId of images) {
    const imageUrl = await ctx.storage.getUrl(imageId)
    if (imageUrl) imageUrls.push(imageUrl)
  }

  if (imageUrls.length === 0) return userMessage

  return `${userMessage}\n\nUser uploaded images:\n${imageUrls
    .map((url, index) => `[Image ${index + 1}: ${url}]`)
    .join('\n')}`
}

type SdkImageContent = {
  type: 'image'
  image: string // base64-encoded image bytes
  mediaType: string
}

/** Load uploaded images as base64 multimodal content for vision-capable
 *  models. Skips anything unreadable so one bad upload doesn't fail the run. */
async function loadImageContents(
  ctx: RunnerCtx,
  images: string[] | undefined,
): Promise<SdkImageContent[]> {
  if (!images?.length) return []

  const contents: SdkImageContent[] = []
  for (const imageId of images) {
    try {
      const blob = await ctx.storage.get(imageId)
      if (!blob) continue
      const arrayBuffer = await blob.arrayBuffer()
      const base64 = Buffer.from(arrayBuffer).toString('base64')
      contents.push({
        type: 'image',
        image: base64,
        mediaType: blob.type || 'image/png',
      })
    } catch (error) {
      logger.warn('failed to load image', { error })
    }
  }
  return contents
}

export async function runFreebuffTurn(
  ctx: RunnerCtx,
  claim: ClaimedRun,
  options: {
    turnLimitMs: number
    /** Live view of the run's ledger status (websocket subscription). */
    isCancelled: () => boolean
    /** Flips true when the runner received SIGTERM and wants the turn back on
     *  the queue. */
    shutdown: { requested: boolean }
  },
): Promise<TurnResult> {
  const { runId, projectId, threadId, messageId, payload } = claim
  const isMidTurnResume = !!claim.resumeStorageId

  const batcher = createEventBatcher({ ctx, runId, projectId, threadId, messageId })
  // On a mid-turn resume the message is already streaming into the same
  // assistant bubble — don't emit another `start`.
  if (!isMidTurnResume) {
    batcher.append({ type: 'start' })
  }
  const recordStatus = (title: string, content: string) =>
    batcher.append({ type: 'status', title, content })

  let pendingAskUserQuestions: AskUserQuestion[] | undefined

  const abortController = new AbortController()
  const timeoutHandle = setTimeout(() => {
    abortController.abort(new Error('Freebuff run exceeded the runner time limit'))
  }, options.turnLimitMs)

  let cancelledByUser = false
  let shuttingDown = false
  let lastToolStatusAt = 0
  let lastToolStatusKey = ''

  // Storage id of the resume blob this turn resumed from; whatever we persist
  // supersedes it (best-effort delete keeps file storage clean).
  let priorResumeStorageId: string | undefined

  const checkInterrupts = () => {
    if (abortController.signal.aborted) return
    if (options.isCancelled()) {
      cancelledByUser = true
      abortController.abort(new Error(CANCELLED_BY_USER))
      return
    }
    if (options.shutdown.requested) {
      shuttingDown = true
      abortController.abort(new Error(RUNNER_SHUTDOWN))
    }
  }

  const maybeRecordToolStatus = (toolName: string | undefined, input: unknown) => {
    const { title, content } =
      toolName === 'gravity_index'
        ? gravityIndexStatusEvent(input)
        : {
            title: toolName === 'ask_user' ? 'Ask user' : (toolName ?? 'Tool'),
            content:
              toolName === 'ask_user' ? 'Waiting for your answer' : 'Running tool',
          }
    const key = `${title}|${content}`
    const now = Date.now()
    if (key === lastToolStatusKey && now - lastToolStatusAt < 1500) return
    lastToolStatusKey = key
    lastToolStatusAt = now
    recordStatus(title, content)
  }

  try {
    installPromiseWithResolversPolyfill()

    const isWebContainerProject = payload.sandboxId.startsWith('webcontainer:')

    let codebasePromise: Promise<DaytonaCodebase> | undefined
    const getCodebase = async () => {
      if (!codebasePromise) {
        codebasePromise = (async () => {
          recordStatus('Starting VM', 'Connecting to the project runtime.')
          const codebase = await initializeCodebase(
            payload.sandboxId,
            payload.packageManager,
          )
          if (!(codebase instanceof DaytonaCodebase)) {
            throw new Error('Freebuff requires a Daytona-backed project')
          }
          return codebase
        })()
      }
      return codebasePromise
    }

    const connectedRepoProject = await ctx.runQuery<any>(
      internal.cloud.connectRepoMutations.getConnectedRepoProject,
      { projectId },
    )
    const connectedRepoContext =
      connectedRepoProject?.project_type === 'connected_repo'
        ? { projectType: 'connected_repo' as const }
        : undefined

    const agentId = resolveFreebuffAgentId(payload.freebuffModel)
    const supportsImages = isFreebuffMultimodalModelId(payload.freebuffModel)

    const baseUserMessage = supportsImages
      ? payload.userMessage
      : await appendImageUrlsToMessage(ctx, payload.userMessage, payload.images)
    const userMessage = isWebContainerProject
      ? `${WEBCONTAINER_AGENT_GUIDANCE}\n\n---\n\n${baseUserMessage}`
      : baseUserMessage

    // Mid-turn resume (shutdown handoff): send the internal continue directive
    // and skip re-injecting images/guidance — they're already in the history.
    const imageContents =
      !isMidTurnResume && supportsImages
        ? await loadImageContents(ctx, payload.images)
        : []
    const multimodalContent =
      imageContents.length > 0
        ? [{ type: 'text' as const, text: userMessage }, ...imageContents]
        : undefined
    const promptForRun = isMidTurnResume ? CONTINUATION_PROMPT : userMessage

    let previousRun: any | undefined
    if (isMidTurnResume) {
      recordStatus('Restoring context', 'Resuming from the previous step.')
      priorResumeStorageId = claim.resumeStorageId
      const url = await ctx.storage.getUrl(claim.resumeStorageId!)
      previousRun = url ? sanitizeRunState(await fetchJsonBlob(url)) : undefined
    } else {
      recordStatus(
        'Loading context',
        'Preparing the previous conversation and project state.',
      )
      const stored = await ctx.runQuery<{ storageId: string; url: string | null } | null>(
        internal.coding_agent.cli_agent.runner_bridge.getThreadRunStateUrl,
        { threadId },
      )
      priorResumeStorageId = stored?.storageId
      previousRun = stored?.url
        ? sanitizeRunState(await fetchJsonBlob(stored.url))
        : undefined
    }

    const codebase = isWebContainerProject ? undefined : await getCodebase()
    if (!isWebContainerProject) {
      recordStatus('Indexing files', 'Reading the latest project files.')
    }
    const projectFiles = isWebContainerProject
      ? {}
      : await buildDaytonaProjectFiles(codebase!)

    recordStatus('Launching model', 'Waiting for the first model update.')
    await batcher.flush()

    const runState = await run({
      apiKey: requireEnv('CODEBUFF_API_KEY'),
      fingerprintId: projectId,
      cwd: isWebContainerProject ? '/' : SANDBOX_PROJECT_ROOT,
      agent: agentId,
      // Cast bypasses a cross-package AgentDefinition type drift between
      // `agents/types` and `sdk/dist`. Runtime shape is identical.
      agentDefinitions: bundledAgentDefinitions as any,
      prompt: promptForRun,
      ...(multimodalContent ? { content: multimodalContent } : {}),
      projectFiles,
      previousRun,
      costMode: 'normal',
      signal: abortController.signal,
      overrideTools: (isWebContainerProject
        ? buildWebContainerOverrideTools(ctx, { runId, projectId })
        : buildFreebuffOverrideTools(getCodebase, {
            onAskUser: (input) => {
              pendingAskUserQuestions = sanitizeAskUserQuestions(input)
              throw createAskUserPauseError(input)
            },
            projectType: connectedRepoContext?.projectType,
            getRuntimeConfig: async () => {
              const project = await ctx.runQuery<any>(
                internal.cloud.connectRepoMutations.getConnectedRepoProject,
                { projectId },
              )
              return project?.runtime_config ?? undefined
            },
            setRuntimeConfig: async (config) => {
              await ctx.runMutation(
                internal.cloud.connectRepoMutations.updateRuntimeConfig,
                { projectId, config },
              )
            },
            setPreviewUrl: async (url) => {
              await ctx.runMutation(
                internal.cloud.connectRepoMutations.setConnectedRepoPreviewUrl,
                { projectId, preview_url: url },
              )
            },
          })) as any,
      handleEvent: async (event: any) => {
        checkInterrupts()
        if (event.type === 'tool_call') {
          // Persist the actual followup prompts so the web UI can render
          // clickable suggestion chips.
          if (event.toolName === 'suggest_followups') {
            const followups = Array.isArray(event.input?.followups)
              ? event.input.followups
              : []
            if (followups.length > 0) {
              batcher.append({
                type: 'status',
                title: 'Suggest followups',
                content: JSON.stringify({ followups }),
              })
            }
            return
          }

          if (event.toolName === 'ask_user') {
            await batcher.flush()
          }
          maybeRecordToolStatus(event.toolName, event.input)
          return
        }

        // Arm a deterministic Gravity conversion: remember the recommended
        // service + its required env vars so saving those keys later fires
        // report_integration. Best-effort.
        if (event.type === 'tool_result' && event.toolName === 'gravity_index') {
          try {
            const result = extractGravitySearchResult(event.output)
            if (result && claim.userId) {
              await ctx.runMutation(
                internal.gravity_integrations.recordPendingIntegrationInternal,
                {
                  projectId,
                  userId: claim.userId,
                  slug: result.slug,
                  searchId: result.searchId,
                  requiredEnvVars: result.requiredEnvVars,
                  source: 'agent_search',
                },
              )
            }
          } catch (error) {
            logger.warn('gravity capture failed', { runId, error })
          }
        }
      },
      handleStreamChunk: async (chunk: any) => {
        checkInterrupts()
        if (typeof chunk === 'string') {
          batcher.appendDelta({ type: 'text_delta', chunk })
        } else if (chunk.type === 'reasoning_chunk') {
          batcher.appendDelta({
            type: 'reasoning_delta',
            chunk: chunk.chunk ?? '',
          })
        } else if (chunk.type === 'subagent_chunk') {
          batcher.appendDelta({
            type: 'subagent_delta',
            agentType: chunk.agentType,
            chunk: chunk.chunk ?? '',
          })
        }
      },
    })

    // Runner shutdown: persist the FULL session state and hand the run back to
    // the queue — a fresh replica resumes this same turn seamlessly.
    if (shuttingDown) {
      const resumeStorageId = runState.sessionState
        ? await persistRunState(ctx, runState, priorResumeStorageId)
        : undefined
      recordStatus('Working', 'Continuing — picking up where the last step left off.')
      await batcher.stop()
      return { outcome: 'requeue', resumeStorageId }
    }

    // Always persist run state (success or error) when sessionState exists,
    // so a follow-up "continue" prompt can resume from the same history.
    const runStateStorageId = runState.sessionState
      ? await persistRunState(ctx, runState, priorResumeStorageId)
      : undefined

    // User terminated the thread mid-run. Save partial state cleanly and bail
    // before committing — the message is already marked Cancelled.
    if (cancelledByUser) {
      await batcher.stop()
      await ctx.runMutation(
        internal.coding_agent.freebuff_bridge_mutations
          .recordFreebuffCancellationState,
        { threadId, projectId, runId, runStateStorageId },
      )
      return { outcome: 'cancelled' }
    }

    if (runState.output?.type === 'error') {
      if (
        isAskUserPauseMessage(runState.output.message) &&
        pendingAskUserQuestions?.length
      ) {
        await batcher.finish(
          {
            type: 'ask_user_pause',
            questions: pendingAskUserQuestions,
            meteredCredits:
              runState.sessionState?.mainAgentState.creditsUsed ?? 0,
          },
          runStateStorageId,
        )
        return { outcome: 'ask_user_pause' }
      }

      const isLocalTimeout = abortController.signal.aborted
      const message = isLocalTimeout ? TIME_LIMIT_MESSAGE : runState.output.message
      await batcher.finish(
        {
          type: isLocalTimeout ? 'time_limit_pause' : 'error',
          message,
          meteredCredits:
            runState.sessionState?.mainAgentState.creditsUsed ?? 0,
        },
        runStateStorageId,
      )
      return { outcome: isLocalTimeout ? 'time_limit_pause' : 'error' }
    }

    try {
      await ctx.runAction(internal.codesandbox.versionControl.commit, {
        projectId,
        message: buildCommitMessage(payload.userMessage),
      })
    } catch (commitError) {
      logger.warn('post-run commit failed', { runId, error: commitError })
      // Non-fatal: still mark the run as completed.
    }

    await batcher.finish(
      {
        type: 'final',
        meteredCredits: runState.sessionState?.mainAgentState.creditsUsed ?? 0,
      },
      runStateStorageId,
    )
    return { outcome: 'final' }
  } catch (error) {
    // User cancellation takes precedence over any other abort/error path.
    if (cancelledByUser) {
      await batcher.stop()
      await ctx.runMutation(
        internal.coding_agent.freebuff_bridge_mutations
          .recordFreebuffCancellationState,
        { threadId, projectId, runId },
      )
      return { outcome: 'cancelled' }
    }

    if (shuttingDown) {
      // The SDK surfaced the shutdown abort as a throw before returning run
      // state — nothing recoverable to persist here.
      await batcher.stop()
      return { outcome: 'requeue', resumeStorageId: priorResumeStorageId }
    }

    if (isAskUserPauseError(error)) {
      const questions = pendingAskUserQuestions?.length
        ? pendingAskUserQuestions
        : sanitizeAskUserQuestions(getAskUserPauseInput(error))

      if (questions.length > 0) {
        await batcher.finish({ type: 'ask_user_pause', questions })
        return { outcome: 'ask_user_pause' }
      }
    }

    if (abortController.signal.aborted) {
      await batcher.finish({
        type: 'time_limit_pause',
        message: TIME_LIMIT_MESSAGE,
      })
      return { outcome: 'time_limit_pause' }
    }

    await batcher.finish({ type: 'error', message: getErrorMessage(error) })
    return { outcome: 'error' }
  } finally {
    clearTimeout(timeoutHandle)
  }
}
