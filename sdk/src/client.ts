import { execFileSync } from 'child_process'
import os from 'os'

import { CODEBUFF_BINARY } from './constants'
import { changeFile } from './tools/change-file'
import { getFiles } from './tools/read-files'
import { WebSocketHandler } from './websocket-client'
import {
  PromptResponseSchema,
  type ServerAction,
} from '../../common/src/actions'
import { API_KEY_ENV_VAR } from '../../common/src/constants'
import { getInitialSessionState } from '../../common/src/types/session-state'

import type { PrintModeEvent } from '../../common/src/types/print-mode'
import type { SessionState } from '../../common/src/types/session-state'

type ClientToolName = 'write_file' | 'run_terminal_command'

export type CodebuffClientOptions = {
  // Provide an API key or set the CODEBUFF_API_KEY environment variable.
  apiKey?: string
  cwd: string
  onError: (error: { message: string }) => void
  overrideTools: Partial<
    Record<
      ClientToolName,
      (
        args: Extract<ServerAction, { type: 'tool-call-request' }>['args'],
      ) => Promise<{ toolResultMessage: string }>
    > & {
      // Include read_files separately, since it has a different signature.
      read_files: (
        filePath: string[],
      ) => Promise<{ files: Record<string, string | null> }>
    }
  >
}

type RunState = {
  sessionState: SessionState
  toolResults: Extract<ServerAction, { type: 'prompt-response' }>['toolResults']
}

export class CodebuffClient {
  public cwd: string

  private readonly websocketHandler: WebSocketHandler
  private readonly overrideTools: CodebuffClientOptions['overrideTools']
  private readonly fingerprintId = `codebuff-sdk-${Math.random().toString(36).substring(2, 15)}`

  private readonly promptIdToHandleEvent: Record<
    string,
    (event: PrintModeEvent) => void
  > = {}
  private readonly promptIdToResolveResponse: Record<
    string,
    { resolve: (response: any) => void; reject: (error: any) => void }
  > = {}

  constructor({ apiKey, cwd, onError, overrideTools }: CodebuffClientOptions) {
    // TODO: download binary automatically
    const isWindows = process.platform === 'win32'
    if (
      execFileSync(isWindows ? 'where' : 'which', [CODEBUFF_BINARY])
        .toString()
        .trim() === ''
    ) {
      throw new Error(
        `Could not find ${CODEBUFF_BINARY} in PATH. Please run "npm i -g codebuff" to install codebuff.`,
      )
    }
    const foundApiKey = apiKey ?? process.env[API_KEY_ENV_VAR]
    if (!foundApiKey) {
      throw new Error(
        `Codebuff API key not found. Please provide an apiKey in the constructor of CodebuffClient or set the ${API_KEY_ENV_VAR} environment variable.`,
      )
    }

    this.cwd = cwd
    this.overrideTools = overrideTools
    this.websocketHandler = new WebSocketHandler({
      apiKey: foundApiKey,
      onWebsocketError: (error) => {
        onError({ message: error.message })
      },
      onWebsocketReconnect: () => {},
      onRequestReconnect: async () => {},
      onResponseError: async (error) => {
        onError({ message: error.message })
      },
      readFiles: this.readFiles.bind(this),
      handleToolCall: this.handleToolCall.bind(this),
      onCostResponse: async () => {},

      onResponseChunk: async (action) => {
        const { userInputId, chunk } = action
        const handleEvent = this.promptIdToHandleEvent[userInputId]
        if (handleEvent && typeof chunk === 'object') {
          handleEvent(chunk)
        }
      },
      onSubagentResponseChunk: async () => {},

      onPromptResponse: this.handlePromptResponse.bind(this),
    })
  }

  /**
   * Run an agent.
   *
   * Pass an agent id, a prompt, and an event handler, plus options.
   *
   * Returns the state of the run, which can be passed to a subsequent run to continue the run.
   *
   * @param agent - The agent to run, e.g. 'base' or 'codebuff/file-picker@0.0.1'
   * @param prompt - The user prompt, e.g. 'Add a console.log to the index file'
   * @param params - (Optional) The parameters to pass to the agent.
   *
   * @param handleEvent - (Optional) A function to handle events.
   * @param previousState - (Optional) Continue a previous run with the return value of a previous run.
   *
   * @param allFiles - (Optional) All the files in the project, in an object of file path to file content. Improves codebuff's ability to locate files.
   * @param knowledgeFiles - (Optional) The knowledge files to pass to the agent.
   * @param agentTemplates - (Optional) The agent templates to pass to the agent.
   * @param maxAgentSteps - (Optional) The maximum number of agent steps the main agent can run before stopping.
   */
  public async run({
    agent,
    prompt,
    params,
    handleEvent,
    previousRun,
    allFiles,
    knowledgeFiles,
    agentConfig,
    maxAgentSteps,
  }: {
    agent: string
    prompt: string
    params?: Record<string, any>
    handleEvent?: (event: PrintModeEvent) => void
    previousRun?: RunState
    allFiles?: Record<string, string>
    knowledgeFiles?: Record<string, string>
    agentConfig?: Record<string, any>
    maxAgentSteps?: number
  }): Promise<RunState> {
    await this.websocketHandler.connect()

    const promptId = Math.random().toString(36).substring(2, 15)
    const sessionState =
      previousRun?.sessionState ??
      initialSessionState(this.cwd, {
        knowledgeFiles,
        agentConfig,
        allFiles,
        maxAgentSteps,
      })
    const toolResults = previousRun?.toolResults ?? []
    if (handleEvent) {
      this.promptIdToHandleEvent[promptId] = handleEvent
    }
    this.websocketHandler.sendInput({
      promptId,
      prompt,
      promptParams: params,
      fingerprintId: this.fingerprintId,
      costMode: 'normal',
      sessionState,
      toolResults,
      agentId: agent,
    })

    return new Promise<RunState>((resolve, reject) => {
      this.promptIdToResolveResponse[promptId] = { resolve, reject }
    })
  }

