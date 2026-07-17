import path from 'path'
import { rmSync } from 'node:fs'

import { callMainPrompt } from '@codebuff/agent-runtime/main-prompt'
import {
  buildUserMessageContent,
  withSystemTags,
} from '@codebuff/agent-runtime/util/messages'
import { MAX_AGENT_STEPS_DEFAULT } from '@codebuff/common/constants/agents'
import {
  getMCPClient,
  listMCPTools,
  callMCPTool,
} from '@codebuff/common/mcp/client'
import { toolNames } from '@codebuff/common/tools/constants'
import {
  fileMutationResultV1Schema,
  getConfirmedAppliedActionsV1,
  isFileMutationResultV1,
  type FileMutationResultV1,
} from '@codebuff/common/tools/results/filesystem'
import {
  clientToolCallSchema,
  clientToolNames,
} from '@codebuff/common/tools/list'
import { AgentOutputSchema } from '@codebuff/common/types/session-state'
import { advanceWorkspaceState } from '@codebuff/common/types/workspace-state'
import type { WorkspaceStateV1 } from '@codebuff/common/types/workspace-state'
import { extractApiErrorDetails } from '@codebuff/common/util/error'
import { listRunningBackgroundJobs } from '@codebuff/common/util/pending-background-jobs'
import { cloneDeep } from 'lodash'

import { getErrorStatusCode } from './error-utils'
import { getHarnessStateDir } from './credentials'
import { getAgentRuntimeImpl } from './impl/agent-runtime'
import { initialSessionState, applyOverridesToSessionState } from './run-state'
import { WorkspaceJournalService } from './services/workspace-journal'
import { WorkspaceMutationBroker } from './services/workspace-mutation-broker'
import { LocalHarnessStore } from './services/local-harness-store'
import {
  HarnessApprovalService,
  evaluateHarnessActionPolicy,
} from './services/harness-enforcement'
import { changeFile, changeFiles } from './tools/change-file'
import { applyPatchTool } from './tools/apply-patch'
import { codeSearch } from './tools/code-search'
import { findFilesMatchingContent } from './tools/find-files-matching-content'
import { glob } from './tools/glob'
import { listDirectory } from './tools/list-directory'
import {
  getFileForEditResult,
  getFiles,
  getFilesStructured,
  normalizeReadFilesOverrideResult,
} from './tools/read-files'
import { readImages } from './tools/read-image'
import {
  browserLogs,
  stopBrowserSessionsByOwner,
  type BrowserSessionOwner,
} from './tools/browser-logs'
import { replaceRange } from './tools/replace-range'
import { runTerminalCommand } from './tools/run-terminal-command'
import { checkJob } from './tools/check-job'
import { killJob } from './tools/kill-job'
import { readLogs } from './tools/read-logs'
import { gitStatus } from './tools/git-status'
import { inspectWorkspace } from './tools/inspect-workspace'
import { getTask } from './tools/get-task'
import { getChangeReviewBundle } from './tools/get-change-review-bundle'
import { runTargetedValidation } from './tools/run-targeted-validation'
import { inspectEnvironment } from './tools/inspect-environment'
import { getAffectedTests } from './tools/get-affected-tests'
import { getBuildTargets } from './tools/get-build-targets'
import {
  evaluateAuditCoverageTool,
  inspectCodebaseStructureTool,
  inspectFeatureCompletenessTool,
} from './tools/audit-intelligence'
import { gitBranch } from './tools/git-branch'
import { runFileChangeHooks } from './tools/file-change-hooks'
import { writeAuditFindings } from './tools/write-audit-findings'
import { createNodeFileSystem } from './tools/node-filesystem'
import {
  createToolExecutionDeadline,
  getDefaultToolExecutionTimeoutMs,
} from './tool-execution-deadline'
import type { FilesystemAuthorityPolicy } from './tools/filesystem-authority'

import type { CustomToolDefinition } from './custom-tool'
import type { RunState } from './run-state'
import type { FileFilter } from './tools/read-files'
import type {
  FileLineRange,
  LegacyReadFilesMap,
  RequestFilesResult,
} from '@codebuff/common/types/contracts/client'
import type { ServerAction } from '@codebuff/common/actions'
import type { AgentDefinition } from '@codebuff/common/templates/initial-agents-dir/types/agent-definition'
import type {
  PublishedToolName,
  ToolName,
} from '@codebuff/common/tools/constants'
import type { ClientToolName } from '@codebuff/common/tools/list'
import type { CodebuffToolCall } from '@codebuff/common/tools/list'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { CodebuffFileSystem } from '@codebuff/common/types/filesystem'
import type { ToolMessage } from '@codebuff/common/types/messages/codebuff-message'
import type {
  ImagePart,
  TextPart,
  ToolResultOutput,
} from '@codebuff/common/types/messages/content-part'
import type { PrintModeEvent } from '@codebuff/common/types/print-mode'
import type { SessionState } from '@codebuff/common/types/session-state'
import type { Source } from '@codebuff/common/types/source'
import type { CodebuffSpawn } from '@codebuff/common/types/spawn'

/**
 * Wraps content for user messages, ensuring text is wrapped in <user_message> tags.
 * Uses buildUserMessageContent from agent-runtime for consistency.
 */
const wrapContentForUserMessage = (
  content?: (TextPart | ImagePart)[],
): (TextPart | ImagePart)[] | undefined => {
  if (!content || content.length === 0) {
    return content
  }
  // Delegate to the shared utility which handles wrapping correctly
  return buildUserMessageContent(undefined, undefined, content)
}

export type OverrideExecutionContextV1 = {
  abiVersion: 'v1'
  signal: AbortSignal
}

export type OverrideDescriptor<TInput, TV0Output, TV1Output = TV0Output> =
  | ((input: TInput) => Promise<TV0Output>)
  | {
      version: 'v0'
      execute: (input: TInput) => Promise<TV0Output>
    }
  | {
      version: 'v1'
      execute: (
        input: TInput,
        context: OverrideExecutionContextV1,
      ) => Promise<TV1Output>
    }

type PublishedToolInput<T extends PublishedToolName> = Extract<
  CodebuffToolCall,
  { toolName: T }
>['input']

export type ClientToolOverrides = {
  [T in Exclude<PublishedToolName, 'read_files'>]?: OverrideDescriptor<
    PublishedToolInput<T>,
    ToolResultOutput[]
  >
} & {
  /** A function is the legacy v0 ABI. Descriptor form negotiates v0/v1. */
  read_files?: OverrideDescriptor<
    { filePaths: string[]; ranges?: FileLineRange[] },
    LegacyReadFilesMap,
    RequestFilesResult
  >
}

