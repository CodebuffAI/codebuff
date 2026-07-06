// Ctx-free Freebuff harness logic, copied from
// freebuff/web/convex/coding_agent/cli_agent/executeFreebuff.ts (the Convex
// action path). The action file is intentionally left untouched while the
// runner rolls out behind the freebuff_runner_enabled flag; once the runner is
// at 100% the action (and this duplication) is deleted.
// See docs/freebuff-render-harness.md.

import { applyPatch } from 'diff'

import { FILE_READ_STATUS } from '@codebuff/common/constants/paths'
import {
  stripColors,
  truncateStringWithMessage,
} from '@codebuff/common/util/string'

import { DaytonaCodebase } from '../../web/codebase-utils/codebase/DaytonaCodebase'

export function trimOutput(output: unknown) {
  const o = output as { type?: unknown; message?: unknown } | undefined
  return {
    type: typeof o?.type === 'string' ? o.type : 'error',
    message:
      typeof o?.message === 'string'
        ? o.message.slice(-2000)
        : 'Previous run output trimmed',
  }
}

/**
 * Repairs tool messages in a stored run state whose content was saved as a
 * plain object instead of ToolResultOutput[]. This happened for WebContainer
 * projects before the override tools were fixed to return the correct array
 * format. Without this, convertCbToModelMessages throws "e.content.map is not
 * a function" when resuming any session that contains those old messages.
 */
export function sanitizeRunState(runState: any): any {
  const history = runState?.sessionState?.mainAgentState?.messageHistory
  if (!Array.isArray(history)) return runState

  const sanitized = history.map((msg: any) => {
    if (msg.role === 'tool' && !Array.isArray(msg.content)) {
      return {
        ...msg,
        content: [{ type: 'json', value: msg.content ?? null }],
      }
    }
    return msg
  })

  return {
    ...runState,
    sessionState: {
      ...runState.sessionState,
      mainAgentState: {
        ...runState.sessionState.mainAgentState,
        messageHistory: sanitized,
      },
    },
  }
}

// Resume blobs keep the FULL message history; only the heavy, rebuildable
// file-index cache (fileTree / fileTokenScores / tokenCallers) is dropped —
// the SDK recomputes it from the fresh `projectFiles` on every resume anyway.
export function buildResumeState(runState: unknown) {
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

export function installPromiseWithResolversPolyfill() {
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

export type FreebuffRunEvent = {
  type:
    | 'start'
    | 'text_delta'
    | 'reasoning_delta'
    | 'subagent_delta'
    | 'status'
    | 'stream_item'
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
  // 'stream_item' passthrough: a UI-shaped item emitted by the Codex/Claude
  // executors, appended verbatim as a delta row.
  item?: {
    type: string
    title?: string
    status?: string
    content: string
    description?: string
  }
  // Set on terminal events of Codex/Claude runs so the bridge skips the
  // Freebuff-specific session/run-state pointer patches.
  agentKind?: 'cli'
}

export function asJson(value: unknown) {
  return [{ type: 'json', value }]
}

export type AskUserOption = {
  label: string
  description?: string
}

export type AskUserQuestion = {
  question: string
  header?: string
  options: AskUserOption[]
  multiSelect?: boolean
}

export const ASK_USER_PAUSE_MESSAGE = 'Freebuff paused for user input.'

export function sanitizeAskUserQuestions(value: unknown): AskUserQuestion[] {
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

export function createAskUserPauseError(input: unknown) {
  const error = new Error(ASK_USER_PAUSE_MESSAGE) as Error & {
    codebuffRunPaused: true
    askUserInput: unknown
  }
  error.name = 'CodebuffRunPausedError'
  error.codebuffRunPaused = true
  error.askUserInput = input
  return error
}

export function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export function getAskUserPauseInput(error: unknown): unknown {
  if (error && typeof error === 'object' && 'askUserInput' in error) {
    return (error as { askUserInput?: unknown }).askUserInput
  }
  return undefined
}

export function isAskUserPauseMessage(message: string | undefined) {
  return Boolean(message && message.includes(ASK_USER_PAUSE_MESSAGE))
}

export function isAskUserPauseError(error: unknown) {
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

export const SANDBOX_PROJECT_ROOT = '/home/daytona/codebase'
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

export async function buildDaytonaProjectFiles(
  codebase: DaytonaCodebase,
): Promise<Record<string, string>> {
  const filePaths = (await codebase.getAllFilePaths()).filter(
    (filePath) => !isSensitiveProjectPath(filePath),
  )
  const projectFiles: Record<string, string> = Object.fromEntries(
    filePaths.map((filePath) => [filePath, '']),
  )

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

export interface FreebuffRuntimeConfig {
  install_command?: string
  preview_command?: string
  preview_port?: number
  build_command?: string
  detection_status?: 'pending' | 'detecting' | 'ready' | 'failed'
}

/**
 * Preview / build configuration for connected-repo (Freebuff Cloud) projects.
 * The agent drives this through `run_terminal_command` using a
 * `freebuff-preview` command namespace. `set` only SAVES the command — the
 * user starts/stops the preview from the Cloud UI.
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

export function buildFreebuffOverrideTools(
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

/** Friendly activity-stream titles for gravity_index calls so the run feed
 *  reads naturally ("Finding services: payments for React") instead of
 *  showing the raw tool name. */
export function gravityIndexStatusEvent(input: unknown): {
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

export function buildCommitMessage(userMessage: string): string {
  const firstLine = userMessage.split(/\r?\n/)[0]?.trim() ?? ''
  const trimmed =
    firstLine.length > 60 ? `${firstLine.slice(0, 57)}...` : firstLine
  return trimmed ? `Freebuff: ${trimmed}` : 'Freebuff: update project files'
}
