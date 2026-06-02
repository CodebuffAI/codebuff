'use node'

import { Workpool } from '@convex-dev/workpool'
import { applyPatch } from 'diff'
import { v } from 'convex/values'

import { components, internal } from '../../_generated/api'
import { Id } from '!/_generated/dataModel'
import { ActionCtx, internalAction } from '!/_generated/server'
import { run } from '../../../../../sdk/src/run'
import { DaytonaCodebase } from '../../../codebase-utils/codebase/DaytonaCodebase'
import { initializeCodebase } from '../../../codebase-utils/codebase/initializeCodebase'
import { bundledAgentDefinitions } from './freebuff_bundled_agents'

export interface ExecuteFreebuffArgs {
  projectId: Id<'project'>
  threadId: Id<'agent_thread'>
  messageId: Id<'agent_message'>
  sandboxId: string
  activeSessionId: string | undefined
  executingUserId: Id<'users'>
  userMessage: string
  images: Id<'_storage'>[] | undefined
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

async function buildUserMessageWithImages(
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

export async function executeFreebuff(
  ctx: ActionCtx,
  _codebase: DaytonaCodebase,
  args: ExecuteFreebuffArgs,
): Promise<ExecuteFreebuffResult> {
  try {
    requireEnv('CODEBUFF_API_KEY')

    const runId = crypto.randomUUID()
    const userMessage = await buildUserMessageWithImages(
      ctx,
      args.userMessage,
      args.images,
    )

    await ctx.runMutation(
      (internal as any).coding_agent.cli_agent.freebuff_agent_run_mutations
        .createFreebuffAgentRun,
      {
        runId,
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
        projectId: args.projectId,
        threadId: args.threadId,
        messageId: args.messageId,
        userMessage,
      },
      { retry: false },
    )

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
    | 'error'
    | 'final'
  chunk?: string
  agentType?: string
  title?: string
  content?: string
  message?: string
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

function normalizePath(value: unknown) {
  return typeof value === 'string' ? value : ''
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

function buildFreebuffOverrideTools(codebase: DaytonaCodebase) {
  return {
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
          return asJson({ file: filePath, errorMessage: 'Failed to apply patch.' })
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
        return await (buildFreebuffOverrideTools(codebase) as any).write_file(
          input,
        )
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

      await codebase.writeFile(filePath, oldContent.replace(oldString, newString))
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

export const runFreebuffAgent = internalAction({
  args: {
    runId: v.string(),
    projectId: v.id('project'),
    threadId: v.id('agent_thread'),
    messageId: v.id('agent_message'),
    userMessage: v.string(),
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

      const runState = await run({
        apiKey: requireEnv('CODEBUFF_API_KEY'),
        fingerprintId: args.projectId,
        agent: 'base2-free',
        agentDefinitions: bundledAgentDefinitions,
        prompt: args.userMessage,
        previousRun: await readStoredRunState(ctx, args.threadId),
        costMode: 'normal',
        overrideTools: buildFreebuffOverrideTools(codebase) as any,
        handleEvent: async (event: any) => {
          if (event.type === 'tool_call') {
            await eventBuffer.flush()
            await recordRunEvent({
              ctx,
              ...args,
              event: {
                type: 'status',
                title: event.toolName ?? 'Tool',
                content: 'Running tool',
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

      if (runState.output?.type === 'error') {
        await recordRunEvent({
          ctx,
          ...args,
          event: {
            type: 'error',
            message: runState.output.message,
          },
        })
        return null
      }

      const blob = new Blob([JSON.stringify(runState)], {
        type: 'application/json',
      })
      const runStateStorageId = await ctx.storage.store(blob)
      await recordRunEvent({
        ctx,
        ...args,
        event: { type: 'final' },
        runStateStorageId,
      })

      return null
    } catch (error) {
      await eventBuffer.flush()
      await recordRunEvent({
        ctx,
        ...args,
        event: {
          type: 'error',
          message: error instanceof Error ? error.message : String(error),
        },
      })
      throw error
    }
  },
})