export type OpenbuffClientOptions = {
  apiKey?: string

  cwd?: string
  /** Optional directory path to load skills from. Skills found here will be available to the `skill` tool. */
  skillsDir?: string
  projectFiles?: Record<string, string>
  knowledgeFiles?: Record<string, string>
  agentDefinitions?: AgentDefinition[]
  maxAgentSteps?: number
  env?: Record<string, string>
  /** Harness control-plane state root. Defaults to the Openbuff config directory. */
  harnessStateDir?: string
  /** Pre-created, exact-scope approval receipt IDs available to this run.
   * Receipts are matched and consumed atomically only for the high-impact
   * action, workspace, root run, and current snapshot they authorize. */
  approvalReceiptIds?: string[]

  handleEvent?: (event: PrintModeEvent) => void | Promise<void>
  handleStreamChunk?: (
    chunk:
      | string
      | {
          type: 'subagent_chunk'
          agentId: string
          agentType: string
          chunk: string
        }
      | {
          type: 'reasoning_chunk'
          agentId: string
          ancestorRunIds: string[]
          chunk: string
        },
  ) => void | Promise<void>

  /** Optional filter to classify files before reading (runs before gitignore check) */
  fileFilter?: FileFilter

  /** Operation- and phase-aware policy composed after mandatory safeguards. */
  filesystemPolicy?: FilesystemAuthorityPolicy

  /** Result envelope used by the native read_files implementation. */
  filesystemResultFormat?: 'legacy-v0' | 'structured-v1'

  overrideTools?: ClientToolOverrides
  customToolDefinitions?: CustomToolDefinition[]

  /** Called after a file-mutating tool (write_file/str_replace/edit_transaction/
   *  apply_patch/replace_range) runs, so a host can invalidate caches such as
   *  the codebase index. Best-effort; never blocks the tool result. */
  onFilesChanged?: () => unknown | Promise<unknown>

  /** Awaited after a confirmed mutation so hosts can update indexes precisely. */
  onFilesystemMutation?: (
    event: FilesystemMutationEvent,
  ) => void | Promise<void>

  /** Host attestation hook for v1 mutation overrides. Without it, external
   * mutation results remain conservatively unconfirmed. */
  verifyExternalMutation?: (params: {
    toolName: string
    callId: string
    result: FileMutationResultV1
  }) => boolean | Promise<boolean>

  fsSource?: Source<CodebuffFileSystem>
  spawnSource?: Source<CodebuffSpawn>
  logger?: Logger

  /** Overall wall-clock timeout for a single run, in milliseconds. When set,
   *  the returned promise settles with an error RunState if the run has not
   *  completed within this duration, so a silent network drop can no longer
   *  hang the caller forever. Default: disabled (undefined). The timer is
   *  unref'd so it won't keep a host process alive on its own; it still fires
   *  while the event loop is busy with the active run. */
  runTimeoutMs?: number
}

export type FilesystemMutationEvent = {
  toolName: string
  callId: string
  operationId: string
  receiptId?: string
  workspaceRevision: number
  workspaceSnapshotId: string
  actions: Array<{
    action: 'create' | 'update' | 'delete' | 'move'
    path: string
    destinationPath?: string
    beforeHash: string | null
    afterHash: string | null
  }>
}

/** @deprecated Use `OpenbuffClientOptions` instead. Kept as a compatibility
 * alias so existing imports continue to resolve after the SDK rename. */
export type CodebuffClientOptions = OpenbuffClientOptions

export type ImageContent = {
  type: 'image'
  image: string // base64 encoded
  mediaType: string
}

export type TextContent = {
  type: 'text'
  text: string
}

export type MessageContent = TextContent | ImageContent

export type RunOptions = {
  agent: string | AgentDefinition
  prompt: string
  /** Content array for multimodal messages (text + images) */
  content?: MessageContent[]
  params?: Record<string, any>
  previousRun?: RunState
  extraToolResults?: ToolMessage[]
  signal?: AbortSignal
  costMode?: string
  /** Extra key/values merged into each LLM request's `codebuff_metadata`.
   *  Used by hosts (e.g. the CLI) to forward client-scoped identifiers or
   *  provider-routing metadata that downstream adapters read from the request body. */
  extraCodebuffMetadata?: Record<string, string>

  /** P2-3: Mid-turn checkpoint callback. When provided, the main agent loop
   *  invokes it with a snapshot of `mainAgentState` after each step boundary,
   *  time-throttled (30s), so a crashed/killed session can resume mid-turn from
   *  the last checkpoint rather than losing all in-flight work. The host (CLI)
   *  supplies a writer that persists atomically (temp file + rename). Failures
   *  inside the callback are caught and logged by the loop — they never kill
   *  the run. */
  onCheckpoint?: (agentState: SessionState['mainAgentState']) => void

  /** P2-3: When true, the user prompt is already present in
   *  `previousRun.sessionState.mainAgentState.messageHistory` (restored from a
   *  checkpoint), so the main agent loop must NOT re-append a USER_PROMPT
   *  message. The CLI sets this when it detects a valid checkpoint for the
   *  current turn and resumes from it. */
  resumeInterruptedTurn?: boolean
}

const createAbortError = (signal?: AbortSignal) => {
  if (signal?.reason instanceof Error) {
    return signal.reason
  }
  const error = new Error('Aborted')
  error.name = 'AbortError'
  return error
}

async function executeOverride<TInput, TV0Output, TV1Output>({
  override,
  input,
  signal,
}: {
  override: OverrideDescriptor<TInput, TV0Output, TV1Output>
  input: TInput
  signal: AbortSignal
}): Promise<TV0Output | TV1Output> {
  if (signal.aborted) {
    throw createAbortError(signal)
  }

  const execution: Promise<TV0Output | TV1Output> = (async () => {
    if (typeof override === 'function') {
      return override(input)
    }
    if (override.version === 'v1') {
      return override.execute(input, { abiVersion: 'v1', signal })
    }
    return override.execute(input)
  })()

  return raceAgainstAbort(execution, signal)
}

function raceAgainstAbort<T>(
  execution: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(createAbortError(signal))
  }

  // A legacy v0 override may ignore cancellation. Racing it lets the native
  // scheduler unwind while deliberately suppressing any late self-reported
  // result. The external side effect remains unconfirmed by contract.
  const abort = new Promise<never>((_, reject) => {
    const rejectOnAbort = () => reject(createAbortError(signal))
    if (signal.aborted) {
      rejectOnAbort()
      return
    }
    signal.addEventListener('abort', rejectOnAbort, { once: true })
    void execution.then(
      () => signal.removeEventListener('abort', rejectOnAbort),
      () => signal.removeEventListener('abort', rejectOnAbort),
    )
  })

  return Promise.race([execution, abort])
}

type RunExecutionOptions = RunOptions &
  OpenbuffClientOptions & {
    apiKey: string
    fingerprintId: string
  }
type RunReturnType = RunState

export async function run(options: RunExecutionOptions): Promise<RunState> {
  const { signal } = options

  if (signal?.aborted) {
    const abortError = createAbortError(signal)
    return {
      sessionState: options.previousRun?.sessionState,
      output: {
        type: 'error',
        message: abortError.message,
      },
    }
  }

  return runOnce(options)
}

