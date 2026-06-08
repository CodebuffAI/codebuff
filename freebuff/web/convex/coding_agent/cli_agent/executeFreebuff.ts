'use node'

import { Workpool } from '@convex-dev/workpool'
import { run } from '@codebuff/sdk'
import { applyPatch } from 'diff'
import { v } from 'convex/values'

import { isFreebuffMultimodalModelId } from '@codebuff/common/constants/freebuff-models'

import { components, internal } from '../../_generated/api'
import { Id } from '!/_generated/dataModel'
import { ActionCtx, internalAction } from '!/_generated/server'
import { DaytonaCodebase } from '../../../codebase-utils/codebase/DaytonaCodebase'
import { initializeCodebase } from '../../../codebase-utils/codebase/initializeCodebase'
import {
  bundledAgentDefinitions,
  resolveFreebuffAgentId,
} from './freebuff_bundled_agents'

export interface ExecuteFreebuffArgs {
  projectId: Id<'project'>
  threadId: Id<'agent_thread'>
  messageId: Id<'agent_message'>
  sandboxId: string
  activeSessionId: string | undefined
  executingUserId: Id<'users'>
  userMessage: string
  images: Id<'_storage'>[] | undefined
  freebuffModel: string | undefined
}

export interface ExecuteFreebuffResult {
  success: boolean
  error?: string
  sessionId?: string
}

const freebuffAgentWorkpool = new Workpool(
  (components as any).freebuffAgentWorkpool,
  {
    maxParallelism: 3,
    retryActionsByDefault: false,
  },
)

function requireEnv(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

async function readStoredRunState(
  ctx: ActionCtx,
  threadId: Id<'agent_thread'>,
) {
  const thread = await ctx.runQuery(
    internal.coding_agent.cli_agent.agent_thread.getAgentThread,
    { threadId },
  )
  const storageId = (thread as any)?.active_freebuff_run_state_storage_id
  if (!storageId) return undefined

  const blob = await ctx.storage.get(storageId)
  if (!blob) return undefined
  return JSON.parse(await blob.text())
}

type SdkImageContent = {
  type: 'image'
  image: string // base64-encoded image bytes
  mediaType: string
}

/** Append uploaded image URLs to the prompt as text. Used as the fallback for
 *  text-only models that can't accept real image input. */
async function appendImageUrlsToMessage(
  ctx: ActionCtx,
  userMessage: string,
  images: Id<'_storage'>[] | undefined,
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

/** Load uploaded images as base64 multimodal content for vision-capable
 *  models. Skips anything that can't be read so a single bad upload doesn't
 *  fail the whole run. */
async function loadImageContents(
  ctx: ActionCtx,
  images: Id<'_storage'>[] | undefined,
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
      console.warn('[vly-freebuff-workpool] failed to load image', error)
    }
  }
  return contents
}

