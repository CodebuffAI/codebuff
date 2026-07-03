import path from 'path'

import { callMainPrompt } from '@codebuff/agent-runtime/main-prompt'
import {
  buildUserMessageContent,
  withSystemTags,
} from '@codebuff/agent-runtime/util/messages'
import { MAX_AGENT_STEPS_DEFAULT } from '@codebuff/common/constants/agents'
import { toOptionalFile } from '@codebuff/common/constants/paths'
import {
  getMCPClient,
  listMCPTools,
  callMCPTool,
} from '@codebuff/common/mcp/client'
import { toolNames } from '@codebuff/common/tools/constants'
import { clientToolCallSchema, clientToolNames } from '@codebuff/common/tools/list'
import { AgentOutputSchema } from '@codebuff/common/types/session-state'
import { extractApiErrorDetails } from '@codebuff/common/util/error'
import { listRunningBackgroundJobs } from '@codebuff/common/util/pending-background-jobs'
import { cloneDeep } from 'lodash'

import { getErrorStatusCode } from './error-utils'
import { getAgentRuntimeImpl } from './impl/agent-runtime'
import { initialSessionState, applyOverridesToSessionState } from './run-state'
import { changeFile, changeFiles } from './tools/change-file'
import { applyPatchTool } from './tools/apply-patch'
import { codeSearch } from './tools/code-search'
import { findFilesMatchingContent } from './tools/find-files-matching-content'
import { glob } from './tools/glob'
import { listDirectory } from './tools/list-directory'
import { getProjectPathLookupKeys } from './tools/path-utils'
import { getFileForEdit, getFiles } from './tools/read-files'
import { readImages } from './tools/read-image'
import { browserLogs } from './tools/browser-logs'
import { replaceRange } from './tools/replace-range'
import { runTerminalCommand } from './tools/run-terminal-command'
import { checkJob } from './tools/check-job'
import { killJob } from './tools/kill-job'
import { readLogs } from './tools/read-logs'
import { gitStatus } from './tools/git-status'
import { runFileChangeHooks } from './tools/file-change-hooks'

import type { CustomToolDefinition } from './custom-tool'
import type { RunState } from './run-state'
import type { FileFilter } from './tools/read-files'
import type { FileLineRange } from '@codebuff/common/types/contracts/client'
import type { ServerAction } from '@codebuff/common/actions'
import type { AgentDefinition } from '@codebuff/common/templates/initial-agents-dir/types/agent-definition'
import type { PublishedToolName, ToolName } from '@codebuff/common/tools/constants'
import type { ClientToolName } from '@codebuff/common/tools/list'
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

type ClientToolOverride = (input: never) => Promise<ToolResultOutput[]>