async function runOnce({
  apiKey,
  fingerprintId,

  cwd,
  skillsDir,
  projectFiles,
  knowledgeFiles,
  agentDefinitions,
  maxAgentSteps = MAX_AGENT_STEPS_DEFAULT,
  env,
  harnessStateDir,
  approvalReceiptIds = [],
  runTimeoutMs,

  handleEvent,
  handleStreamChunk,

  fileFilter,
  filesystemPolicy,
  filesystemResultFormat = 'structured-v1',
  overrideTools,
  customToolDefinitions,
  onFilesChanged,
  onFilesystemMutation,
  verifyExternalMutation,

  fsSource,
  spawnSource,
  logger,

  agent,
  prompt,
  content,
  params,
  previousRun,
  extraToolResults,
  signal,
  costMode,
  extraCodebuffMetadata,
  onCheckpoint,
  resumeInterruptedTurn,
}: RunExecutionOptions): Promise<RunState> {
  const resolvedHarnessStateDir = harnessStateDir ?? getHarnessStateDir(env)
  let fs: CodebuffFileSystem
  if (fsSource !== undefined) {
    const fsSourceValue = typeof fsSource === 'function' ? fsSource() : fsSource
    fs = await fsSourceValue
  } else if (cwd) {
    try {
      const mutationBroker = await WorkspaceMutationBroker.create({
        cwd,
        stateDir: resolvedHarnessStateDir,
      })
      fs = createNodeFileSystem({ mutationBroker })
    } catch (error) {
      logger?.warn(
        { error },
        'Workspace mutation broker unavailable; guarded mutations will fail closed',
      )
      fs = createNodeFileSystem()
    }
  } else {
    fs = createNodeFileSystem()
  }
  let spawn: CodebuffSpawn
  if (spawnSource) {
    const spawnSourceValue = await spawnSource
    spawn = spawnSourceValue as CodebuffSpawn
  } else {
    spawn = require('child_process').spawn as CodebuffSpawn
  }
  const preparedContent = wrapContentForUserMessage(content)

  // Init session state
  let agentId
  if (typeof agent !== 'string') {
    const clonedDefs = agentDefinitions ? cloneDeep(agentDefinitions) : []
    agentDefinitions = [...clonedDefs, agent]
    agentId = agent.id
  } else {
    agentId = agent
  }
  let sessionState: SessionState
  if (previousRun?.sessionState) {
    // applyOverridesToSessionState handles deep cloning and applying any provided overrides
    sessionState = await applyOverridesToSessionState(
      cwd,
      previousRun.sessionState,
      {
        knowledgeFiles,
        agentDefinitions,
        customToolDefinitions,
        projectFiles,
        maxAgentSteps,
      },
      { fs, logger },
    )
  } else {
    // No previous run, so create a fresh session state
    sessionState = await initialSessionState({
      cwd,
      skillsDir,
      knowledgeFiles,
      agentDefinitions,
      customToolDefinitions,
      projectFiles,
      maxAgentSteps,
      fs,
      spawn,
      logger,
    })
  }
  let workspaceJournal = cwd
    ? await WorkspaceJournalService.create({
        rootDir: resolvedHarnessStateDir,
        cwd,
      }).catch(() => undefined)
    : undefined
  const approvalService = new HarnessApprovalService(
    new LocalHarnessStore(resolvedHarnessStateDir),
  )
  if (workspaceJournal) {
    try {
      const persistedWorkspace = workspaceJournal.read()
      const currentRevision =
        sessionState.mainAgentState.workspaceState?.revision ?? -1
      if (persistedWorkspace.revision > currentRevision) {
        sessionState.mainAgentState.workspaceState = persistedWorkspace
        sessionState.mainAgentState.readAuthorizationsByPath = {}
        sessionState.mainAgentState.readAuthorizationHashesByPath = {}
      }
    } catch (error) {
      logger?.warn(
        { error },
        'Workspace journal unavailable; continuing with in-memory workspace state',
      )
      workspaceJournal = undefined
    }
  }

  const timeoutAbortController = new AbortController()
  const timeoutEnabled = typeof runTimeoutMs === 'number' && runTimeoutMs > 0
  const runSignal = timeoutEnabled
    ? signal
      ? AbortSignal.any([signal, timeoutAbortController.signal])
      : timeoutAbortController.signal
    : (signal ?? timeoutAbortController.signal)
  let terminalRequested = false
  let callbacksEnabled = true
  let callbackQueue: Promise<void> = Promise.resolve()
  let callbackFailure: unknown
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined
  let resolveTerminal: (value: RunReturnType) => void = () => {}
  const terminalPromise = new Promise<RunReturnType>((res) => {
    resolveTerminal = (value) => {
      if (terminalRequested) return
      terminalRequested = true
      res(value)
    }
  })

  const abortRun = (reason: unknown) => {
    if (!timeoutAbortController.signal.aborted) {
      timeoutAbortController.abort(reason)
    }
  }
  const enqueueCallback = (callback: () => void | Promise<void>) => {
    const queued = callbackQueue.then(callback)
    callbackQueue = queued.catch((error) => {
      callbackFailure ??= error
      logger?.error({ error }, 'Openbuff client event callback failed')
    })
    return callbackQueue
  }
  async function onError(error: { message: string }) {
    if (callbacksEnabled && !runSignal.aborted && handleEvent) {
      await handleEvent({ type: 'error', message: error.message })
    }
  }

  // The agent runtime mutates sessionState.mainAgentState as it progresses,
  // replacing messageHistory with a new array once it adds the user prompt.
  // Comparing array identity detects progress more robustly than length:
  // context pruning could shrink history below its starting length without
  // meaning the runtime never ran.
  const initialMessageHistory = sessionState.mainAgentState.messageHistory

  /** Calculates the current session state if cancelled.
   *
   * This is used when callMainPrompt throws an error. If the agent runtime made
   * any progress (replaced the shared messageHistory), those messages are
   * preserved. Otherwise the user's message is added so it isn't lost.
   */
  function getCancelledSessionState(message: string): SessionState {
    const runtimeMadeProgress =
      sessionState.mainAgentState.messageHistory !== initialMessageHistory

    const state = structuredClone(sessionState)

    // Only add the user's message if the runtime didn't get a chance to add it.
    if (!runtimeMadeProgress && (prompt || preparedContent)) {
      state.mainAgentState.messageHistory.push({
        role: 'user' as const,
        content: buildUserMessageContent(prompt, params, preparedContent),
        tags: ['USER_PROMPT'] as string[],
      })
    }

    // Add error context message
    state.mainAgentState.messageHistory.push({
      role: 'user' as const,
      content: [{ type: 'text' as const, text: withSystemTags(message) }],
    })
    return state
  }
  function getCancelledRunState(message?: string): RunState {
    message = message ?? 'Run cancelled by user.'
    return {
      sessionState: getCancelledSessionState(message),
      output: {
        type: 'error',
        message,
      },
    }
  }

  const onResponseChunk = async (
    action: ServerAction<'response-chunk'>,
  ): Promise<void> => {
    if (!callbacksEnabled || runSignal.aborted) {
      return
    }
    const { chunk } = action

    if (typeof chunk !== 'string') {
      if (chunk.type === 'reasoning_delta') {
        handleStreamChunk?.({
          type: 'reasoning_chunk',
          chunk: chunk.text,
          agentId: chunk.runId,
          ancestorRunIds: chunk.ancestorRunIds,
        })
      } else {
        await handleEvent?.(chunk)
      }
      return
    }

    if (handleStreamChunk) {
      await handleStreamChunk(chunk)
    }
  }
  const onSubagentResponseChunk = async (
    action: ServerAction<'subagent-response-chunk'>,
  ) => {
    if (!callbacksEnabled || runSignal.aborted) {
      return
    }
    const { agentId, agentType, chunk } = action

    if (handleStreamChunk && chunk) {
      await handleStreamChunk({
        type: 'subagent_chunk',
        agentId,
        agentType,
        chunk,
      })
    }
  }

  const ownedLibrarianCloneDirs = new Set<string>()
  const agentRuntimeImpl = getAgentRuntimeImpl({
    logger,
    apiKey,
    handleStepsLogChunk: () => {
      // Does nothing for now
    },
    requestToolCall: async ({
      userInputId,
      callId,
      toolName,
      input,
      mcpConfig,
      signal: toolSignal,
    }) => {
      if (runSignal.aborted || terminalRequested) {
        throw createAbortError(runSignal)
      }
      if (toolName === 'run_terminal_command') {
        const command = (input as { command?: unknown }).command
        if (typeof command === 'string') {
          const cloneMatch = command.match(
            /^git clone --depth 1 'https:\/\/github\.com\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+(?:\.git)?\/?' '(\/tmp\/librarian-[A-Za-z0-9._-]+-[0-9]+)'$/,
          )
          if (cloneMatch?.[1]) ownedLibrarianCloneDirs.add(cloneMatch[1])
        }
      }
      const timeoutMs = getDefaultToolExecutionTimeoutMs(toolName)
      const deadline = createToolExecutionDeadline({
        parentSignal: toolSignal ?? runSignal,
        timeoutMs,
        toolName,
      })
      try {
        return await handleToolCall({
          action: {
            type: 'tool-call-request',
            requestId: callId ?? crypto.randomUUID(),
            userInputId,
            toolName,
            input,
            timeout: timeoutMs,
            mcpConfig,
          },
          overrides: overrideTools ?? {},
          onFilesChanged,
          onFilesystemMutation,
          verifyExternalMutation,
          customToolDefinitions: customToolDefinitions
            ? Object.fromEntries(
                customToolDefinitions.map((def) => [def.toolName, def]),
              )
            : {},
          cwd,
          fs,
          fileFilter,
          filesystemPolicy,
          env,
          harnessStateDir: resolvedHarnessStateDir,
          approvalReceiptIds,
          approvalService,
          harnessWorkspaceIdentity: workspaceJournal
            ? {
                repositoryId: workspaceJournal.repositoryId,
                workspaceId: workspaceJournal.workspaceId,
              }
            : undefined,
          getWorkspaceState: () => sessionState.mainAgentState.workspaceState,
          setWorkspaceState: (state) => {
            sessionState.mainAgentState.workspaceState = state
          },
          advanceWorkspaceJournal: workspaceJournal
            ? (change) =>
                (() => {
                  if (!workspaceJournal) {
                    return advanceWorkspaceState(
                      sessionState.mainAgentState.workspaceState,
                      change,
                    )
                  }
                  try {
                    return workspaceJournal.advance({
                      runId:
                        sessionState.mainAgentState.runId ??
                        sessionState.mainAgentState.agentId,
                      ...change,
                    })
                  } catch (error) {
                    logger?.warn(
                      { error },
                      'Workspace journal write failed; continuing with in-memory workspace state',
                    )
                    workspaceJournal = undefined
                    return advanceWorkspaceState(
                      sessionState.mainAgentState.workspaceState,
                      change,
                    )
                  }
                })()
            : undefined,
          signal: deadline.signal,
        })
      } finally {
        deadline.dispose()
      }
    },
    requestMcpToolData: async ({ mcpConfig, toolNames }) => {
      const mcpClientId = await getMCPClient(mcpConfig)
      const listToolsResult = await listMCPTools(mcpClientId)
      const tools = listToolsResult.tools
      const filteredTools: typeof tools = []
      for (const tool of tools) {
        if (!toolNames) {
          filteredTools.push(tool)
          continue
        }
        if (toolNames.includes(tool.name)) {
          filteredTools.push(tool)
          continue
        }
      }

      return filteredTools
    },
    requestFiles: ({ filePaths, ranges, capabilityIssuer }) => {
      if (runSignal.aborted || terminalRequested) {
        throw createAbortError(runSignal)
      }
      return readFiles({
        filePaths,
        ranges,
        override: overrideTools?.read_files,
        fileFilter,
        resultFormat: filesystemResultFormat,
        cwd,
        fs,
        signal: runSignal,
        capabilityIssuer,
      })
    },
    requestOptionalFile: async ({ filePath }) => {
      if (runSignal.aborted || terminalRequested) {
        throw createAbortError(runSignal)
      }
      // File-editing tools (str_replace / write_file / apply_patch) validate and
      // apply against this content, so it MUST be the full, untruncated file. The
      // regular read_files rendering truncates large files at 100k chars for the
      // model; using that here corrupts edit validation (e.g. a 4,499-line file
      // appears to have only ~2,889 lines, rejecting valid basedOnRead anchors).
      const override = overrideTools?.read_files
      if (override) {
        const raw = await executeOverride({
          override,
          input: { filePaths: [filePath] },
          signal: runSignal,
        })
        const item = normalizeReadFilesOverrideResult({
          filePaths: [filePath],
          raw,
        }).results[0]
        if (
          item?.selector === 'file' &&
          item.status === 'ok' &&
          item.complete &&
          typeof item.content === 'string'
        ) {
          return item.content
        }
        if (item?.status === 'error' && item.error.code === 'not_found') {
          return null
        }
        const code = item?.status === 'error' ? item.error.code : 'too_large'
        const message =
          item?.status === 'error'
            ? item.error.message
            : 'The file was not returned as a complete editable snapshot.'
        throw new Error(`read_files ${code}: ${message}`)
      }
      const read = await getFileForEditResult({
        filePath,
        cwd: requireCwd(cwd, 'read_files'),
        fs,
        fileFilter,
      })
      if (read.status === 'found') return read.content
      if (read.status === 'not_found') return null
      throw new Error(`read_files ${read.status}: ${read.error.message}`)
    },
    fileSystem: fs,
    fileFilter,
    sendAction: ({ action }) => {
      if (!callbacksEnabled || terminalRequested) {
        return
      }
      if (action.type === 'action-error') {
        return enqueueCallback(() => onError({ message: action.message }))
      }
      if (action.type === 'response-chunk') {
        return enqueueCallback(() => onResponseChunk(action))
      }
      if (action.type === 'subagent-response-chunk') {
        return enqueueCallback(() => onSubagentResponseChunk(action))
      }
      if (action.type === 'prompt-response') {
        handlePromptResponse({
          action,
          resolve: resolveTerminal,
          onError,
          initialSessionState: sessionState,
        })
        return
      }
      if (action.type === 'prompt-error') {
        handlePromptResponse({
          action,
          resolve: resolveTerminal,
          onError,
          initialSessionState: sessionState,
        })
        return
      }
      return undefined
    },
    sendSubagentChunk: ({
      userInputId,
      agentId,
      agentType,
      chunk,
      prompt,
      forwardToPrompt = true,
    }) => {
      if (!callbacksEnabled || terminalRequested) {
        return
      }
      onSubagentResponseChunk({
        type: 'subagent-response-chunk',
        userInputId,
        agentId,
        agentType,
        chunk,
        prompt,
        forwardToPrompt,
      })
    },
  })

  const promptId = Math.random().toString(36).substring(2, 15)

  if (timeoutEnabled) {
    timeoutHandle = setTimeout(() => {
      const message = `Run timed out after ${runTimeoutMs}ms`
      abortRun(new Error(message))
      resolveTerminal(getCancelledRunState(message))
    }, runTimeoutMs)
    timeoutHandle.unref?.()
  }

  // Send input
  const userInfo = await agentRuntimeImpl.getUserInfoFromApiKey({
    ...agentRuntimeImpl,
    apiKey,
    fields: ['id'],
  })
  if (!userInfo) {
    if (timeoutHandle) clearTimeout(timeoutHandle)
    return getCancelledRunState('Invalid API key or user not found')
  }

  const userId = userInfo.id

  if (runSignal.aborted) {
    resolveTerminal(getCancelledRunState(createAbortError(runSignal).message))
    const terminalState = await terminalPromise
    await callbackQueue
    callbacksEnabled = false
    if (timeoutHandle) clearTimeout(timeoutHandle)
    return terminalState
  }

  const promptExecution = callMainPrompt({
    ...agentRuntimeImpl,
    promptId,
    action: {
      type: 'prompt',
      promptId,
      prompt,
      promptParams: params,
      content: preparedContent,
      fingerprintId: fingerprintId,
      costMode: costMode ?? 'normal',
      sessionState,
      toolResults: extraToolResults ?? [],
      agentId,
    },
    repoUrl: undefined,
    repoId: undefined,
    clientSessionId: promptId,
    userId,
    extraCodebuffMetadata,
    signal: runSignal,
    onCheckpoint,
    resumeInterruptedTurn,
  })
    .then((result) => {
      resolveTerminal(result)
    })
    .catch((error) => {
      let errorMessage =
        error instanceof Error ? error.message : String(error ?? '')
      const apiErrorDetails = extractApiErrorDetails(error)
      const statusCode = apiErrorDetails.statusCode ?? getErrorStatusCode(error)
      const {
        countryBlockReason,
        countryCode,
        errorCode,
        ipPrivacySignals,
        message: parsedMessage,
      } = apiErrorDetails
      if (parsedMessage) {
        errorMessage = parsedMessage
      }

      resolveTerminal({
        sessionState: getCancelledSessionState(errorMessage),
        output: {
          type: 'error',
          message: errorMessage,
          ...(statusCode !== undefined && { statusCode }),
          ...(errorCode !== undefined && { error: errorCode }),
          ...(countryCode !== undefined && { countryCode }),
          ...(countryBlockReason !== undefined && { countryBlockReason }),
          ...(ipPrivacySignals !== undefined && { ipPrivacySignals }),
        },
      })
    })

  const terminalState = await terminalPromise
  // A timeout/cancel first aborts the shared signal; cooperative runtime and
  // tools then unwind. Legacy overrides are raced against that signal, so a
  // non-cooperative promise cannot hold the public run open or publish late
  // output. Normal completion also waits for callMainPrompt's cleanup.
  await promptExecution
  await callbackQueue
  callbacksEnabled = false
  if (timeoutHandle) clearTimeout(timeoutHandle)
  await stopBrowserSessionsByOwner({ clientSessionId: promptId })
  const cleanupLibrarianClone = (cloneDir: string) => {
    try {
      rmSync(cloneDir, { recursive: true, force: true })
    } catch {
      // Best-effort cleanup; the path is constrained to an owned /tmp prefix.
    }
  }
  for (const cloneDir of ownedLibrarianCloneDirs) {
    if (terminalState.output.type === 'error') {
      cleanupLibrarianClone(cloneDir)
      continue
    }
    // Keep successful clones alive long enough for the parent to inspect the
    // returned relevantFiles. Bound the lifetime to avoid permanent leaks.
    const cleanupTimer = setTimeout(
      () => cleanupLibrarianClone(cloneDir),
      30 * 60 * 1000,
    )
    cleanupTimer.unref?.()
  }
  if (callbackFailure) {
    logger?.warn(
      { error: callbackFailure },
      'Run completed after one or more client callbacks failed',
    )
  }
  return terminalState
}