export async function executeFreebuff(
  ctx: ActionCtx,
  _codebase: DaytonaCodebase,
  args: ExecuteFreebuffArgs,
): Promise<ExecuteFreebuffResult> {
  try {
    requireEnv('CODEBUFF_API_KEY')

    const runId = crypto.randomUUID()
    const agentId = resolveFreebuffAgentId(args.freebuffModel)
    const supportsImages = isFreebuffMultimodalModelId(args.freebuffModel)

    // Vision-capable models get real multimodal content (handled in the
    // workpool action). Text-only models fall back to inlining image URLs so
    // the model at least has a reference.
    const userMessage = supportsImages
      ? args.userMessage
      : await appendImageUrlsToMessage(ctx, args.userMessage, args.images)

    await ctx.runMutation(
      (internal as any).coding_agent.cli_agent.freebuff_agent_run_mutations
        .createFreebuffAgentRun,
      {
        runId,
        userId: args.executingUserId,
        projectId: args.projectId,
        threadId: args.threadId,
        messageId: args.messageId,
      },
    )

    const workId = await freebuffAgentWorkpool.enqueueAction(
      ctx,
      (internal as any).coding_agent.cli_agent.executeFreebuff.runFreebuffAgent,
      {
        runId,
        userId: args.executingUserId,
        projectId: args.projectId,
        threadId: args.threadId,
        messageId: args.messageId,
        userMessage,
        agentId,
        images: supportsImages ? args.images : undefined,
      },
      { retry: false },
    )

    // Record which model this message ran on so the UI can display it.
    if (args.freebuffModel) {
      await ctx.runMutation(
        (internal as any).coding_agent.cli_agent.agent_message
          .updateAgentMessageModel,
        {
          messageId: args.messageId,
          modelUsed: args.freebuffModel,
        },
      )
    }

    await ctx.runMutation(
      (internal as any).coding_agent.cli_agent.freebuff_agent_run_mutations
        .setFreebuffAgentRunWorkId,
      {
        runId,
        workId: String(workId),
      },
    )

    await ctx.runMutation(
      internal.coding_agent.cli_agent.agent_message.updateAgentMessageSessionId,
      {
        messageId: args.messageId,
        sessionId: runId,
      },
    )

    return { success: true, sessionId: runId }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

function installPromiseWithResolversPolyfill() {
  const promiseConstructor = Promise as unknown as {
    withResolvers?: <T>() => {
      promise: Promise<T>
      resolve: (value: T | PromiseLike<T>) => void
      reject: (reason?: unknown) => void
    }
  }

  if (promiseConstructor.withResolvers) return

  Object.defineProperty(promiseConstructor, 'withResolvers', {
    configurable: true,
    writable: true,
    value: <T>() => {
      let resolve!: (value: T | PromiseLike<T>) => void
      let reject!: (reason?: unknown) => void
      const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise
        reject = rejectPromise
      })
      return { promise, resolve, reject }
    },
  })
}

type FreebuffRunEvent = {
  type:
    | 'start'
    | 'text_delta'
    | 'reasoning_delta'
    | 'subagent_delta'
    | 'status'
    | 'ask_user_pause'
    | 'time_limit_pause'
    | 'error'
    | 'final'
  chunk?: string
  agentType?: string
  title?: string
  content?: string
  message?: string
  questions?: AskUserQuestion[]
  preserveThreadSession?: boolean
  meteredCredits?: number
}

async function recordRunEvent(args: {
  ctx: ActionCtx
  runId: string
  projectId: Id<'project'>
  threadId: Id<'agent_thread'>
  messageId: Id<'agent_message'>
  event: FreebuffRunEvent
  runStateStorageId?: Id<'_storage'>
}) {
  await args.ctx.runMutation(
    (internal as any).coding_agent.freebuff_bridge_mutations.recordRunEvent,
    {
      event: {
        runId: args.runId,
        projectId: args.projectId,
        threadId: args.threadId,
        messageId: args.messageId,
        ...args.event,
      },
      runStateStorageId: args.runStateStorageId,
    },
  )
}

function createRunEventBuffer(params: {
  ctx: ActionCtx
  runId: string
  projectId: Id<'project'>
  threadId: Id<'agent_thread'>
  messageId: Id<'agent_message'>
}) {
  type BufferedDelta = {
    type: 'text_delta' | 'reasoning_delta' | 'subagent_delta'
    chunk: string
    agentType?: string
  }

  let pending: BufferedDelta | undefined
  let flushTimer: ReturnType<typeof setTimeout> | undefined
  let flushPromise = Promise.resolve()

  const postBufferedDelta = async (event: BufferedDelta | undefined) => {
    if (!event?.chunk) return
    await recordRunEvent({ ...params, event })
  }

  const takePending = () => {
    if (flushTimer) {
      clearTimeout(flushTimer)
      flushTimer = undefined
    }
    const event = pending
    pending = undefined
    return event
  }

  const flushNow = async () => {
    await postBufferedDelta(takePending())
  }

  const enqueueFlush = () => {
    if (flushTimer) return
    flushTimer = setTimeout(() => {
      flushPromise = flushPromise.then(flushNow).catch((error) => {
        console.error('[vly-freebuff-workpool] stream flush failed', error)
      })
    }, 150)
  }

  const append = (event: BufferedDelta) => {
    if (
      pending &&
      pending.type === event.type &&
      pending.agentType === event.agentType
    ) {
      pending.chunk += event.chunk
    } else {
      const previous = takePending()
      flushPromise = flushPromise.then(() => postBufferedDelta(previous))
      pending = event
    }
    enqueueFlush()
  }

  return {
    append,
    flush: async () => {
      await flushPromise
      await flushNow()
      await flushPromise
    },
  }
}

