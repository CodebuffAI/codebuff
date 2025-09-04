import {
  initialSessionState,
  applyOverridesToSessionState,
  type RunState,
} from './run-state'
import { changeFile } from './tools/change-file'
import { codeSearch } from './tools/code-search'
import { getFiles } from './tools/read-files'
import { runFileChangeHooks } from './tools/run-file-change-hooks'
import { runTerminalCommand } from './tools/run-terminal-command'
import { WebSocketHandler } from './websocket-client'
import {
  PromptResponseSchema,
  type ServerAction,
} from '../../common/src/actions'
import { MAX_AGENT_STEPS_DEFAULT } from '../../common/src/constants/agents'
import { API_KEY_ENV_VAR } from '../../common/src/old-constants'
import { toolNames } from '../../common/src/tools/constants'
import type { PublishedClientToolName } from '../../common/src/tools/list'
import {
  clientToolCallSchema,
  type ClientToolCall,
  type ClientToolName,
  type CodebuffToolOutput,
} from '../../common/src/tools/list'

import type { CustomToolDefinition } from './custom-tool'
import type { AgentDefinition } from '../../common/src/templates/initial-agents-dir/types/agent-definition'
import type {
  PublishedToolName,
  ToolName,
} from '../../common/src/tools/constants'
import type {
  ToolResultOutput,
  ToolResultPart,
} from '../../common/src/types/messages/content-part'
import type { PrintModeEvent } from '../../common/src/types/print-mode'
import type { SessionState } from '../../common/src/types/session-state'

export type CodebuffClientOptions = {
  // Provide an API key or set the CODEBUFF_API_KEY environment variable.
  apiKey?: string
  cwd?: string
  onError: (error: { message: string }) => void
  overrideTools?: Partial<
    {
      [K in ClientToolName & PublishedToolName]: (
        input: ClientToolCall<K>['input'],
      ) => Promise<CodebuffToolOutput<K>>
    } & {
      // Include read_files separately, since it has a different signature.
      read_files: (input: {
        filePaths: string[]
      }) => Promise<Record<string, string | null>>
    }
  >
}

export class CodebuffClient {
  public cwd: string

  private readonly websocketHandler: WebSocketHandler
  private readonly overrideTools: NonNullable<
    CodebuffClientOptions['overrideTools']
  >
  private readonly fingerprintId = `codebuff-sdk-${Math.random().toString(36).substring(2, 15)}`

  private readonly promptIdToHandlers: Record<
    string,
    {
      handleEvent?: (event: PrintModeEvent) => void
      handleStreamChunk?: (chunk: string) => void
      resolveResponse?: {
        resolve: (response: any) => void
        reject: (error: any) => void
      }
      customToolHandler?: WebSocketHandler['handleToolCall']
    }
  > = {}

  constructor({ apiKey, cwd, onError, overrideTools }: CodebuffClientOptions) {
    const foundApiKey = apiKey ?? process.env[API_KEY_ENV_VAR]
    if (!foundApiKey) {
      throw new Error(
        `Codebuff API key not found. Please provide an apiKey in the constructor of CodebuffClient or set the ${API_KEY_ENV_VAR} environment variable.`,
      )
    }

    this.cwd = cwd ?? process.cwd()
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
        if (typeof chunk === 'string') {
          const handleStreamChunk =
            this.promptIdToHandlers[userInputId]?.handleStreamChunk
          if (handleStreamChunk) {
            handleStreamChunk(chunk)
          }
        } else {
          const handleEvent = this.promptIdToHandlers[userInputId]?.handleEvent
          if (handleEvent) {
            handleEvent(chunk)
          }
        }
      },
      onSubagentResponseChunk: async () => {},

