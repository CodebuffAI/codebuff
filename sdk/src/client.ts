import { execFileSync } from 'child_process'
import os from 'os'

import { CODEBUFF_BINARY } from './constants'
import { changeFile } from './tools/change-file'
import { WebSocketHandler } from './websocket-client'
import { API_KEY_ENV_VAR } from '../../common/src/constants'
import type { ServerAction } from '../../common/src/actions'
import { getInitialSessionState } from '../../common/src/types/session-state'
import { getFiles } from '../../npm-app/src/project-files'

export type ClientToolName =
  | 'read_files'
  | 'write_file'
  | 'str_replace'
  | 'run_terminal_command'

export type CodebuffClientOptions = {
  cwd: string
  onError: (error: { message: string }) => void
  overrideTools: Record<
    ClientToolName,
    (
      args: Extract<ServerAction, { type: 'tool-call-request' }>['args'],
    ) => Promise<{ toolResultMessage: string }>
  > & {
    readFiles: (
      filePath: string[],
    ) => Promise<{ files: Record<string, string | null> }>
  }
}

export class CodebuffClient {
  private readonly websocketHandler: WebSocketHandler
  private readonly overrideTools: CodebuffClientOptions['overrideTools']
  private readonly fingerprintId = `codebuff-sdk-${Math.random().toString(36).substring(2, 15)}`
  public cwd: string

  constructor({ cwd, onError, overrideTools }: CodebuffClientOptions) {
    // TODO: download binary automatically
    if (execFileSync('which', [CODEBUFF_BINARY]).toString().trim() === '') {
      throw new Error(
        `Could not find ${CODEBUFF_BINARY} in PATH. Please run "npm i -g codebuff" to install the codebuff.`,
      )
    }
    if (!process.env[API_KEY_ENV_VAR]) {
      throw new Error(
        `Codebuff API key not found. Please set the ${API_KEY_ENV_VAR} environment variable.`,
      )
    }
    const apiKey = process.env[API_KEY_ENV_VAR]

    this.cwd = cwd
    this.overrideTools = overrideTools
    this.websocketHandler = new WebSocketHandler({
      apiKey,
      onWebsocketError: () => {},
      onWebsocketReconnect: () => {},
      onRequestReconnect: async () => {},
      onResponseError: async (error) => {
        onError({ message: error.message })
      },
      readFiles: this.readFiles.bind(this),
      handleToolCall: this.handleToolCall.bind(this),
      onCostResponse: async () => {},
      onUsageResponse: async () => {},

      onResponseChunk: async () => {},
      onSubagentResponseChunk: async () => {},

      onPromptResponse: async () => {},
    })
  }

  public async runNewChat({
    agent,
    prompt,
    params,
    handleEvent,
    allFiles,
    knowledgeFiles,
    agentTemplates,
  }: {
    agent: string
    prompt: string
    params?: Record<string, any>
    handleEvent: (event: any) => void
    allFiles?: Record<string, string>
    knowledgeFiles?: Record<string, string>
    agentTemplates?: Record<string, any>
  }): Promise<{
    agentId: string
  }> {
    this.websocketHandler.sendInput({
      promptId: Math.random().toString(36).substring(2, 15),
      prompt,
      promptParams: params,
      fingerprintId: this.fingerprintId,
      costMode: 'normal',
      sessionState: initialSessionState(this.cwd, {
        knowledgeFiles,
        agentTemplates,
        allFiles,
      }),
      toolResults: [],
      agentId: agent,
    })

    return new Promise((resolve) => {})
  }

  private async readFiles(filePath: string[]) {
    const override = this.overrideTools.readFiles
    if (override) {
      const overrideResult = await override(filePath)
      return overrideResult.files
    }
    return getFiles(filePath)
  }

  private async handleToolCall(
    action: Extract<ServerAction, { type: 'tool-call-request' }>,
  ) {
    const toolName = action.toolName
    const args = action.args
    let result: string
    try {
      const override = this.overrideTools[toolName as ClientToolName]
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
          `Tool not implemented in sdk. Please provide an override or modify your agent to not use this tool: ${toolName}`,
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
    allFiles?: Record<string, string>
    knowledgeFiles?: Record<string, string>
    agentTemplates?: Record<string, any>
  },
) {
  const { knowledgeFiles = {}, agentTemplates = {} } = options

  return getInitialSessionState({
    projectRoot: cwd,
    cwd,
    fileTree: [],
    fileTokenScores: {},
    tokenCallers: {},
    knowledgeFiles,
    userKnowledgeFiles: {},
    agentTemplates,
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
      shell: 'bash',
      nodeVersion: process.version,
      arch: process.arch,
      homedir: os.homedir(),
      cpus: 16,
    },
  })
}