function requireCwd(cwd: string | undefined, toolName: string): string {
  if (!cwd) {
    throw new Error(
      `cwd is required for the ${toolName} tool. Please provide cwd in OpenbuffClientOptions or override the ${toolName} tool.`,
    )
  }
  return cwd
}

async function readFiles({
  filePaths,
  ranges,
  override,
  fileFilter,
  resultFormat,
  cwd,
  fs,
  signal,
  capabilityIssuer,
}: {
  filePaths: string[]
  ranges?: FileLineRange[]
  override?: NonNullable<
    Required<OpenbuffClientOptions>['overrideTools']['read_files']
  >
  fileFilter?: FileFilter
  resultFormat: 'legacy-v0' | 'structured-v1'
  cwd?: string
  fs: CodebuffFileSystem
  signal: AbortSignal
  capabilityIssuer?: import('@codebuff/common/util/content-hash').ReadCapabilityIssuer
}) {
  if (override) {
    const output = await executeOverride({
      override,
      input: { filePaths, ranges },
      signal,
    })
    if (resultFormat === 'structured-v1') {
      return normalizeReadFilesOverrideResult({
        filePaths,
        ranges,
        raw: output,
      })
    }
    return output
  }
  const nativeRead =
    resultFormat === 'structured-v1' ? getFilesStructured : getFiles
  return nativeRead({
    filePaths,
    ranges,
    cwd: requireCwd(cwd, 'read_files'),
    fs,
    fileFilter,
    signal,
    capabilityIssuer,
  })
}