      onPromptResponse: this.handlePromptResponse.bind(this),
      onPromptError: this.handlePromptResponse.bind(this),
    })
  }

  public closeConnection() {
    this.websocketHandler.close()
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
   * @param customToolDefinitions - (Optional) Array of custom tool definitions that extend the agent's capabilities. Each tool definition includes a name, Zod schema for input validation, and a handler function. These tools can be called by the agent during execution.
   * @param maxAgentSteps - (Optional) Maximum number of steps the agent can take before stopping. Use this as a safety measure in case your agent starts going off the rails. A reasonable number is around 20.
   *
   * @returns A Promise that resolves to a RunState JSON object which you can pass to a subsequent run() call to continue the run. Use result.output to get the agent's output.
   */
  public async run<A extends string = string, B = any, C = any>({
    agent,
    prompt,
    params,
    handleEvent,
    handleStreamChunk,
    previousRun,
    projectFiles,
    knowledgeFiles,
    agentDefinitions,
    customToolDefinitions,
    maxAgentSteps = MAX_AGENT_STEPS_DEFAULT,
    extraToolResults,
  }: {
    agent: string
    prompt: string
    params?: Record<string, any>
    handleEvent?: (event: PrintModeEvent) => void
    handleStreamChunk?: (chunk: string) => void
    previousRun?: RunState
    projectFiles?: Record<string, string>
    knowledgeFiles?: Record<string, string>
    agentDefinitions?: AgentDefinition[]
    customToolDefinitions?: CustomToolDefinition<A, B, C>[]
    maxAgentSteps?: number
    extraToolResults?: ToolResultPart[]
  }): Promise<RunState> {
    await this.websocketHandler.connect()

    const promptId = Math.random().toString(36).substring(2, 15)

    let sessionState: SessionState
    if (previousRun?.sessionState) {
      // applyOverridesToSessionState handles deep cloning and applying any provided overrides
      sessionState = await applyOverridesToSessionState(
        this.cwd,
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
      sessionState = await initialSessionState(this.cwd, {
        knowledgeFiles,
        agentDefinitions,
        customToolDefinitions,
        projectFiles,
        maxAgentSteps,
      })
    }
    this.promptIdToHandlers[promptId] = {
      handleEvent,
      handleStreamChunk,
    }
    if (customToolDefinitions) {
      this.promptIdToHandlers[promptId].customToolHandler = async ({
        toolName,
        input,
      }) => {
        const toolDefs = customToolDefinitions.filter(
          (def) => def.toolName === toolName,
        )
        if (toolDefs.length === 0) {
          throw new Error(
            `Implementation for custom tool ${toolName} not found.`,
          )
        }
        const toolDef = toolDefs[toolDefs.length - 1]
        const handler = toolDef.handler
        try {
          return {
            output: toolDef.outputSchema.parse(
              await handler(toolDef.zodSchema.parse(input)),
            ),
          }
        } catch (error) {
          return {
            output: [
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
            ],
          }
        }
      }
    }
    this.websocketHandler.sendInput({
      promptId,
      prompt,
      promptParams: params,
      fingerprintId: this.fingerprintId,
      costMode: 'normal',
      sessionState,
      toolResults: extraToolResults ?? [],
      agentId: agent,
    })

    return new Promise<RunState>((resolve, reject) => {
      this.promptIdToHandlers[promptId].resolveResponse = { resolve, reject }
    })
  }

  private async handlePromptResponse(
    action: ServerAction<'prompt-response'> | ServerAction<'prompt-error'>,
  ) {
    const promptId =
      action.type === 'prompt-response' ? action.promptId : action.userInputId
    const promiseActions = this.promptIdToHandlers[promptId]?.resolveResponse
    if (!promiseActions) {
      return
    }

    delete this.promptIdToHandlers[promptId]

    if (action.type === 'prompt-error') {
      promiseActions.reject(new Error(action.message))
    } else if (action.type === 'prompt-response') {
      const parsedAction = PromptResponseSchema.safeParse(action)
      if (!parsedAction.success) {
        const message = [
          'Received invalid prompt response from server:',
          JSON.stringify(parsedAction.error.issues),
          'If this issues persists, please contact support@codebuff.com',
        ].join('\n')
        promiseActions.reject(new Error(message))
      } else {
        const { sessionState, output } = parsedAction.data
        const state: RunState = {
          sessionState,
          output: output ?? {
            type: 'error',
            message: 'No output from agent',
          },
        }
        promiseActions.resolve(state)
      }
    }
  }

  private async readFiles({ filePaths }: { filePaths: string[] }) {
    const override = this.overrideTools.read_files
    if (override) {
      return await override({ filePaths })
    }
    return getFiles(filePaths, this.cwd)
  }

  private async handleToolCall(
    action: ServerAction<'tool-call-request'>,
  ): ReturnType<WebSocketHandler['handleToolCall']> {
    clientToolCallSchema.parse(action)
    const toolName = action.toolName
    const input = action.input

    let result: ToolResultOutput[]
    if (!toolNames.includes(toolName as ToolName)) {
      const customToolHandler =
        this.promptIdToHandlers[action.userInputId].customToolHandler
      if (!customToolHandler) {
        throw new Error(
          `Custom tool handler not found for user input ID ${action.userInputId}`,
        )
      }
      return customToolHandler(action)
    }

    try {
      let override = this.overrideTools[toolName as PublishedClientToolName]
      if (!override && toolName === 'str_replace') {
        // Note: write_file and str_replace have the same implementation, so reuse their write_file override.
        override = this.overrideTools['write_file']
      }
      if (override) {
        result = await override(input as any)
      } else if (toolName === 'end_turn') {
        result = []
      } else if (toolName === 'write_file' || toolName === 'str_replace') {
        result = changeFile(input, this.cwd)
      } else if (toolName === 'run_terminal_command') {
        result = await runTerminalCommand({
          ...input,
          cwd: input.cwd ?? this.cwd,
        } as Parameters<typeof runTerminalCommand>[0])
      } else if (toolName === 'code_search') {
        result = await codeSearch({
          projectPath: this.cwd,
          ...input,
          cwd: input.cwd ?? this.cwd,
        } as Parameters<typeof codeSearch>[0])
      } else if (toolName === 'run_file_change_hooks') {
        // No-op: SDK doesn't run file change hooks
        result = [
          {
            type: 'json',
            value: {
              message: 'File change hooks are not supported in SDK mode',
            },
          },
        ]
      } else {
        throw new Error(
          `Tool not implemented in SDK. Please provide an override or modify your agent to not use this tool: ${toolName}`,
        )
      }
    } catch (error) {
      return {
        output: [
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
        ],
      }
    }
    return {
      output: result,
    }
  }
}