type ClientToolOverrides = Partial<Record<PublishedToolName, ClientToolOverride>> & {
  // Include read_files separately, since it has a different signature.
  read_files?: (input: {
    filePaths: string[]
    ranges?: FileLineRange[]
  }) => Promise<Record<string, string | null>>
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

  overrideTools?: ClientToolOverrides
  customToolDefinitions?: CustomToolDefinition[]

  /** Called after a file-mutating tool (write_file/str_replace/edit_transaction/
   *  apply_patch/replace_range) runs, so a host can invalidate caches such as
   *  the codebase index. Best-effort; never blocks the tool result. */
  onFilesChanged?: () => void

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
  runTimeoutMs,

  handleEvent,
  handleStreamChunk,

  fileFilter,
  overrideTools,
  customToolDefinitions,
  onFilesChanged,

  fsSource = () => require('fs').promises,
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
  const fsSourceValue = typeof fsSource === 'function' ? fsSource() : fsSource
  const fs = await fsSourceValue
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

  // `settled` + timeoutHandle ensure the promise can no longer hang forever:
  // the original promise captured a _reject that was never invoked, and
  // resolution only happened via prompt-response/prompt-error actions or the
  // callMainPrompt .catch — neither of which fires on a silent network drop.
  // The runTimeoutMs timer (armed below, before callMainPrompt) settles via
  // resolve() with an error RunState, following the codebase convention.
  // The `settled` guard prevents double-settle.
  let settled = false
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined
  let resolve: (value: RunReturnType) => any = () => {}
  // _reject is retained for the Promise constructor signature but never
  // invoked: this codebase resolves with an error RunState rather than
  // rejecting, so callers always receive a settled value.
  let _reject: (error: any) => any = () => {}
  const promise = new Promise<RunReturnType>((res, rej) => {
    resolve = (value) => {
      if (settled) return
      settled = true
      if (timeoutHandle) clearTimeout(timeoutHandle)
      res(value)
    }
    _reject = rej
  })

  async function onError(error: { message: string }) {
    if (handleEvent) {
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
    if (signal?.aborted) {
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
    if (signal?.aborted) {
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

  const agentRuntimeImpl = getAgentRuntimeImpl({
    logger,
    apiKey,
    handleStepsLogChunk: () => {
      // Does nothing for now
    },
    requestToolCall: async ({
      userInputId,
      toolName,
      input,
      mcpConfig,
      signal: toolSignal,
    }) => {
      return handleToolCall({
        action: {
          type: 'tool-call-request',
          requestId: crypto.randomUUID(),
          userInputId,
          toolName,
          input,
          timeout: undefined,
          mcpConfig,
        },
        overrides: overrideTools ?? {},
        onFilesChanged,
        customToolDefinitions: customToolDefinitions
          ? Object.fromEntries(
              customToolDefinitions.map((def) => [def.toolName, def]),
            )
          : {},
        cwd,
        fs,
        env,
        signal: toolSignal ?? signal,
      })
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
    requestFiles: ({ filePaths, ranges }) =>
      readFiles({
        filePaths,
        ranges,
        override: overrideTools?.read_files,
        fileFilter,
        cwd,
        fs,
      }),
    requestOptionalFile: async ({ filePath }) => {
      // File-editing tools (str_replace / write_file / apply_patch) validate and
      // apply against this content, so it MUST be the full, untruncated file. The
      // regular read_files rendering truncates large files at 100k chars for the
      // model; using that here corrupts edit validation (e.g. a 4,499-line file
      // appears to have only ~2,889 lines, rejecting valid basedOnRead anchors).
      const override = overrideTools?.read_files
      if (override) {
        const files = await override({ filePaths: [filePath] })
        const lookupKeys = cwd
          ? getProjectPathLookupKeys(cwd, filePath)
          : [filePath]
        const fileKey = lookupKeys.find((key) => key in files)
        return toOptionalFile(fileKey === undefined ? null : files[fileKey]!)
      }
      const content = await getFileForEdit({
        filePath,
        cwd: requireCwd(cwd, 'read_files'),
        fs,
        fileFilter,
      })
      return toOptionalFile(content)
    },
    sendAction: ({ action }) => {
      if (action.type === 'action-error') {
        onError({ message: action.message })
        return
      }
      if (action.type === 'response-chunk') {
        onResponseChunk(action)
        return
      }
      if (action.type === 'subagent-response-chunk') {
        onSubagentResponseChunk(action)
        return
      }
      if (action.type === 'prompt-response') {
        handlePromptResponse({
          action,
          resolve,
          onError,
          initialSessionState: sessionState,
        })
        return
      }
      if (action.type === 'prompt-error') {
        handlePromptResponse({
          action,
          resolve,
          onError,
          initialSessionState: sessionState,
        })
        return
      }
    },
    sendSubagentChunk: ({
      userInputId,
      agentId,
      agentType,
      chunk,
      prompt,
      forwardToPrompt = true,
    }) => {
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

  // Send input
  const userInfo = await agentRuntimeImpl.getUserInfoFromApiKey({
    ...agentRuntimeImpl,
    apiKey,
    fields: ['id'],
  })
  if (!userInfo) {
    return getCancelledRunState('Invalid API key or user not found')
  }

  const userId = userInfo.id

  if (signal?.aborted) {
    return getCancelledRunState('Run cancelled by user.')
  }

  // Arm the overall run timeout so the runOnce promise can no longer hang
  // forever on a silent network drop. The promise normally resolves via the
  // prompt-response/prompt-error actions or the callMainPrompt .catch, but
  // neither fires if the network silently drops mid-stream, leaving the
  // promise pending. This timeout settles it with an error RunState. Abort is
  // handled by the runtime itself (the signal is forwarded to callMainPrompt
  // below) which emits the proper interruption-message RunState, so we do NOT
  // add a competing abort listener here. The `settled` guard on the resolve
  // wrapper (see the Promise constructor) prevents double-settle.
  if (typeof runTimeoutMs === 'number' && runTimeoutMs > 0) {
    timeoutHandle = setTimeout(
      () =>
        resolve({
          sessionState: getCancelledSessionState(
            `Run timed out after ${runTimeoutMs}ms`,
          ),
          output: { type: 'error', message: `Run timed out after ${runTimeoutMs}ms` },
        }),
      runTimeoutMs,
    )
    // Don't let a pending timeout keep a host process alive on its own; it
    // still fires while the event loop is busy with the active run.
    timeoutHandle.unref?.()
  }

  callMainPrompt({
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
    signal: signal ?? new AbortController().signal,
    onCheckpoint,
    resumeInterruptedTurn,
  }).catch((error) => {
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

    resolve({
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

  return promise
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
  cwd,
  fs,
}: {
  filePaths: string[]
  ranges?: FileLineRange[]
  override?: NonNullable<
    Required<OpenbuffClientOptions>['overrideTools']['read_files']
  >
  fileFilter?: FileFilter
  cwd?: string
  fs: CodebuffFileSystem
}) {
  if (override) {
    return await override({ filePaths, ranges })
  }
  return getFiles({
    filePaths,
    ranges,
    cwd: requireCwd(cwd, 'read_files'),
    fs,
    fileFilter,
  })
}

async function handleToolCall({
  action,
  overrides,
  customToolDefinitions,
  cwd,
  fs,
  env,
  onFilesChanged,
  signal,
}: {
  action: ServerAction<'tool-call-request'>
  overrides: NonNullable<OpenbuffClientOptions['overrideTools']>
  customToolDefinitions: Record<string, CustomToolDefinition>
  cwd?: string
  fs: CodebuffFileSystem
  env?: Record<string, string>
  onFilesChanged?: () => void
  signal?: AbortSignal
}): Promise<{ output: ToolResultOutput[] }> {
  const toolName = action.toolName
  const input = action.input

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
      output: await customToolHandler.execute(action.input, { signal }),
    }
  }

  try {
    let override = overrides[toolName as PublishedToolName]
    if (
      !override &&
      (toolName === 'str_replace' ||
        toolName === 'apply_patch' ||
        toolName === 'create_plan')
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
      // Note: This type assertion is necessary because TypeScript cannot narrow
      // the union type of all possible tool inputs based on the dynamic toolName.
      result = await override(input as never)
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
    } else if (
      toolName === 'write_file' ||
      toolName === 'str_replace' ||
      toolName === 'create_plan'
    ) {
      result = await changeFile({
        parameters: input,
        cwd: requireCwd(cwd, toolName),
        fs,
      })
    } else if (toolName === 'edit_transaction') {
      result = await changeFiles({
        parameters: input,
        cwd: requireCwd(cwd, toolName),
        fs,
      })
    } else if (toolName === 'apply_patch') {
      result = await applyPatchTool({
        parameters: input,
        cwd: requireCwd(cwd, toolName),
        fs,
      })
    } else if (toolName === 'replace_range') {
      result = await replaceRange({
        parameters: input,
        cwd: requireCwd(cwd, toolName),
        fs,
      })
    } else if (toolName === 'run_terminal_command') {
      const projectRoot = requireCwd(cwd, 'run_terminal_command')
      const terminalInput = input as Parameters<typeof runTerminalCommand>[0]
      result = await runTerminalCommand({
        ...terminalInput,
        cwd: path.resolve(projectRoot, terminalInput.cwd ?? '.'),
        projectRoot,
        env,
        signal,
      })
    } else if (toolName === 'read_image') {
      result = await readImages({
        paths: (input as { paths: string[] }).paths,
        cwd: requireCwd(cwd, 'read_image'),
        fs,
      })
    } else if (toolName === 'browser_logs') {
      result = await browserLogs(input as Parameters<typeof browserLogs>[0])
    } else if (toolName === 'code_search') {
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
      result = await runFileChangeHooks({
        files: (input as { files?: string[] }).files ?? [],
        cwd: requireCwd(cwd, 'run_file_change_hooks'),
        env,
      })
    } else if (toolName === 'check_job') {
      result = await checkJob(input as Parameters<typeof checkJob>[0])
    } else if (toolName === 'kill_job') {
      result = await killJob(input as Parameters<typeof killJob>[0])
    } else if (toolName === 'read_logs') {
      const readLogsInput = input as Omit<
        Parameters<typeof readLogs>[0],
        'cwd'
      >
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
    } else {
      throw new Error(
        `Tool not implemented in SDK. Please provide an override or modify your agent to not use this tool: ${toolName}`,
      )
    }
  } catch (error) {
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
  if (
    onFilesChanged &&
    (toolName === 'write_file' ||
      toolName === 'str_replace' ||
      toolName === 'create_plan' ||
      toolName === 'edit_transaction' ||
      toolName === 'apply_patch' ||
      toolName === 'replace_range')
  ) {
    try {
      onFilesChanged()
    } catch {
      // Cache invalidation is best-effort; never fail a tool result over it.
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