  private async handlePromptResponse(
    action: Extract<ServerAction, { type: 'prompt-response' }>,
  ) {
    const promiseActions =
      this.promptIdToResolveResponse[action?.promptId ?? '']

    const parsedAction = PromptResponseSchema.safeParse(action)
    if (!parsedAction.success) {
      const message = [
        'Received invalid prompt response from server:',
        JSON.stringify(parsedAction.error.errors),
        'If this issues persists, please contact support@codebuff.com',
      ].join('\n')
      if (promiseActions) {
        promiseActions.reject(new Error(message))
      }
      return
    }

    if (promiseActions) {
      const { sessionState, toolResults } = parsedAction.data
      const state: RunState = {
        sessionState,
        toolResults,
      }
      promiseActions.resolve(state)

      delete this.promptIdToResolveResponse[action.promptId]
      delete this.promptIdToHandleEvent[action.promptId]
    }
  }

  private async readFiles(filePath: string[]) {
    const override = this.overrideTools.read_files
    if (override) {
      const overrideResult = await override(filePath)
      return overrideResult.files
    }
    return getFiles(filePath, this.cwd)
  }

  private async handleToolCall(
    action: Extract<ServerAction, { type: 'tool-call-request' }>,
  ) {
    const toolName = action.toolName
    const args = action.args
    let result: string
    try {
      let override = this.overrideTools[toolName as ClientToolName]
      if (!override && toolName === 'str_replace') {
        // Note: write_file and str_replace have the same implementation, so reuse their write_file override.
        override = this.overrideTools['write_file']
      }
      if (override) {
        const overrideResult = await override(args)
        result = overrideResult.toolResultMessage
      } else if (toolName === 'end_turn') {
        result = ''
      } else if (toolName === 'write_file' || toolName === 'str_replace') {
        const r = changeFile(args, this.cwd)
        result = r.toolResultMessage
      } else if (toolName === 'run_terminal_command') {
        throw new Error(
          'run_terminal_command not implemented in SDK yet; please provide an override.',
        )
      } else {
        throw new Error(
          `Tool not implemented in SDK. Please provide an override or modify your agent to not use this tool: ${toolName}`,
        )
      }
    } catch (error) {
      return {
        type: 'tool-call-response',
        requestId: action.requestId,
        success: false,
        result:
          error && typeof error === 'object' && 'message' in error
            ? error.message
            : typeof error === 'string'
              ? error
              : 'Unknown error',
      }
    }
    return {
      type: 'tool-call-response',
      requestId: action.requestId,
      success: true,
      result,
    }
  }
}

function initialSessionState(
  cwd: string,
  options: {
    // TODO: Parse allFiles into fileTree, fileTokenScores, tokenCallers
    allFiles?: Record<string, string>
    knowledgeFiles?: Record<string, string>
    agentConfig?: Record<string, any>
    maxAgentSteps?: number
  },
) {
  const { knowledgeFiles = {}, agentConfig = {} } = options

  const initialState = getInitialSessionState({
    projectRoot: cwd,
    cwd,
    fileTree: [],
    fileTokenScores: {},
    tokenCallers: {},
    knowledgeFiles,
    userKnowledgeFiles: {},
    agentTemplates: agentConfig,
    gitChanges: {
      status: '',
      diff: '',
      diffCached: '',
      lastCommitMessages: '',
    },
    changesSinceLastChat: {},
    shellConfigFiles: {},
    systemInfo: {
      platform: process.platform,
      shell: process.platform === 'win32' ? 'cmd.exe' : 'bash',
      nodeVersion: process.version,
      arch: process.arch,
      homedir: os.homedir(),
      cpus: os.cpus().length ?? 1,
    },
  })

  if (options.maxAgentSteps) {
    initialState.mainAgentState.stepsRemaining = options.maxAgentSteps
  }

  return initialState
}
