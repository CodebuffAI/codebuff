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
import type { AgentDefinition } from '../../common/src/templates/initial-agents-dir/types/agent-definition'

type ClientToolName = 'write_file' | 'run_terminal_command'

export type CodebuffClientOptions = {
  // Provide an API key or set the CODEBUFF_API_KEY environment variable.
  apiKey?: string
  cwd: string
  onError: (error: { message: string }) => void
  overrideTools?: Partial<
    Record<
      ClientToolName,
      (
        args: ServerAction<'tool-call-request'>['args'],
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
  toolResults: ServerAction<'prompt-response'>['toolResults']
}

export class CodebuffClient {
  public cwd: string

  private readonly websocketHandler: WebSocketHandler
  private readonly overrideTools: NonNullable<
    CodebuffClientOptions['overrideTools']
  >
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
    this.overrideTools = overrideTools ?? {}
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
   * Run a Codebuff agent with the specified options.
   *
   * @param agent - The agent to run. Use 'base' for the default agent, or specify a custom agent ID if you made your own agent config.
   * @param prompt - The user prompt describing what you want the agent to do.
   * @param params - (Optional) Additional parameters for the agent. Most agents don't use this, but some custom agents can take a JSON object as input in addition to the user prompt string.
   * @param handleEvent - (Optional) Callback function that receives every event during execution (assistant messages, tool calls, etc.). This allows you to stream the agent's progress in real-time. We will likely add a token-by-token streaming callback in the future.
   * @param previousRun - (Optional) JSON state returned from a previous run() call. Use this to continue a conversation or session with the agent, maintaining context from previous interactions.
   * @param projectFiles - (Optional) All the files in your project as a plain JavaScript object. Keys should be the full path from your current directory to each file, and values should be the string contents of the file. Example: { "src/index.ts": "console.log('hi')" }. This helps Codebuff pick good source files for context.
   * @param knowledgeFiles - (Optional) Knowledge files to inject into every run() call. Uses the same schema as projectFiles - keys are file paths and values are file contents. These files are added directly to the agent's context.
   * @param agentDefinitions - (Optional) Array of custom agent definitions. Each object should satisfy the AgentDefinition type. You can input the agent's id field into the agent parameter to run that agent.
   * @param maxAgentSteps - (Optional) Maximum number of steps the agent can take before stopping. Use this as a safety measure in case your agent starts going off the rails. A reasonable number is around 20.
   *
   * @returns A Promise that resolves to a RunState JSON object which you can pass to a subsequent run() call to continue the run.
   */
  public async run({
    agent,
    prompt,
    params,
    handleEvent,
    previousRun,
    projectFiles,
    knowledgeFiles,
    agentDefinitions,
    maxAgentSteps,
  }: {
    agent: string
    prompt: string
    params?: Record<string, any>
    handleEvent?: (event: PrintModeEvent) => void
    previousRun?: RunState
    projectFiles?: Record<string, string>
    knowledgeFiles?: Record<string, string>
    agentDefinitions?: AgentDefinition[]
    maxAgentSteps?: number
  }): Promise<RunState> {
    await this.websocketHandler.connect()

    const promptId = Math.random().toString(36).substring(2, 15)
    const sessionState =
      previousRun?.sessionState ??
      initialSessionState(this.cwd, {
        knowledgeFiles,
        agentDefinitions,
        projectFiles,
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

  private async handlePromptResponse(action: ServerAction<'prompt-response'>) {
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

  private async handleToolCall(action: ServerAction<'tool-call-request'>) {
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
    // TODO: Parse projectFiles into fileTree, fileTokenScores, tokenCallers
    projectFiles?: Record<string, string>
    knowledgeFiles?: Record<string, string>
    agentDefinitions?: AgentDefinition[]
    maxAgentSteps?: number
  },
) {
  const { knowledgeFiles = {}, agentDefinitions = [] } = options

  // Process agentDefinitions array and convert handleSteps functions to strings
  const processedAgentTemplates: Record<string, any> = {}
  agentDefinitions.forEach((definition) => {
    const processedConfig = { ...definition } as Record<string, any>
    if (
      processedConfig.handleSteps &&
      typeof processedConfig.handleSteps === 'function'
    ) {
      processedConfig.handleSteps = processedConfig.handleSteps.toString()
    }
    if (processedConfig.id) {
      processedAgentTemplates[processedConfig.id] = processedConfig
    }
  })

  const initialState = getInitialSessionState({
    projectRoot: cwd,
    cwd,
    fileTree: [],
    fileTokenScores: {},
    tokenCallers: {},
    knowledgeFiles,
    userKnowledgeFiles: {},
    agentTemplates: processedAgentTemplates,
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
