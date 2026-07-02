'use node'

import { gzipSync, gunzipSync } from 'node:zlib'

import { run } from '@codebuff/sdk'
import { applyPatch } from 'diff'
import { v } from 'convex/values'

import { isFreebuffMultimodalModelId } from '@codebuff/common/constants/freebuff-models'
import { FILE_READ_STATUS } from '@codebuff/common/constants/paths'
import {
  stripColors,
  truncateStringWithMessage,
} from '@codebuff/common/util/string'

import { internal } from '../../_generated/api'
import { Id } from '!/_generated/dataModel'
import { ActionCtx, internalAction } from '!/_generated/server'
import { capturePendingIntegrationFromToolOutput } from '../../gravity_report'
import { DaytonaCodebase } from '../../../codebase-utils/codebase/DaytonaCodebase'
import { initializeCodebase } from '../../../codebase-utils/codebase/initializeCodebase'
import {
  bundledAgentDefinitions,
  resolveFreebuffAgentId,
  CONNECTED_REPO_AGENT_GUIDANCE,
} from './freebuff_bundled_agents'
import {
  PER_ACTION_ABORT_MS,
  CLOUD_PER_ACTION_ABORT_MS,
  CLOUD_TURN_BUDGET_MS,
  MAX_TURN_CONTINUATIONS,
} from './timeLimits'