async function handleToolCall({
  action,
  overrides,
  customToolDefinitions,
  cwd,
  fs,
  fileFilter,
  filesystemPolicy,
  env,
  harnessStateDir,
  approvalReceiptIds,
  approvalService,
  harnessWorkspaceIdentity,
  getWorkspaceState,
  setWorkspaceState,
  advanceWorkspaceJournal,
  onFilesChanged,
  onFilesystemMutation,
  verifyExternalMutation,
  signal,
}: {
  action: ServerAction<'tool-call-request'>
  overrides: NonNullable<OpenbuffClientOptions['overrideTools']>
  customToolDefinitions: Record<string, CustomToolDefinition>
  cwd?: string
  fs: CodebuffFileSystem
  fileFilter?: FileFilter
  filesystemPolicy?: FilesystemAuthorityPolicy
  env?: Record<string, string>
  harnessStateDir: string
  approvalReceiptIds: string[]
  approvalService: HarnessApprovalService
  harnessWorkspaceIdentity?: {
    repositoryId: string
    workspaceId: string
  }
  getWorkspaceState: () => WorkspaceStateV1 | undefined
  setWorkspaceState: (state: WorkspaceStateV1) => void
  advanceWorkspaceJournal?: (params: {
    source: string
    operationId?: string
    receiptId?: string
    actions: FilesystemMutationEvent['actions']
  }) => WorkspaceStateV1
  onFilesChanged?: OpenbuffClientOptions['onFilesChanged']
  onFilesystemMutation?: OpenbuffClientOptions['onFilesystemMutation']
  verifyExternalMutation?: OpenbuffClientOptions['verifyExternalMutation']
  signal?: AbortSignal
}): Promise<{ output: ToolResultOutput[] }> {
  const toolName = action.toolName
  const input = action.input

  if (signal?.aborted) {
    throw createAbortError(signal)
  }

  // Handle MCP tool calls when mcpConfig is present
  if (action.mcpConfig) {
    try {
      const mcpClientId = await getMCPClient(action.mcpConfig)
      const result = await callMCPTool(
        mcpClientId,
        {
          name: toolName,
          arguments: input,
        },
        undefined,
        { signal },
      )
      return { output: result }
    } catch (error) {
      return {
        output: [
          {
            type: 'json',
            value: {
              errorMessage:
                error instanceof Error ? error.message : String(error),
            },
          },
        ],
      }
    }
  }

  let result: ToolResultOutput[]
  if (!toolNames.includes(toolName as ToolName)) {
    const customToolHandler = customToolDefinitions[toolName]

    if (!customToolHandler) {
      throw new Error(
        `Custom tool handler not found for user input ID ${action.userInputId}`,
      )
    }
    return {
      output: signal
        ? await raceAgainstAbort(
            customToolHandler.execute(action.input, { signal }),
            signal,
          )
        : await customToolHandler.execute(action.input, { signal }),
    }
  }

  try {
    let override =
      toolName === 'read_files'
        ? undefined
        : overrides[toolName as Exclude<PublishedToolName, 'read_files'>]
    if (
      !override &&
      (toolName === 'str_replace' || toolName === 'create_plan')
    ) {
      // Reuse the write_file override for single-file editing tools that send
      // FileChange-shaped payloads to the client.
      override = overrides['write_file']
    }

    const isClientTool = clientToolNames.includes(toolName as ClientToolName)
    if (!override && !isClientTool) {
      throw new Error(
        `Tool not implemented in SDK. Please provide an override or modify your agent to not use this tool: ${toolName}`,
      )
    }
    if (isClientTool) {
      clientToolCallSchema.parse(action)
    }

    if (override) {
      const overrideSignal = signal ?? new AbortController().signal
      result = (await executeOverride({
        override: override as OverrideDescriptor<
          typeof input,
          ToolResultOutput[]
        >,
        input,
        signal: overrideSignal,
      })) as ToolResultOutput[]
      if (
        toolName === 'write_file' ||
        toolName === 'str_replace' ||
        toolName === 'create_plan' ||
        toolName === 'edit_transaction' ||
        toolName === 'apply_patch' ||
        toolName === 'replace_range'
      ) {
        result = await Promise.all(
          result.map(async (part) => {
            if (part.type !== 'json') return part
            const parsed = fileMutationResultV1Schema.safeParse(part.value)
            if (!parsed.success) return part
            if (
              verifyExternalMutation &&
              (await verifyExternalMutation({
                toolName,
                callId: action.requestId,
                result: parsed.data,
              }))
            ) {
              return part
            }
            return {
              type: 'json' as const,
              value: fileMutationResultV1Schema.parse({
                ...parsed.data,
                outcome: 'unconfirmed',
                actions: parsed.data.actions.map((action) => ({
                  ...action,
                  outcome: 'unconfirmed',
                  beforeHash: null,
                  afterHash: null,
                  rollback: undefined,
                })),
                authorityTier: null,
                receiptId: undefined,
                errors: [
                  ...parsed.data.errors,
                  {
                    code: 'malformed_result',
                    message:
                      'External mutation overrides cannot self-certify filesystem application.',
                    retryable: false,
                  },
                ],
                freshCapabilities: [],
              }),
            }
          }),
        )
      }
    } else if (toolName === 'end_turn') {
      const runningJobs = listRunningBackgroundJobs()
      result = [
        {
          type: 'json',
          value:
            runningJobs.length === 0
              ? { message: 'Turn ended.' }
              : {
                  message: `Turn ended. ${runningJobs.length} background job(s) are still running. Use check_job/read_logs/kill_job to manage them.`,
                  pendingBackgroundJobs: runningJobs.slice(0, 5).map((job) => ({
                    jobId: job.jobId,
                    command: job.command,
                    startedAt: job.startedAt,
                  })),
                  ...(runningJobs.length > 5
                    ? { pendingBackgroundJobsTruncated: runningJobs.length - 5 }
                    : {}),
                },
        },
      ]
    } else if (toolName === 'write_audit_findings') {
      result = await writeAuditFindings({
        parameters: input,
        cwd: requireCwd(cwd, toolName),
        fs,
        signal,
        fileFilter,
        filesystemPolicy,
        callId: action.requestId,
      })
    } else if (
      toolName === 'write_file' ||
      toolName === 'str_replace' ||
      toolName === 'create_plan'
    ) {
      result = await changeFile({
        parameters: input,
        cwd: requireCwd(cwd, toolName),
        fs,
        signal,
        fileFilter,
        filesystemPolicy,
        callId: action.requestId,
      })
    } else if (toolName === 'edit_transaction') {
      result = await changeFiles({
        parameters: input,
        cwd: requireCwd(cwd, toolName),
        fs,
        signal,
        fileFilter,
        filesystemPolicy,
        callId: action.requestId,
      })
    } else if (toolName === 'apply_patch') {
      result = await applyPatchTool({
        parameters: input,
        cwd: requireCwd(cwd, toolName),
        fs,
        fileFilter,
        filesystemPolicy,
        callId: action.requestId,
        signal,
      })
    } else if (toolName === 'replace_range') {
      result = await replaceRange({
        parameters: input,
        cwd: requireCwd(cwd, toolName),
        fs,
        signal,
        fileFilter,
        filesystemPolicy,
        callId: action.requestId,
      })
    } else if (toolName === 'run_terminal_command') {
      const projectRoot = requireCwd(cwd, 'run_terminal_command')
      const terminalInput = input as Parameters<
        typeof runTerminalCommand
      >[0] & {
        approval_receipt_id?: string
      }
      result = await runTerminalCommand({
        ...terminalInput,
        cwd: path.resolve(projectRoot, terminalInput.cwd ?? '.'),
        projectRoot,
        env,
        signal,
        authorizeHighImpactAction: async (classified) => {
          let branch: string | undefined
          let defaultBranch: string | undefined
          if (classified.action === 'push') {
            const workspace = await inspectWorkspace({
              cwd: projectRoot,
              signal,
            })
            const value = workspace.find((part) => part.type === 'json')
              ?.value as { branch?: string; defaultBranch?: string } | undefined
            branch = classified.branch ?? value?.branch
            defaultBranch = value?.defaultBranch
          }
          const staticDecision = evaluateHarnessActionPolicy({
            ...classified,
            branch,
            defaultBranch,
            hasMatchingApproval: false,
          })
          if (!staticDecision.allowed && !staticDecision.approvalRequired) {
            return staticDecision
          }
          const candidateApprovalIds = [
            terminalInput.approval_receipt_id,
            ...approvalReceiptIds,
          ].filter(
            (value, index, values): value is string =>
              typeof value === 'string' &&
              value.length > 0 &&
              values.indexOf(value) === index,
          )
          const snapshotId = getWorkspaceState()?.snapshotId
          const rootRunId = terminalInput.owner?.rootRunId
          if (
            candidateApprovalIds.length === 0 ||
            !snapshotId ||
            !rootRunId ||
            !harnessWorkspaceIdentity
          ) {
            return staticDecision.allowed
              ? {
                  allowed: false as const,
                  approvalRequired: true,
                  reason: `Action '${classified.action}' requires a matching approval receipt bound to the current repository, workspace, root run, and snapshot.`,
                }
              : staticDecision
          }
          let lastError: unknown
          for (const approvalId of candidateApprovalIds) {
            try {
              const receipt = approvalService.consume({
                ...harnessWorkspaceIdentity,
                runId: rootRunId,
                approvalId,
                action: classified.action,
                target: classified.target,
                snapshotId,
              })
              const approvedDecision = evaluateHarnessActionPolicy({
                ...classified,
                branch,
                defaultBranch,
                hasMatchingApproval: true,
              })
              return approvedDecision.allowed
                ? { allowed: true, approvalReceiptId: receipt.id }
                : approvedDecision
            } catch (error) {
              lastError = error
            }
          }
          return {
            allowed: false,
            approvalRequired: true,
            reason:
              lastError instanceof Error
                ? lastError.message
                : 'Approval receipt validation failed.',
          }
        },
      })
    } else if (toolName === 'read_image') {
      result = await readImages({
        paths: (input as { paths: string[] }).paths,
        cwd: requireCwd(cwd, 'read_image'),
        fs,
        signal,
      })
    } else if (toolName === 'browser_logs') {
      const browserInput = input as Parameters<typeof browserLogs>[0] & {
        _browserOwner?: BrowserSessionOwner
      }
      const { _browserOwner, ...browserAction } = browserInput
      if (!_browserOwner) {
        throw new Error(
          'browser_logs requires runtime-owned client/run/agent session identity.',
        )
      }
      result = await browserLogs(
        browserAction as Parameters<typeof browserLogs>[0],
        _browserOwner,
      )
    } else if (toolName === 'code_search') {
      if (fs.hostProcessView === false) {
        throw new Error(
          'code_search is unsupported because this filesystem adapter declares a different host process view. Provide a tool override.',
        )
      }
      const codeSearchInput = input as Omit<
        Parameters<typeof codeSearch>[0],
        'projectPath'
      >
      result = await codeSearch({
        ...codeSearchInput,
        projectPath: requireCwd(cwd, 'code_search'),
        signal,
      })
    } else if (toolName === 'find_files_matching_content') {
      if (fs.hostProcessView === false) {
        throw new Error(
          'find_files_matching_content is unsupported because this filesystem adapter declares a different host process view. Provide a tool override.',
        )
      }
      const findFilesInput = input as Omit<
        Parameters<typeof findFilesMatchingContent>[0],
        'projectPath'
      >
      result = await findFilesMatchingContent({
        ...findFilesInput,
        projectPath: requireCwd(cwd, 'find_files_matching_content'),
        signal,
      })
    } else if (toolName === 'list_directory') {
      result = await listDirectory({
        directoryPath: (input as { path: string }).path,
        projectPath: requireCwd(cwd, 'list_directory'),
        fs,
      })
    } else if (toolName === 'glob') {
      result = await glob({
        pattern: (input as { pattern: string; cwd?: string }).pattern,
        projectPath: requireCwd(cwd, 'glob'),
        cwd: (input as { pattern: string; cwd?: string }).cwd,
        fs,
      })
    } else if (toolName === 'run_file_change_hooks') {
      if (fs.hostProcessView === false) {
        throw new Error(
          'run_file_change_hooks is unsupported because hook commands cannot see this filesystem adapter. Provide a tool override.',
        )
      }
      result = await runFileChangeHooks({
        files: (input as { files?: string[] }).files ?? [],
        cwd: requireCwd(cwd, 'run_file_change_hooks'),
        env,
        signal,
        fileSystem: fs,
      })
    } else if (toolName === 'check_job') {
      result = await checkJob(input as Parameters<typeof checkJob>[0])
    } else if (toolName === 'kill_job') {
      result = await killJob(input as Parameters<typeof killJob>[0])
    } else if (toolName === 'read_logs') {
      const readLogsInput = input as Omit<Parameters<typeof readLogs>[0], 'cwd'>
      result = await readLogs({
        ...readLogsInput,
        cwd: requireCwd(cwd, 'read_logs'),
      })
    } else if (toolName === 'git_status') {
      const gitStatusInput = input as Omit<
        Parameters<typeof gitStatus>[0],
        'cwd'
      >
      result = await gitStatus({
        ...gitStatusInput,
        cwd: requireCwd(cwd, 'git_status'),
        signal,
      })
    } else if (toolName === 'inspect_workspace') {
      result = await inspectWorkspace({
        cwd: requireCwd(cwd, 'inspect_workspace'),
        signal,
      })
    } else if (toolName === 'get_task') {
      result = getTask({
        cwd: requireCwd(cwd, 'get_task'),
        session: (input as { session?: string }).session,
      })
    } else if (toolName === 'get_change_review_bundle') {
      result = await getChangeReviewBundle({
        cwd: requireCwd(cwd, 'get_change_review_bundle'),
        max_chars: (input as { max_chars?: number }).max_chars,
        stateDir: harnessStateDir,
        workspaceState: getWorkspaceState(),
        signal,
      })
    } else if (toolName === 'run_targeted_validation') {
      const validationInput = input as {
        snapshot_id: string
        files: string[]
        artifact_kinds?: string[]
      }
      result = await runTargetedValidation({
        cwd: requireCwd(cwd, 'run_targeted_validation'),
        snapshotId: validationInput.snapshot_id,
        files: validationInput.files,
        artifactKinds: validationInput.artifact_kinds,
        env,
        signal,
        fileSystem: fs,
        workspaceState: getWorkspaceState(),
      })
    } else if (toolName === 'inspect_environment') {
      result = inspectEnvironment(requireCwd(cwd, 'inspect_environment'))
    } else if (toolName === 'get_affected_tests') {
      result = getAffectedTests(
        requireCwd(cwd, 'get_affected_tests'),
        (input as { files: string[] }).files,
      )
    } else if (toolName === 'get_build_targets') {
      result = getBuildTargets(
        requireCwd(cwd, 'get_build_targets'),
        (input as { files: string[] }).files,
      )
    } else if (toolName === 'inspect_codebase_structure') {
      result = inspectCodebaseStructureTool(
        requireCwd(cwd, toolName),
        (input as { scope?: string[] }).scope,
      )
    } else if (toolName === 'inspect_feature_completeness') {
      result = inspectFeatureCompletenessTool(
        requireCwd(cwd, toolName),
        input as { feature: string; snapshot_id: string; scope?: string[] },
      )
    } else if (toolName === 'evaluate_audit_coverage') {
      result = evaluateAuditCoverageTool(
        requireCwd(cwd, toolName),
        input as Parameters<typeof evaluateAuditCoverageTool>[1],
      )
    } else if (toolName === 'git_branch') {
      // The Zod schema (`common/src/tools/params/tool/git-branch.ts`) exposes
      // snake_case input: `{ branch_name, switch, allow_dirty }`. The SDK
      // `gitBranch()` function (`sdk/src/tools/git-branch.ts`) expects
      // camelCase: `{ branchName, switch, allowDirty }`. Map the keys
      // explicitly here — an unsafe `...gitBranchInput` spread would pass
      // `branch_name`/`allow_dirty` through verbatim, leaving `branchName`
      // as `undefined` (fails the name regex → every dispatch call errors).
      // `switch` is the same key in both shapes; it is forwarded as-is.
      const branchInput = input as {
        branch_name: string
        switch?: boolean
        allow_dirty?: boolean
      }
      const branchResult = await gitBranch({
        branchName: branchInput.branch_name,
        switch: branchInput.switch,
        allowDirty: branchInput.allow_dirty,
        cwd: requireCwd(cwd, 'git_branch'),
      })
      // gitBranch returns a single GitBranchResult object; the dispatcher
      // expects a ToolResultOutput[] (array of { type: 'json', value }).
      // Mirror the shape gitStatus returns by wrapping the value in a tuple.
      const { errorMessage, ...successValue } = branchResult
      result = [
        {
          type: 'json',
          value: errorMessage !== undefined ? { errorMessage } : successValue,
        },
      ]
    } else {
      throw new Error(
        `Tool not implemented in SDK. Please provide an override or modify your agent to not use this tool: ${toolName}`,
      )
    }
  } catch (error) {
    if (signal?.aborted) {
      throw createAbortError(signal)
    }
    result = [
      {
        type: 'json',
        value: {
          errorMessage:
            error &&
            typeof error === 'object' &&
            'message' in error &&
            typeof error.message === 'string'
              ? error.message
              : typeof error === 'string'
                ? error
                : 'Unknown error',
        },
      },
    ]
  }
  const mutation = result.find(
    (part) => part.type === 'json' && isFileMutationResultV1(part.value),
  )
  const mutationValue =
    mutation?.type === 'json' && isFileMutationResultV1(mutation.value)
      ? mutation.value
      : null
  const confirmedActions = mutationValue
    ? getConfirmedAppliedActionsV1(mutationValue)
    : []
  if (confirmedActions.length > 0) {
    const workspaceChange = {
      source: `sdk:${toolName}`,
      operationId: mutationValue!.operationId,
      ...(mutationValue!.receiptId
        ? { receiptId: mutationValue!.receiptId }
        : {}),
      actions: confirmedActions.map((confirmed) => ({
        action: confirmed.action,
        path: confirmed.path,
        ...(confirmed.destinationPath
          ? { destinationPath: confirmed.destinationPath }
          : {}),
        beforeHash: confirmed.beforeHash,
        afterHash: confirmed.afterHash,
      })),
    }
    const workspaceState = advanceWorkspaceJournal
      ? advanceWorkspaceJournal(workspaceChange)
      : advanceWorkspaceState(getWorkspaceState(), workspaceChange)
    setWorkspaceState(workspaceState)
    const enrichedMutation = fileMutationResultV1Schema.parse({
      ...mutationValue,
      workspaceRevision: workspaceState.revision,
      workspaceSnapshotId: workspaceState.snapshotId,
      ...(mutationValue!.authorityReceipt
        ? {
            authorityReceipt: {
              ...mutationValue!.authorityReceipt,
              workspaceRevision: workspaceState.revision,
              workspaceSnapshotId: workspaceState.snapshotId,
            },
          }
        : {}),
    })
    result = result.map((part) =>
      part.type === 'json' && part.value === mutationValue
        ? { type: 'json' as const, value: enrichedMutation }
        : part,
    )
    const event: FilesystemMutationEvent = {
      toolName,
      callId: action.requestId,
      operationId: mutationValue!.operationId,
      ...(mutationValue!.receiptId
        ? { receiptId: mutationValue!.receiptId }
        : {}),
      workspaceRevision: workspaceState.revision,
      workspaceSnapshotId: workspaceState.snapshotId,
      actions: confirmedActions.map((confirmed) => ({
        action: confirmed.action,
        path: confirmed.path,
        ...(confirmed.destinationPath
          ? { destinationPath: confirmed.destinationPath }
          : {}),
        beforeHash: confirmed.beforeHash,
        afterHash: confirmed.afterHash,
      })),
    }
    if (onFilesystemMutation) {
      try {
        await onFilesystemMutation(event)
      } catch (error) {
        console.warn('[openbuff] filesystem mutation observer failed', error)
        try {
          await onFilesChanged?.()
        } catch (fallbackError) {
          console.warn(
            '[openbuff] file-change fallback observer failed',
            fallbackError,
          )
        }
      }
    } else {
      try {
        await onFilesChanged?.()
      } catch (error) {
        console.warn('[openbuff] file-change observer failed', error)
      }
    }
  } else if (
    toolName === 'run_terminal_command' ||
    Boolean(customToolDefinitions[toolName]) ||
    Boolean(action.mcpConfig)
  ) {
    try {
      await onFilesChanged?.()
    } catch (error) {
      console.warn('[openbuff] unknown-mutation observer failed', error)
    }
  }
  return {
    output: result,
  }
}