function asJson(value: unknown) {
  return [{ type: 'json', value }]
}

type AskUserOption = {
  label: string
  description?: string
}

type AskUserQuestion = {
  question: string
  header?: string
  options: AskUserOption[]
  multiSelect?: boolean
}

const ASK_USER_PAUSE_MESSAGE = 'Freebuff paused for user input.'

function sanitizeAskUserQuestions(value: unknown): AskUserQuestion[] {
  const rawQuestions =
    value &&
    typeof value === 'object' &&
    'questions' in value &&
    Array.isArray((value as { questions?: unknown }).questions)
      ? (value as { questions: unknown[] }).questions
      : []

  return rawQuestions
    .map((rawQuestion): AskUserQuestion | null => {
      if (!rawQuestion || typeof rawQuestion !== 'object') return null

      const record = rawQuestion as Record<string, unknown>
      const question = String(record.question ?? '').trim()
      const rawOptions = Array.isArray(record.options) ? record.options : []
      const options = rawOptions
        .map((rawOption): AskUserOption | null => {
          if (!rawOption || typeof rawOption !== 'object') return null
          const option = rawOption as Record<string, unknown>
          const label = String(option.label ?? '').trim()
          if (!label) return null
          const description = String(option.description ?? '').trim()
          return {
            label,
            ...(description ? { description } : {}),
          }
        })
        .filter((option): option is AskUserOption => option !== null)

      if (!question || options.length === 0) return null
      const header = String(record.header ?? '').trim()
      return {
        question,
        ...(header ? { header } : {}),
        options,
        multiSelect: record.multiSelect === true,
      }
    })
    .filter((question): question is AskUserQuestion => question !== null)
}

function createAskUserPauseError(input: unknown) {
  const error = new Error(ASK_USER_PAUSE_MESSAGE) as Error & {
    codebuffRunPaused: true
    askUserInput: unknown
  }
  error.name = 'CodebuffRunPausedError'
  error.codebuffRunPaused = true
  error.askUserInput = input
  return error
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function getAskUserPauseInput(error: unknown): unknown {
  if (error && typeof error === 'object' && 'askUserInput' in error) {
    return (error as { askUserInput?: unknown }).askUserInput
  }
  return undefined
}

function isAskUserPauseMessage(message: string | undefined) {
  return Boolean(message && message.includes(ASK_USER_PAUSE_MESSAGE))
}

function isAskUserPauseError(error: unknown) {
  if (
    error &&
    typeof error === 'object' &&
    'codebuffRunPaused' in error &&
    (error as { codebuffRunPaused?: unknown }).codebuffRunPaused === true
  ) {
    return true
  }

  return isAskUserPauseMessage(getErrorMessage(error))
}

const PROJECT_PATH_PREFIXES = ['/home/daytona/codebase/', '/home/daytona/codebase']

function stripProjectPrefix(filePath: string) {
  for (const prefix of PROJECT_PATH_PREFIXES) {
    if (filePath.startsWith(prefix)) {
      return filePath.slice(prefix.length)
    }
  }
  return filePath
}

function normalizePath(value: unknown) {
  if (typeof value !== 'string') {
    return ''
  }
  return stripProjectPrefix(value)
}

function assertProjectPath(filePath: string) {
  if (
    !filePath ||
    filePath.startsWith('/') ||
    filePath.includes('..') ||
    filePath.includes('\0')
  ) {
    throw new Error(`Invalid project path: ${filePath}`)
  }
}

function commandIsBlocked(command: string) {
  return /(^|\s)(git|gh)(\s|$)/.test(command)
}

function globToRegExp(pattern: string) {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '.*')
    .replace(/\*/g, '[^/]*')
  return new RegExp(`^${escaped}$`)
}

function parseCreateDiff(diff: string) {
  return diff
    .split(/\r?\n/)
    .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
    .map((line) => line.slice(1))
    .join('\n')
}