function requireEnv(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

// Resume blobs are stored gzipped (the JSON session state compresses ~10x),
// which cuts both file storage and the Convex data egress billed every time an
// action/continuation reads the blob back. Older blobs predate compression, so
// sniff the gzip magic bytes and fall back to plain JSON.
async function readResumeStateFromStorage(
  ctx: ActionCtx,
  storageId: Id<'_storage'>,
): Promise<any | undefined> {
  const blob = await ctx.storage.get(storageId)
  if (!blob) return undefined
  try {
    const bytes = Buffer.from(await blob.arrayBuffer())
    const isGzip = bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b
    const json = isGzip ? gunzipSync(bytes).toString('utf8') : bytes.toString('utf8')
    return JSON.parse(json)
  } catch (error) {
    console.error('[vly-freebuff-workpool] failed to parse run state', error)
    return undefined
  }
}

async function readStoredRunState(
  ctx: ActionCtx,
  threadId: Id<'agent_thread'>,
): Promise<{ state: any | undefined; storageId: Id<'_storage'> | undefined }> {
  const thread = await ctx.runQuery(
    internal.coding_agent.cli_agent.agent_thread.getAgentThread,
    { threadId },
  )
  const storageId = (thread as any)?.active_freebuff_run_state_storage_id as
    | Id<'_storage'>
    | undefined
  if (!storageId) return { state: undefined, storageId: undefined }
  return { state: await readResumeStateFromStorage(ctx, storageId), storageId }
}

function trimOutput(output: unknown) {
  const o = output as { type?: unknown; message?: unknown } | undefined
  return {
    type: typeof o?.type === 'string' ? o.type : 'error',
    message:
      typeof o?.message === 'string'
        ? o.message.slice(-2000)
        : 'Previous run output trimmed',
  }
}

// Resume-blob modes (both Freebuff Web template projects and Freebuff Cloud
// connected repos resume with FULL conversation context — no message pruning,
// role-stripping, or content clipping — so every "continue" keeps complete
// history, the same way the CLI/SDK resumes from the full `sessionState`):
//   - 'continuation' (mid-task auto-continue) and 'full' (between turns) now
//     produce the SAME minimal blob: full message history with the heavy,
//     rebuildable file-index cache (fileTree / fileTokenScores / tokenCallers)
//     dropped.
//
// Why dropping the cache is safe AND a big egress win: `runFreebuffAgent` always
// passes fresh `projectFiles` to `run()`, and the SDK's
// `applyOverridesToSessionState` recomputes fileTree/fileTokenScores/tokenCallers
// from those `projectFiles` on every resume — so any persisted cache is discarded
// and rebuilt regardless. Persisting it verbatim (the old 'continuation' path)
// just stored and re-read a large, immediately-overwritten payload, up to
// MAX_FREEBUFF_CONTINUATIONS times per long task. That file store/read is billed
// as Convex data egress and was a primary driver of this action's egress cost.
type ResumeMode = 'continuation' | 'full'

function buildResumeState(runState: unknown, mode: ResumeMode) {
  const typed = runState as {
    sessionState?: {
      fileContext?: {
        fileTree?: unknown[]
        fileTokenScores?: Record<string, unknown>
        tokenCallers?: Record<string, unknown>
      }
    }
    traceSessionId?: string
    output?: unknown
  }
  const sessionState = typed?.sessionState
  if (!sessionState) return undefined

  // Shallow-clone so concurrent persists in the same handler don't see
  // mutations. Keep the full message history; only drop the rebuildable
  // file-index cache. (Applies to both resume modes — see note above.)
  const outSession: any = { ...sessionState }
  if (sessionState.fileContext) {
    outSession.fileContext = {
      ...sessionState.fileContext,
      fileTree: [],
      fileTokenScores: {},
      tokenCallers: {},
    }
  }

  return {
    sessionState: outSession,
    traceSessionId: typed.traceSessionId,
    output: trimOutput(typed.output),
  }
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
    // Each flush is one `recordRunEvent` mutation, and that mutation does a
    // read-modify-write of the entire (growing) `assistant_stream` array on the
    // message doc. Fewer flushes => fewer full-array rewrites => quadratically
    // less Convex DB I/O over a long message. 750ms keeps streaming visibly
    // live while roughly halving the mutation count vs the old 350ms.
    flushTimer = setTimeout(() => {
      flushPromise = flushPromise.then(flushNow).catch((error) => {
        console.error('[vly-freebuff-workpool] stream flush failed', error)
      })
    }, 750)
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
        multiSelect:
          record.multiSelect === true ||
          record.multi_select === true ||
          record.allowMultiple === true ||
          record.allow_multiple === true,
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

const SANDBOX_PROJECT_ROOT = '/home/daytona/codebase'
const MAX_FILE_READ_CHARS = 100_000
const MAX_FILE_READ_BYTES = 10 * 1024 * 1024
const COMMAND_OUTPUT_LIMIT = 50_000
const MAX_TOOL_FILE_LIST_ITEMS = 500
const PROJECT_INDEX_CONTENT_LIMIT = 750_000
const PROJECT_INDEX_FILE_CONTENT_LIMIT = 50_000
const PROJECT_INDEX_MAX_CONTENT_FILES = 150
const PROJECT_PATH_PREFIXES = [
  `${SANDBOX_PROJECT_ROOT}/`,
  SANDBOX_PROJECT_ROOT,
]

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

function isSensitiveProjectPath(filePath: string) {
  const normalized = filePath.toLowerCase()
  const segments = normalized.split('/')
  const basename = segments.at(-1) ?? normalized
  if (
    basename === '.env' ||
    basename.startsWith('.env.') ||
    basename.endsWith('.pem') ||
    basename.endsWith('.key') ||
    basename.endsWith('.p12') ||
    basename.endsWith('.pfx')
  ) {
    return true
  }
  return (
    normalized.includes('/.ssh/') ||
    normalized.includes('/.aws/') ||
    normalized.includes('/.config/gcloud/') ||
    normalized.includes('jwt_private_key') ||
    normalized.includes('jwks')
  )
}

function formatLargeFileStatus(contentLength: number) {
  const mb = (contentLength / (1024 * 1024)).toFixed(1)
  return `${FILE_READ_STATUS.TOO_LARGE} [${mb}MB exceeds 10MB limit. Use code_search or glob to find specific content.]`
}

function truncateFileContent(content: string) {
  if (content.length > MAX_FILE_READ_BYTES) {
    return formatLargeFileStatus(content.length)
  }
  if (content.length <= MAX_FILE_READ_CHARS) {
    return content
  }
  return (
    content.slice(0, MAX_FILE_READ_CHARS) +
    `\n\n${FILE_READ_STATUS.TOO_LARGE}: This file is ${content.length.toLocaleString()} chars, exceeding the ${MAX_FILE_READ_CHARS.toLocaleString()} char limit. The content above has been truncated. Use code_search or more targeted reads for the relevant section.`
  )
}

function truncateToolOutput(output: string) {
  return truncateStringWithMessage({
    str: stripColors(output),
    maxLength: COMMAND_OUTPUT_LIMIT,
    remove: 'MIDDLE',
  })
}

function truncateFileList(files: string[]) {
  const sorted = [...files].sort()
  const visible = sorted.slice(0, MAX_TOOL_FILE_LIST_ITEMS)
  return {
    files: visible,
    count: sorted.length,
    truncated: sorted.length > visible.length,
    ...(sorted.length > visible.length
      ? {
          message: `Showing ${visible.length.toLocaleString()} of ${sorted.length.toLocaleString()} matching files. Narrow the path or pattern for more specific results.`,
        }
      : {}),
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

function shouldIncludeProjectIndexContent(filePath: string) {
  if (isSensitiveProjectPath(filePath)) return false
  if (filePath.includes('/dist/') || filePath.includes('/build/')) return false
  if (filePath.includes('/node_modules/')) return false
  return (
    filePath === 'package.json' ||
    filePath === 'README.md' ||
    filePath === 'src/App.tsx' ||
    filePath === 'src/main.tsx' ||
    filePath === 'src/index.css' ||
    /\.(ts|tsx|js|jsx|css|md)$/i.test(filePath)
  )
}

async function buildDaytonaProjectFiles(
  codebase: DaytonaCodebase,
  options?: { includeContent?: boolean },
): Promise<Record<string, string>> {
  const filePaths = (await codebase.getAllFilePaths()).filter(
    (filePath) => !isSensitiveProjectPath(filePath),
  )
  const projectFiles: Record<string, string> = Object.fromEntries(
    filePaths.map((filePath) => [filePath, '']),
  )

  // On continuations (same turn, same agent session) the model already saw the
  // seed file contents in the resumed history and can re-read anything via its
  // tools. Re-sending up to ~750KB of file bodies to the LLM on every chained
  // continuation is pure egress, so we ship only the file tree (empty content)
  // and keep the full content seed for the first action of a turn.
  if (options?.includeContent === false) {
    return projectFiles
  }

  let contentBudget = PROJECT_INDEX_CONTENT_LIMIT
  let contentFiles = 0
  for (const filePath of filePaths) {
    if (contentFiles >= PROJECT_INDEX_MAX_CONTENT_FILES || contentBudget <= 0) {
      break
    }
    if (!shouldIncludeProjectIndexContent(filePath)) {
      continue
    }
    try {
      const content = await codebase.readFile(filePath)
      if (
        content.length === 0 ||
        content.length > PROJECT_INDEX_FILE_CONTENT_LIMIT ||
        content.length > contentBudget
      ) {
        continue
      }
      projectFiles[filePath] = content
      contentBudget -= content.length
      contentFiles += 1
    } catch {
      // Keep the path in the tree even if content is temporarily unavailable.
    }
  }

  return projectFiles
}

function parseCreateDiff(diff: string) {
  return diff
    .split(/\r?\n/)
    .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
    .map((line) => line.slice(1))
    .join('\n')
}

interface FreebuffRuntimeConfig {
  install_command?: string
  preview_command?: string
  preview_port?: number
  build_command?: string
  detection_status?: 'pending' | 'detecting' | 'ready' | 'failed'
}

/**
 * Preview / build configuration for connected-repo (Freebuff Cloud) projects.
 * The agent drives this through `run_terminal_command` using a
 * `freebuff-preview` command namespace (documented in the connected-repo
 * guidance), e.g.
 *   freebuff-preview set "bun run dev" 5173   # save the dev command (no start)
 *   freebuff-preview set-install "bun install"  # save the install command
 *   freebuff-preview set-build "bun run build" # save the build/deploy command
 *   freebuff-preview start | restart | stop | status | logs
 *
 * IMPORTANT: `set` only SAVES the command — it does NOT start the dev server.
 * The user starts/stops the preview from the Cloud UI so they control sandbox
 * resource usage. The agent should configure commands and let the user start.
 */
async function handleFreebuffPreviewCommand(
  codebase: DaytonaCodebase,
  rawCommand: string,
  hooks: {
    getRuntimeConfig: () => Promise<FreebuffRuntimeConfig | undefined>
    setRuntimeConfig: (config: FreebuffRuntimeConfig) => Promise<void>
    setPreviewUrl: (url: string) => Promise<void>
  },
): Promise<string> {
  // Tokenize, honoring a single double-quoted command argument.
  const args = rawCommand.trim().slice('freebuff-preview'.length).trim()
  const sub = args.split(/\s+/)[0] ?? ''
  const rest = args.slice(sub.length).trim()

  const current = (await hooks.getRuntimeConfig()) ?? {}

  if (sub === 'set') {
    const quoted = rest.match(/^"([^"]+)"\s*(\d+)?$/)
    const previewCommand = quoted ? quoted[1] : rest.replace(/\s+\d+$/, '')
    const portMatch = quoted?.[2] ?? rest.match(/(\d+)\s*$/)?.[1]
    const previewPort = portMatch ? Number(portMatch) : current.preview_port
    if (!previewCommand) {
      return JSON.stringify({ errorMessage: 'Usage: freebuff-preview set "<command>" <port>' })
    }
    // Save only — do NOT start the dev server. The user starts it from the UI.
    await hooks.setRuntimeConfig({
      preview_command: previewCommand,
      ...(previewPort ? { preview_port: previewPort } : {}),
      detection_status: 'ready',
    })
    return JSON.stringify({
      message:
        'Saved preview command. The user can start the dev server from the Cloud UI (it is not started automatically).',
      previewCommand,
      previewPort,
    })
  }

  if (sub === 'set-build') {
    const quoted = rest.match(/^"([^"]+)"\s*$/)
    const buildCommand = quoted ? quoted[1] : rest
    if (!buildCommand) {
      return JSON.stringify({ errorMessage: 'Usage: freebuff-preview set-build "<command>"' })
    }
    await hooks.setRuntimeConfig({ build_command: buildCommand })
    return JSON.stringify({ message: 'Saved build command', buildCommand })
  }

  if (sub === 'set-install') {
    const quoted = rest.match(/^"([^"]+)"\s*$/)
    const installCommand = quoted ? quoted[1] : rest
    if (!installCommand) {
      return JSON.stringify({
        errorMessage: 'Usage: freebuff-preview set-install "<command>"',
      })
    }
    await hooks.setRuntimeConfig({ install_command: installCommand })
    return JSON.stringify({ message: 'Saved install command', installCommand })
  }

  if (sub === 'start' || sub === 'restart') {
    if (!current.preview_command) {
      return JSON.stringify({ errorMessage: 'No preview command set yet. Use: freebuff-preview set "<command>" <port>' })
    }
    await codebase.startPreviewProcess(current.preview_command)
    let url: string | undefined
    if (current.preview_port) {
      url = await codebase.getPreviewLinkForPort(current.preview_port)
      await hooks.setPreviewUrl(url)
    }
    return JSON.stringify({ message: 'Preview started', previewUrl: url })
  }

  if (sub === 'stop') {
    await codebase.stopPreviewProcess()
    return JSON.stringify({ message: 'Preview stopped' })
  }

  if (sub === 'logs') {
    const logs = await codebase.getPreviewLogs()
    return JSON.stringify({ logs: logs || '(no preview logs yet)' })
  }

  if (sub === 'status') {
    const running = await codebase.isPreviewProcessRunning()
    return JSON.stringify({
      running,
      installCommand: current.install_command ?? null,
      previewCommand: current.preview_command ?? null,
      previewPort: current.preview_port ?? null,
      buildCommand: current.build_command ?? null,
    })
  }

  return JSON.stringify({
    errorMessage:
      'Unknown freebuff-preview subcommand. Use: set "<command>" <port> | set-install "<command>" | set-build "<command>" | start | restart | stop | logs | status',
  })
}

function buildFreebuffOverrideTools(
  getCodebase: () => Promise<DaytonaCodebase>,
  options: {
    onAskUser?: (input: unknown) => never
    // Connected-repo (Freebuff Cloud) context. When present, git commands are
    // allowed and the `freebuff-preview` command namespace is enabled.
    projectType?: string
    getRuntimeConfig?: () => Promise<FreebuffRuntimeConfig | undefined>
    setRuntimeConfig?: (config: FreebuffRuntimeConfig) => Promise<void>
    setPreviewUrl?: (url: string) => Promise<void>
  } = {},
) {
  const isConnectedRepo = options.projectType === 'connected_repo'
  const writeFileTool = async (input: any) => {
    const codebase = await getCodebase()
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
  }

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
      const codebase = await getCodebase()
      const filePaths = Array.isArray(input?.filePaths) ? input.filePaths : []
      const results: Record<string, string | null> = {}
      for (const filePath of filePaths) {
        const normalized = normalizePath(filePath)
        try {
          assertProjectPath(normalized)
        } catch {
          results[String(filePath)] = FILE_READ_STATUS.OUTSIDE_PROJECT
          continue
        }
        if (isSensitiveProjectPath(normalized)) {
          results[normalized] = FILE_READ_STATUS.IGNORED
          continue
        }
        try {
          results[normalized] = truncateFileContent(
            await codebase.readFile(normalized),
          )
        } catch {
          results[normalized] = FILE_READ_STATUS.DOES_NOT_EXIST
        }
      }
      return results
    },

    write_file: writeFileTool,

    str_replace: async (input: any) => {
      const codebase = await getCodebase()
      const filePath = normalizePath(input?.path)
      assertProjectPath(filePath)

      if (input?.content !== undefined || input?.type === 'patch') {
        return await writeFileTool(input)
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
      const codebase = await getCodebase()
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
      const codebase = await getCodebase()
      const command = String(input?.command ?? '')

      // Connected-repo projects manage their own git (real repo, branches),
      // and expose preview control via the `freebuff-preview` namespace.
      if (isConnectedRepo) {
        if (command.trim().startsWith('freebuff-preview')) {
          const output = await handleFreebuffPreviewCommand(codebase, command, {
            getRuntimeConfig:
              options.getRuntimeConfig ?? (async () => undefined),
            setRuntimeConfig: options.setRuntimeConfig ?? (async () => {}),
            setPreviewUrl: options.setPreviewUrl ?? (async () => {}),
          })
          return asJson({ output: truncateToolOutput(output), exitCode: 0 })
        }
      } else if (commandIsBlocked(command)) {
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
        output: truncateToolOutput(result.output),
        exitCode: result.exitCode ?? 0,
      })
    },

    list_directory: async (input: any) => {
      const codebase = await getCodebase()
      const directoryPath = normalizePath(input?.path ?? '.')
      const prefix =
        directoryPath === '.' || directoryPath === ''
          ? ''
          : `${directoryPath.replace(/\/+$/, '')}/`
      assertProjectPath(prefix || 'package.json')
      const files = await codebase.getAllFilePaths()
      return asJson({
        ...truncateFileList(
          files.filter((filePath) => filePath.startsWith(prefix)),
        ),
        path: directoryPath,
      })
    },

    glob: async (input: any) => {
      const codebase = await getCodebase()
      const pattern = String(input?.pattern ?? '**/*')
      const matcher = globToRegExp(pattern)
      const files = await codebase.getAllFilePaths()
      return asJson({
        ...truncateFileList(files.filter((filePath) => matcher.test(filePath))),
      })
    },

    code_search: async (input: any) => {
      const codebase = await getCodebase()
      const query = String(input?.query ?? '')
      const escaped = query.replace(/'/g, "'\\''")
      const result = await codebase.runCommand(
        `rg --line-number --no-heading -- '${escaped}' .`,
        30_000,
      )
      return asJson({
        output: truncateToolOutput(result.output),
        exitCode: result.exitCode ?? 0,
      })
    },
  }
}