/**
 * Extracts an HTTP status code from an error message string.
 * Parses common error patterns to identify the underlying status code.
 * Returns the status code if found, undefined otherwise.
 */
export const extractStatusCodeFromMessage = (
  errorMessage: string,
): number | undefined => {
  const lowerMessage = errorMessage.toLowerCase()

  // AI SDK's built-in retry error (e.g., "Failed after 4 attempts. Last error: Service Unavailable")
  // The AI SDK already retried 4 times, but we still want our SDK wrapper to retry 3 more times
  if (
    lowerMessage.includes('failed after') &&
    lowerMessage.includes('attempts')
  ) {
    // Extract the underlying error type from the message
    if (lowerMessage.includes('service unavailable')) {
      return 503
    }
    if (lowerMessage.includes('timeout')) {
      return 408
    }
    if (lowerMessage.includes('connection refused')) {
      return 503
    }
    // Default to 500 for other AI SDK retry failures
    return 500
  }

  if (
    errorMessage.includes('503') ||
    lowerMessage.includes('service unavailable')
  ) {
    return 503
  }
  if (errorMessage.includes('504')) {
    return 504
  }
  if (errorMessage.includes('502')) {
    return 502
  }
  if (lowerMessage.includes('timeout') || errorMessage.includes('408')) {
    return 408
  }
  if (
    lowerMessage.includes('econnrefused') ||
    lowerMessage.includes('connection refused')
  ) {
    return 503
  }
  if (lowerMessage.includes('dns') || lowerMessage.includes('enotfound')) {
    return 503
  }
  if (lowerMessage.includes('server error') || errorMessage.includes('500')) {
    return 500
  }
  if (errorMessage.includes('429') || lowerMessage.includes('rate limit')) {
    return 429
  }
  if (
    lowerMessage.includes('network error') ||
    lowerMessage.includes('fetch failed')
  ) {
    return 503
  }

  return undefined
}