function buildFreebuffOverrideTools(
  codebase: DaytonaCodebase,
  options: {
    onAskUser?: (input: unknown) => never
  } = {},
) {
  return {
    ask_user: async (input: any) => {
      if (options.onAskUser) {
        options.onAskUser(input)
      }

      return asJson({
        errorMessage: 'Freebuff ask user handling is not available.',
      })
    },

    read_files: async (input: any) => {
      const filePaths = Array.isArray(input?.filePaths) ? input.filePaths : []
      const results: Record<string, string | null> = {}
      for (const filePath of filePaths) {
        const normalized = normalizePath(filePath)
        assertProjectPath(normalized)
        try {
          results[normalized] = await codebase.readFile(normalized)
        } catch {
          results[normalized] = null
        }
      }
      return results
    },

    write_file: async (input: any) => {
      const filePath = normalizePath(input?.path)
      assertProjectPath(filePath)
      const content = String(input?.content ?? '')
      if (input?.type === 'patch') {
        const oldContent = await codebase.readFile(filePath)
        const newContent = applyPatch(oldContent, content)
        if (newContent === false) {
          return asJson({
            file: filePath,
            errorMessage: 'Failed to apply patch.',
          })
        }
        await codebase.writeFile(filePath, newContent)
        return asJson({
          file: filePath,
          message: 'Applied patch through Vly Daytona tools.',
        })
      }
      await codebase.writeFile(filePath, content)
      return asJson({
        file: filePath,
        message: 'Wrote file through Vly Daytona tools.',
      })
    },

    str_replace: async (input: any) => {
      const filePath = normalizePath(input?.path)
      assertProjectPath(filePath)

      if (input?.content !== undefined || input?.type === 'patch') {
        return await (
          buildFreebuffOverrideTools(codebase, options) as any
        ).write_file(input)
      }

      const oldString = String(input?.old_str ?? input?.oldString ?? '')
      const newString = String(input?.new_str ?? input?.newString ?? '')
      if (!oldString) {
        return asJson({ file: filePath, errorMessage: 'Missing old string.' })
      }

      const oldContent = await codebase.readFile(filePath)
      if (!oldContent.includes(oldString)) {
        return asJson({
          file: filePath,
          errorMessage: 'Old string was not found in file.',
        })
      }

      await codebase.writeFile(
        filePath,
        oldContent.replace(oldString, newString),
      )
      return asJson({
        file: filePath,
        message: 'Replaced string through Vly Daytona tools.',
      })
    },

    apply_patch: async (input: any) => {
      const operation = input?.operation
      const filePath = normalizePath(operation?.path)
      assertProjectPath(filePath)

      if (operation?.type === 'delete_file') {
        await codebase.deleteFile(filePath)
        return asJson({
          message: 'Deleted file through Vly Daytona tools.',
          applied: [{ file: filePath, action: 'delete' }],
        })
      }

      const diff = String(operation?.diff ?? '')
      if (operation?.type === 'create_file') {
        await codebase.writeFile(filePath, parseCreateDiff(diff))
        return asJson({
          message: 'Created file through Vly Daytona tools.',
          applied: [{ file: filePath, action: 'add' }],
        })
      }

      if (operation?.type === 'update_file') {
        const oldContent = await codebase.readFile(filePath)
        const newContent = applyPatch(oldContent, diff)
        if (newContent === false) {
          return asJson({ errorMessage: 'Failed to apply patch.' })
        }
        await codebase.writeFile(filePath, newContent)
        return asJson({
          message: 'Updated file through Vly Daytona tools.',
          applied: [{ file: filePath, action: 'update' }],
        })
      }

      return asJson({ errorMessage: 'Invalid apply_patch operation.' })
    },

    run_terminal_command: async (input: any) => {
      const command = String(input?.command ?? '')
      if (commandIsBlocked(command)) {
        return asJson({
          errorMessage:
            'Git and GitHub commands are blocked; Vly manages version control.',
        })
      }
      const timeoutSeconds = Number(input?.timeout_seconds ?? 30)
      const result = await codebase.runCommand(
        command,
        Math.max(1, timeoutSeconds) * 1000,
      )
      return asJson({
        output: result.output,
        exitCode: result.exitCode ?? 0,
      })
    },

    list_directory: async (input: any) => {
      const directoryPath = normalizePath(input?.path ?? '.')
      const prefix =
        directoryPath === '.' || directoryPath === ''
          ? ''
          : `${directoryPath.replace(/\/+$/, '')}/`
      assertProjectPath(prefix || 'package.json')
      const files = await codebase.getAllFilePaths()
      return asJson({
        files: files.filter((filePath) => filePath.startsWith(prefix)),
      })
    },

    glob: async (input: any) => {
      const pattern = String(input?.pattern ?? '**/*')
      const matcher = globToRegExp(pattern)
      const files = await codebase.getAllFilePaths()
      return asJson({
        files: files.filter((filePath) => matcher.test(filePath)),
      })
    },

    code_search: async (input: any) => {
      const query = String(input?.query ?? '')
      const escaped = query.replace(/'/g, "'\\''")
      const result = await codebase.runCommand(
        `rg --line-number --no-heading -- '${escaped}' .`,
        30_000,
      )
      return asJson({
        output: result.output,
        exitCode: result.exitCode ?? 0,
      })
    },
  }
}

// Abort the SDK run a minute before the 10-minute cron sweep so the SDK has
const FREEBUFF_RUN_TIMEOUT_MS = 9 * 60 * 1000

async function persistRunState(
  ctx: ActionCtx,
  runState: unknown,
): Promise<Id<'_storage'> | undefined> {
  try {
    const blob = new Blob([JSON.stringify(runState)], {
      type: 'application/json',
    })
    return await ctx.storage.store(blob)
  } catch (error) {
    console.error('[vly-freebuff-workpool] failed to persist run state', error)
    return undefined
  }
}

function buildCommitMessage(userMessage: string): string {
  const firstLine = userMessage.split(/\r?\n/)[0]?.trim() ?? ''
  const trimmed =
    firstLine.length > 60 ? `${firstLine.slice(0, 57)}...` : firstLine
  return trimmed ? `Freebuff: ${trimmed}` : 'Freebuff: update project files'
}

export const runFreebuffAgent = internalAction({
  args: {
    runId: v.string(),
    userId: v.id('users'),
    projectId: v.id('project'),
    threadId: v.id('agent_thread'),
    messageId: v.id('agent_message'),
    userMessage: v.string(),
    agentId: v.optional(v.string()),
    images: v.optional(v.array(v.id('_storage'))),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.runMutation(
      (internal as any).coding_agent.cli_agent.freebuff_agent_run_mutations
        .markFreebuffAgentRunRunning,
      { runId: args.runId },
    )

    const eventBuffer = createRunEventBuffer({ ctx, ...args })
    await recordRunEvent({ ctx, ...args, event: { type: 'start' } })
    let pendingAskUserQuestions: AskUserQuestion[] | undefined

    const abortController = new AbortController()
    const timeoutHandle = setTimeout(() => {
      abortController.abort(
        new Error('Freebuff run exceeded 9-minute time limit'),
      )
    }, FREEBUFF_RUN_TIMEOUT_MS)

    try {
      installPromiseWithResolversPolyfill()

      const project = await ctx.runQuery(internal.project.getProject, {
        projectId: args.projectId,
      })
      if (!project) throw new Error('Project not found')

      const codebase = await initializeCodebase(
        project.sandbox_id,
        project.packageManager,
      )
      if (!(codebase instanceof DaytonaCodebase)) {
        throw new Error('Freebuff requires a Daytona-backed project')
      }

      const imageContents = await loadImageContents(ctx, args.images)
      const multimodalContent =
        imageContents.length > 0
          ? [
              { type: 'text' as const, text: args.userMessage },
              ...imageContents,
            ]
          : undefined

      const runState = await run({
        apiKey: requireEnv('CODEBUFF_API_KEY'),
        fingerprintId: args.projectId,
        agent: args.agentId ?? 'base2-free',
        // Cast bypasses a cross-package AgentDefinition type drift between
        // `agents/types` and `sdk/dist` (e.g. the gravity_index tool param
        // union). Runtime shape is identical.
        agentDefinitions: bundledAgentDefinitions as any,
        prompt: args.userMessage,
        ...(multimodalContent ? { content: multimodalContent } : {}),
        previousRun: await readStoredRunState(ctx, args.threadId),
        costMode: 'normal',
        signal: abortController.signal,
        overrideTools: buildFreebuffOverrideTools(codebase, {
          onAskUser: (input) => {
            pendingAskUserQuestions = sanitizeAskUserQuestions(input)
            throw createAskUserPauseError(input)
          },
        }) as any,
        handleEvent: async (event: any) => {
          if (event.type === 'tool_call') {
            await eventBuffer.flush()
            await recordRunEvent({
              ctx,
              ...args,
              event: {
                type: 'status',
                title:
                  event.toolName === 'ask_user'
                    ? 'Ask user'
                    : (event.toolName ?? 'Tool'),
                content:
                  event.toolName === 'ask_user'
                    ? 'Waiting for your answer'
                    : 'Running tool',
              },
            })
          }
        },
        handleStreamChunk: async (chunk: any) => {
          if (typeof chunk === 'string') {
            eventBuffer.append({ type: 'text_delta', chunk })
          } else if (chunk.type === 'reasoning_chunk') {
            eventBuffer.append({
              type: 'reasoning_delta',
              chunk: chunk.chunk ?? '',
            })
          } else if (chunk.type === 'subagent_chunk') {
            eventBuffer.append({
              type: 'subagent_delta',
              agentType: chunk.agentType,
              chunk: chunk.chunk ?? '',
            })
          }
        },
      })

      await eventBuffer.flush()

      // Always persist run state (success or error) when sessionState exists,
      // so a follow-up "continue" prompt can resume from the same history.
      const runStateStorageId = runState.sessionState
        ? await persistRunState(ctx, runState)
        : undefined

      if (runState.output?.type === 'error') {
        if (
          isAskUserPauseMessage(runState.output.message) &&
          pendingAskUserQuestions?.length
        ) {
          await recordRunEvent({
            ctx,
            ...args,
            runStateStorageId,
            event: {
              type: 'ask_user_pause',
              questions: pendingAskUserQuestions,
              meteredCredits:
                runState.sessionState?.mainAgentState.creditsUsed ?? 0,
            },
          })
          return null
        }

        const isLocalTimeout = abortController.signal.aborted
        const message = isLocalTimeout
          ? 'Maximum time limit for a prompt reached. Engagement required to continue.'
          : runState.output.message
        await recordRunEvent({
          ctx,
          ...args,
          event: {
            type: isLocalTimeout ? 'time_limit_pause' : 'error',
            message,
            meteredCredits:
              runState.sessionState?.mainAgentState.creditsUsed ?? 0,
          },
          runStateStorageId,
        })
        return null
      }

      try {
        await ctx.runAction(internal.codesandbox.versionControl.commit, {
          projectId: args.projectId,
          message: buildCommitMessage(args.userMessage),
        })
      } catch (commitError) {
        console.warn(
          '[vly-freebuff-workpool] post-run commit failed',
          commitError,
        )
        // Non-fatal: still mark the run as completed.
      }

      await recordRunEvent({
        ctx,
        ...args,
        event: {
          type: 'final',
          meteredCredits:
            runState.sessionState?.mainAgentState.creditsUsed ?? 0,
        },
        runStateStorageId,
      })

      return null
    } catch (error) {
      await eventBuffer.flush()
      if (isAskUserPauseError(error)) {
        const questions = pendingAskUserQuestions?.length
          ? pendingAskUserQuestions
          : sanitizeAskUserQuestions(getAskUserPauseInput(error))

        if (questions.length > 0) {
          await recordRunEvent({
            ctx,
            ...args,
            event: {
              type: 'ask_user_pause',
              questions,
            },
          })
          return null
        }
      }

      if (abortController.signal.aborted) {
        await recordRunEvent({
          ctx,
          ...args,
          event: {
            type: 'time_limit_pause',
            message:
              'Maximum time limit for a prompt reached. Engagement required to continue.',
          },
        })
        return null
      }

      await recordRunEvent({
        ctx,
        ...args,
        event: {
          type: 'error',
          message: getErrorMessage(error),
        },
      })
      throw error
    } finally {
      clearTimeout(timeoutHandle)
    }
  },
})