// Abort the SDK run a minute before the 10-minute cron sweep so the SDK has
/** Friendly activity-stream titles for gravity_index calls so the run feed
 *  reads naturally ("Finding services: payments for React") instead of
 *  showing the raw tool name. Verbs mirror toolCallDisplay in
 *  freebuff/web/src/app/chat/blocks.ts. */
function gravityIndexStatusEvent(input: unknown): {
  title: string
  content: string
} {
  const record =
    input && typeof input === 'object' && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {}
  const str = (value: unknown): string =>
    typeof value === 'string' ? value.trim() : ''
  switch (record.action) {
    case 'search':
      return {
        title: 'Finding services',
        content: str(record.query) || 'Searching the integration catalog',
      }
    case 'browse':
      return {
        title: 'Browsing services',
        content:
          [str(record.category), str(record.q)].filter(Boolean).join(' · ') ||
          'Browsing the integration catalog',
      }
    case 'list_categories':
      return {
        title: 'Browsing services',
        content: 'Listing integration categories',
      }
    case 'get_service':
      return {
        title: 'Fetching service details',
        content: str(record.slug) || 'Fetching service details',
      }
    case 'report_integration':
      return {
        title: 'Reporting integration',
        content:
          str(record.integrated_slug) || 'Reporting completed integration',
      }
    default:
      return {
        title: 'Finding services',
        content: 'Using the integration catalog',
      }
  }
}