async function handlePromptResponse({
  action,
  resolve,
  onError,
  initialSessionState,
}: {
  action: ServerAction<'prompt-response'> | ServerAction<'prompt-error'>
  resolve: (value: RunReturnType) => any
  onError: (error: { message: string }) => void
  initialSessionState: SessionState
}) {
  if (action.type === 'prompt-error') {
    onError({ message: action.message })

    const statusCode = extractStatusCodeFromMessage(action.message)
    resolve({
      sessionState: initialSessionState,
      output: {
        type: 'error',
        message: action.message,
        ...(statusCode !== undefined && { statusCode }),
      },
    })
  } else if (action.type === 'prompt-response') {
    // Stop enforcing session state schema! It's a black box we will pass back to the server.
    // Only check the output schema.
    const parsedOutput = AgentOutputSchema.safeParse(action.output)
    if (!parsedOutput.success) {
      const message = [
        'Received invalid prompt response from server:',
        JSON.stringify(parsedOutput.error.issues),
        'If this issues persists, please contact support@openbuff.dev',
      ].join('\n')
      onError({ message })
      resolve({
        sessionState: initialSessionState,
        output: {
          type: 'error',
          message,
        },
      })
      return
    }
    const { sessionState, output } = action

    const state: RunState = {
      sessionState,
      output: output ?? {
        type: 'error',
        message: 'No output from agent',
      },
    }
    resolve(state)
  } else {
    action satisfies never
    onError({
      message: 'Internal error: prompt response type not handled',
    })
    resolve({
      sessionState: initialSessionState,
      output: {
        type: 'error',
        message: 'Internal error: prompt response type not handled',
      },
    })
  }
}