// In-action time limit. We abort ~1 minute before the 10-minute cron sweep so
// the handler can persist state and schedule a continuation before Convex (or
// the sweep) reclaims the run. A single user turn crosses this by chaining
// continuations (cloud only) up to CLOUD_TURN_BUDGET_MS.
const FREEBUFF_RUN_TIMEOUT_MS = PER_ACTION_ABORT_MS

// Defensive backstop on the number of chained continuations for a single user
// turn. The binding limit for cloud turns is the wall-clock CLOUD_TURN_BUDGET_MS
// checked in attemptContinuation; this only guards against a pathological loop
// that somehow stays under the wall-clock budget. Each continuation resumes from
// the FULL persisted session state, so the agent always keeps complete context.
const MAX_FREEBUFF_CONTINUATIONS = MAX_TURN_CONTINUATIONS

const CONTINUATION_PROMPT =
  'Continue working on the current task from exactly where you left off. ' +
  'Do not restart or repeat work that is already done — pick up the next step ' +
  'and keep going until the task is fully complete.'

async function persistRunState(
  ctx: ActionCtx,
  runState: unknown,
  mode: ResumeMode,
  // Storage id of the resume blob this one replaces. Deleted best-effort after
  // the new blob is stored so stale resume blobs don't accumulate forever (each
  // turn/continuation used to orphan its predecessor — those dead blobs inflate
  // file storage and get re-serialized into every backup, which Convex bills as
  // data egress).
  supersedesStorageId?: Id<'_storage'>,
): Promise<Id<'_storage'> | undefined> {
  try {
    const resumeState = buildResumeState(runState, mode)
    if (!resumeState) {
      return undefined
    }
    // Gzip before storing: the session-state JSON is highly repetitive and
    // compresses ~10x, and this blob is re-read (billed as egress) on every
    // continuation and follow-up turn.
    const blob = new Blob([gzipSync(Buffer.from(JSON.stringify(resumeState)))], {
      type: 'application/gzip',
    })
    const storageId = await ctx.storage.store(blob)
    if (supersedesStorageId && supersedesStorageId !== storageId) {
      try {
        await ctx.storage.delete(supersedesStorageId)
      } catch (deleteError) {
        console.warn(
          '[vly-freebuff-workpool] failed to delete superseded run state',
          deleteError,
        )
      }
    }
    return storageId
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

// Marker on the abort reason so the run handler can tell a user cancellation
// apart from the 9-minute time-limit abort.
const CANCELLED_BY_USER = 'freebuff_cancelled_by_user'

// Pinged by cron to keep this Node bundle's runtime warm. Loading this module
// is the expensive part of a cold start (~5-9s: @codebuff/sdk + all bundled
// agent definitions), so a periodic no-op invocation keeps the module cache
// hot and first-message latency in the warm path (~2-3s instead of ~13-16s).
export const warmFreebuffRuntime = internalAction({
  args: {},
  returns: v.null(),
  handler: async () => {
    // Touch the heavyweight imports so bundlers can't tree-shake them out of
    // the warm path.
    void run
    void bundledAgentDefinitions.length
    return null
  },
})

// Cancellation lives in `freebuff_agent_run_mutations.cancelFreebuffAgentRunByRunId`
// — that mutation marks the run as cancelled (the running action polls this
// and aborts itself) and calls `ctx.scheduler.cancel` for runs that haven't
// started yet. Removing the wrapper action here saves a Node hop on cancel.

export const runFreebuffAgent = internalAction({
  args: {
    runId: v.string(),
    userId: v.id('users'),
    projectId: v.id('project'),
    threadId: v.id('agent_thread'),
    messageId: v.id('agent_message'),
    userMessage: v.string(),
    freebuffModel: v.optional(v.string()),
    images: v.optional(v.array(v.id('_storage'))),
    sandboxId: v.string(),
    packageManager: v.optional(v.union(v.literal('bun'), v.literal('pnpm'))),
    // Auto-continuation across the in-action time limit. When set, this run
    // resumes the same user turn from the full session state in
    // `resumeFromStorageId` instead of starting a fresh turn. `continuationCount`
    // bounds how many times we may transparently continue.
    continuationCount: v.optional(v.number()),
    resumeFromStorageId: v.optional(v.id('_storage')),
    // Wall-clock timestamp (ms) of when this user turn first started, carried
    // across continuations. The cloud turn budget (CLOUD_TURN_BUDGET_MS) is
    // measured against this so chained continuations share one budget rather
    // than each getting a fresh per-action window. Absent on the first run.
    turnStartedAtMs: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const isContinuation = !!args.resumeFromStorageId
    // Wall-clock start of THIS user turn, shared across all chained
    // continuations. On the first run we stamp it now; continuations carry it
    // forward so CLOUD_TURN_BUDGET_MS bounds the whole turn, not each action.
    const turnStartedAtMs = args.turnStartedAtMs ?? Date.now()

    // Detect cloud (connected_repo) once, up front: it selects the (shorter)
    // per-action abort so the chained continuation has a larger finalization
    // margin, and is reused below for the connected-repo agent guidance.
    const connectedRepoProject = await ctx.runQuery(
      internal.cloud.connectRepoMutations.getConnectedRepoProject,
      { projectId: args.projectId },
    )
    const isConnectedRepoProject =
      connectedRepoProject?.project_type === 'connected_repo'

    await ctx.runMutation(
      (internal as any).coding_agent.cli_agent.freebuff_agent_run_mutations
        .markFreebuffAgentRunRunning,
      { runId: args.runId },
    )

    // If the user already cancelled before this work item started, bail out
    // before doing any work.
    const initialStatus = await ctx.runQuery(
      (internal as any).coding_agent.cli_agent.freebuff_agent_run_mutations
        .getFreebuffAgentRunStatus,
      { runId: args.runId },
    )
    if (initialStatus === 'cancelled') {
      await ctx.runMutation(
        (internal as any).coding_agent.freebuff_bridge_mutations
          .recordFreebuffCancellationState,
        {
          threadId: args.threadId,
          projectId: args.projectId,
          runId: args.runId,
        },
      )
      return null
    }

    const eventBuffer = createRunEventBuffer({ ctx, ...args })
    // On a continuation the message is already streaming into the same assistant
    // bubble — don't emit another `start` (it would reset nothing useful and the
    // turn already began).
    if (!isContinuation) {
      await recordRunEvent({ ctx, ...args, event: { type: 'start' } })
    }
    let pendingAskUserQuestions: AskUserQuestion[] | undefined

    const abortController = new AbortController()
    const runStartedAtMs = Date.now()
    // Cloud (connected_repo) caps the per-action abort at the remaining turn
    // budget so the final chained action lands at CLOUD_TURN_BUDGET_MS instead
    // of overshooting by a full per-action window. Web/template uses the flat
    // per-action limit and pauses for a manual continue.
    const MIN_CLOUD_ACTION_MS = 30 * 1000
    const perActionAbortMs = isConnectedRepoProject
      ? Math.max(
          MIN_CLOUD_ACTION_MS,
          Math.min(
            CLOUD_PER_ACTION_ABORT_MS,
            CLOUD_TURN_BUDGET_MS - (Date.now() - turnStartedAtMs),
          ),
        )
      : FREEBUFF_RUN_TIMEOUT_MS
    const timeoutHandle = setTimeout(() => {
      abortController.abort(
        new Error('Freebuff run exceeded per-action time limit'),
      )
    }, perActionAbortMs)

    // Review-phase instrumentation. The code reviewer runs as a spawned subagent
    // (kept inline by design). We track whether a reviewer was streaming and how
    // recently, so that if the run crosses the time limit we can clearly flag
    // whether the review step is what pushed it over (visible in Convex logs
    // during testing).
    let reviewerEverRan = false
    let lastReviewerChunkAtMs = 0

    // Cooperative cancellation: the running SDK call can't be force-killed, so
    // we poll the run ledger (set to 'cancelled' when the user terminates the
    // thread) from the stream/event callbacks and abort the run ourselves.
    let cancelledByUser = false
    let lastCancelCheck = 0
    let lastToolStatusAt = 0
    let lastToolStatusKey = ''

    // Storage id of the resume blob this turn resumed from. Assigned once the
    // previous state is loaded below; every blob we persist this turn supersedes
    // it, so we hand it to `persistRunState` for best-effort deletion (keeps
    // stale resume blobs from accumulating in file storage / backups).
    let priorResumeStorageId: Id<'_storage'> | undefined

    const maybeRecordToolStatus = async (
      toolName: string | undefined,
      input: unknown,
    ) => {
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

      if (key === lastToolStatusKey && now - lastToolStatusAt < 1500) {
        return
      }

      lastToolStatusKey = key
      lastToolStatusAt = now
      await recordRunEvent({
        ctx,
        ...args,
        event: {
          type: 'status',
          title,
          content,
        },
      })
    }

    const checkCancelled = async () => {
      if (abortController.signal.aborted) return
      const now = Date.now()
      // 5s poll: a user cancel takes at most a few extra seconds to land, and
      // this runs for the entire (many-minute) action — at 1.5s it was ~400
      // extra queries per 10-minute run.
      if (now - lastCancelCheck < 5000) return
      lastCancelCheck = now
      try {
        const status = await ctx.runQuery(
          (internal as any).coding_agent.cli_agent.freebuff_agent_run_mutations
            .getFreebuffAgentRunStatus,
          { runId: args.runId },
        )
        if (status === 'cancelled' && !abortController.signal.aborted) {
          cancelledByUser = true
          abortController.abort(new Error(CANCELLED_BY_USER))
        }
      } catch (error) {
        console.warn('[vly-freebuff-workpool] cancel check failed', error)
      }
    }

    // Long-running-task handling: when we hit the in-action time limit, persist
    // the FULL session state and schedule another run that resumes the SAME
    // turn with complete context — instead of stopping and waiting for the user
    // to type "continue". Returns true when a continuation was scheduled (the
    // caller should then exit without recording a terminal/pause event so the
    // message keeps streaming seamlessly).
    //
    // The binding limit is the wall-clock CLOUD_TURN_BUDGET_MS measured from the
    // turn's first start (shared across continuations). MAX_FREEBUFF_CONTINUATIONS
    // is only a defensive backstop. Once the turn budget is exhausted we fall
    // through to a normal time-limit pause so the user can resume manually.
    const attemptContinuation = async (runState: any): Promise<boolean> => {
      const nextCount = (args.continuationCount ?? 0) + 1
      if (nextCount > MAX_FREEBUFF_CONTINUATIONS) return false
      if (Date.now() - turnStartedAtMs >= CLOUD_TURN_BUDGET_MS) return false
      if (!runState?.sessionState) return false

      const resumeStorageId = await persistRunState(
        ctx,
        runState,
        'continuation',
        priorResumeStorageId,
      )
      if (!resumeStorageId) return false
      // The continuation now owns this blob; the next iteration supersedes the
      // one we just wrote, not the (now-deleted) prior one.
      priorResumeStorageId = resumeStorageId

      // Refresh the run ledger (reset started_at) so the 10-minute timeout sweep
      // doesn't reap an actively-continuing run. Returns ok:false if the run was
      // cancelled/finished out from under us.
      const restart = await ctx.runMutation(
        (internal as any).coding_agent.cli_agent.freebuff_agent_run_mutations
          .restartFreebuffAgentRunForContinuation,
        { runId: args.runId },
      )
      if (!restart?.ok) return false

      await recordRunEvent({
        ctx,
        ...args,
        event: {
          type: 'status',
          title: 'Working',
          content: 'Continuing — picking up where the last step left off.',
        },
      })

      const scheduledId = await ctx.scheduler.runAfter(
        0,
        internal.coding_agent.cli_agent.executeFreebuff.runFreebuffAgent,
        {
          runId: args.runId,
          userId: args.userId,
          projectId: args.projectId,
          threadId: args.threadId,
          messageId: args.messageId,
          userMessage: args.userMessage,
          freebuffModel: args.freebuffModel,
          images: args.images,
          sandboxId: args.sandboxId,
          packageManager: args.packageManager,
          continuationCount: nextCount,
          resumeFromStorageId: resumeStorageId,
          turnStartedAtMs,
        },
      )

      // Keep work_id pointed at the live scheduled function so a user cancel can
      // still abort the pending continuation.
      await ctx.runMutation(
        (internal as any).coding_agent.cli_agent.freebuff_agent_run_mutations
          .setFreebuffAgentRunWorkId,
        { runId: args.runId, workId: String(scheduledId) },
      )

      return true
    }

    try {
      installPromiseWithResolversPolyfill()

      let codebasePromise: Promise<DaytonaCodebase> | undefined
      const getCodebase = async () => {
        if (!codebasePromise) {
          codebasePromise = (async () => {
            const codebase = await initializeCodebase(
              args.sandboxId,
              args.packageManager,
            )
            if (!(codebase instanceof DaytonaCodebase)) {
              throw new Error('Freebuff requires a Daytona-backed project')
            }
            return codebase
          })()
        }
        return codebasePromise
      }

      // Connected-repo (Freebuff Cloud) projects manage their own git and
      // preview process; we detected the project type up front (see
      // isConnectedRepoProject) so the override tools can adjust behavior.
      const connectedRepoContext = isConnectedRepoProject
        ? { projectType: 'connected_repo' as const }
        : undefined

      const agentId = resolveFreebuffAgentId(args.freebuffModel)
      const supportsImages = isFreebuffMultimodalModelId(args.freebuffModel)

      // Vision-capable models get real multimodal content. Text-only models
      // fall back to inlining image URLs so the model at least has a reference.
      const baseUserMessage = supportsImages
        ? args.userMessage
        : await appendImageUrlsToMessage(ctx, args.userMessage, args.images)
      // Connected-repo guidance is injected per-run here (rather than in the
      // shared system-prompt appendix) so default template projects are
      // completely unaffected.
      const userMessage = connectedRepoContext
        ? `${CONNECTED_REPO_AGENT_GUIDANCE}\n\n---\n\n${baseUserMessage}`
        : baseUserMessage

      // On a continuation we resume the same turn: send the internal continue
      // directive, skip re-injecting images/guidance (already in history), and
      // resume from the full state blob we persisted at the time limit.
      const imageContents =
        !isContinuation && supportsImages
          ? await loadImageContents(ctx, args.images)
          : []
      const multimodalContent =
        imageContents.length > 0
          ? [{ type: 'text' as const, text: userMessage }, ...imageContents]
          : undefined
      const promptForRun = isContinuation ? CONTINUATION_PROMPT : userMessage
      // Storage id of the resume blob we're resuming from. Whatever we persist
      // this turn supersedes it, so we delete it after the new blob is stored
      // (best-effort) to stop stale resume blobs from piling up in file storage
      // and backups. Between turns we read the thread + blob in a single
      // `readStoredRunState` call so we don't add an extra thread read.
      let previousRun: any | undefined
      if (isContinuation) {
        priorResumeStorageId = args.resumeFromStorageId
        previousRun = await readResumeStateFromStorage(
          ctx,
          args.resumeFromStorageId!,
        )
      } else {
        const stored = await readStoredRunState(ctx, args.threadId)
        priorResumeStorageId = stored.storageId
        previousRun = stored.state
      }
      const codebase = await getCodebase()
      const projectFiles = await buildDaytonaProjectFiles(codebase, {
        includeContent: !isContinuation,
      })

      const runState = await run({
        apiKey: requireEnv('CODEBUFF_API_KEY'),
        fingerprintId: args.projectId,
        cwd: SANDBOX_PROJECT_ROOT,
        agent: agentId,
        // Cast bypasses a cross-package AgentDefinition type drift between
        // `agents/types` and `sdk/dist` (e.g. the gravity_index tool param
        // union). Runtime shape is identical.
        agentDefinitions: bundledAgentDefinitions as any,
        prompt: promptForRun,
        ...(multimodalContent ? { content: multimodalContent } : {}),
        projectFiles,
        previousRun,
        costMode: 'normal',
        signal: abortController.signal,
        overrideTools: buildFreebuffOverrideTools(getCodebase, {
          onAskUser: (input) => {
            pendingAskUserQuestions = sanitizeAskUserQuestions(input)
            throw createAskUserPauseError(input)
          },
          projectType: connectedRepoContext?.projectType,
          getRuntimeConfig: async () => {
            const project = await ctx.runQuery(
              internal.cloud.connectRepoMutations.getConnectedRepoProject,
              { projectId: args.projectId },
            )
            return project?.runtime_config ?? undefined
          },
          setRuntimeConfig: async (config) => {
            await ctx.runMutation(
              internal.cloud.connectRepoMutations.updateRuntimeConfig,
              { projectId: args.projectId, config },
            )
          },
          setPreviewUrl: async (url) => {
            await ctx.runMutation(
              internal.cloud.connectRepoMutations
                .setConnectedRepoPreviewUrl,
              { projectId: args.projectId, preview_url: url },
            )
          },
        }) as any,
        handleEvent: async (event: any) => {
          await checkCancelled()
          if (event.type === 'tool_call') {
            // Persist the actual followup prompts so the web UI can render
            // clickable suggestion chips. (Hidden from the activity stream by
            // the existing suggest-followups filter on the frontend.)
            if (event.toolName === 'suggest_followups') {
              await eventBuffer.flush()
              const followups = Array.isArray(event.input?.followups)
                ? event.input.followups
                : []
              if (followups.length > 0) {
                await recordRunEvent({
                  ctx,
                  ...args,
                  event: {
                    type: 'status',
                    title: 'Suggest followups',
                    content: JSON.stringify({ followups }),
                  },
                })
              }
              return
            }

            if (event.toolName === 'ask_user') {
              await eventBuffer.flush()
            }
            await maybeRecordToolStatus(event.toolName, event.input)
            return
          }

          // Arm a deterministic Gravity conversion: when the agent searches the
          // integration index, remember the recommended service + its required
          // env vars so saving those keys later fires report_integration
          // (instead of relying on the model to call it). Best-effort.
          if (
            event.type === 'tool_result' &&
            event.toolName === 'gravity_index'
          ) {
            await capturePendingIntegrationFromToolOutput(ctx, {
              projectId: args.projectId,
              userId: args.userId,
              output: event.output,
            })
          }
        },
        handleStreamChunk: async (chunk: any) => {
          await checkCancelled()
          if (typeof chunk === 'string') {
            eventBuffer.append({ type: 'text_delta', chunk })
          } else if (chunk.type === 'reasoning_chunk') {
            eventBuffer.append({
              type: 'reasoning_delta',
              chunk: chunk.chunk ?? '',
            })
          } else if (chunk.type === 'subagent_chunk') {
            if (
              typeof chunk.agentType === 'string' &&
              /review/i.test(chunk.agentType)
            ) {
              reviewerEverRan = true
              lastReviewerChunkAtMs = Date.now()
            }
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
      // so a follow-up "continue" prompt can resume from the same history. Both
      // web template projects and cloud connected repos keep the FULL
      // conversation context on resume.
      const runStateStorageId = runState.sessionState
        ? await persistRunState(ctx, runState, 'full', priorResumeStorageId)
        : undefined

      // User terminated the thread mid-run. Save partial state cleanly and bail
      // before committing — the message is already marked Cancelled.
      if (cancelledByUser) {
        await ctx.runMutation(
          (internal as any).coding_agent.freebuff_bridge_mutations
            .recordFreebuffCancellationState,
          {
            threadId: args.threadId,
            projectId: args.projectId,
            runId: args.runId,
            runStateStorageId,
          },
        )
        return null
      }

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

        // Make it obvious in testing when a run crosses the time limit, and
        // whether the (inline) review step is the likely culprit. A reviewer
        // streaming within ~20s of the abort strongly implies review pushed the
        // turn over the limit.
        if (isLocalTimeout) {
          const elapsedMs = Date.now() - runStartedAtMs
          const reviewActiveNearAbort =
            reviewerEverRan && Date.now() - lastReviewerChunkAtMs < 20_000
          console.warn(
            '[vly-freebuff-workpool] run hit time limit',
            JSON.stringify({
              runId: args.runId,
              projectId: args.projectId,
              connectedRepo: !!connectedRepoContext,
              continuationCount: args.continuationCount ?? 0,
              elapsedMs,
              elapsedSeconds: Math.round(elapsedMs / 1000),
              reviewerEverRan,
              reviewActiveNearAbort,
              likelyCausedByReview: reviewActiveNearAbort,
            }),
          )
        }

        // Time limit hit but the agent isn't done. For cloud (connected_repo)
        // projects, transparently continue from the full state instead of
        // pausing, so long tasks keep progressing with complete context. Web
        // template projects keep the original behavior (pause, manual continue).
        // Falls through to a pause once the continuation ceiling is exhausted.
        if (isLocalTimeout && connectedRepoContext) {
          const continued = await attemptContinuation(runState)
          if (continued) return null
        }

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

      // User cancellation takes precedence over any other abort/error path.
      if (cancelledByUser) {
        await ctx.runMutation(
          (internal as any).coding_agent.freebuff_bridge_mutations
            .recordFreebuffCancellationState,
          {
            threadId: args.threadId,
            projectId: args.projectId,
            runId: args.runId,
          },
        )
        return null
      }

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
        // The SDK's `run()` normally resolves gracefully on abort (with
        // sessionState intact) so the happy path above can persist full state
        // and attach a fresh runStateStorageId. This branch only fires when
        // something threw instead (e.g. a failure before/outside `run()`
        // itself), so there's no fresh state to persist. Without a fallback,
        // `runStateStorageId` would be omitted entirely — and downstream
        // (`freebuff_bridge_mutations`) that means the thread's resume
        // pointer is left stale, or unset on a user's very first message —
        // so "Continue" would restart the agent with no prior context at all.
        // Reuse the blob this run resumed FROM so at minimum the context up
        // to the start of this action isn't lost.
        await recordRunEvent({
          ctx,
          ...args,
          runStateStorageId: priorResumeStorageId,
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
        runStateStorageId: priorResumeStorageId,
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
