import { toOptionalFile } from '@codebuff/common/old-constants'
import { ensureEndsWithNewline } from '@codebuff/common/util/file'
import { generateCompactId } from '@codebuff/common/util/string'

import { subscribeToAction } from './websockets/websocket-action'

import type { ServerAction } from '@codebuff/common/actions'
import type {
  HandleStepsLogChunkFn,
  RequestFilesFn,
  RequestMcpToolDataFn,
  RequestOptionalFileFn,
  SendSubagentChunkFn,
} from '@codebuff/common/types/contracts/client'
import type { ParamsOf } from '@codebuff/common/types/function-params'
import type { MCPConfig } from '@codebuff/common/types/mcp'
import type { ToolResultOutput } from '@codebuff/common/types/messages/content-part'
import type { ServerMessage } from '@codebuff/common/websockets/websocket-schema'
import type { WebSocket } from 'ws'

function sendMessage(ws: WebSocket, server: ServerMessage) {
  ws.send(JSON.stringify(server))
}

/**
 * Sends an action to the client via WebSocket
 * @param ws - The WebSocket connection to send the action to
 * @param action - The server action to send
 */
export function sendActionWs(params: { ws: WebSocket; action: ServerAction }) {
  const { ws, action } = params

  sendMessage(ws, {
    type: 'action',
    data: action,
  })
}

/**
 * Requests a tool call execution from the client with timeout support
 * @param ws - The WebSocket connection
 * @param toolName - Name of the tool to execute
 * @param input - Arguments for the tool (can include timeout)
 * @returns Promise resolving to the tool execution result
 */
export async function requestToolCallWs(params: {
  ws: WebSocket
  userInputId: string
  toolName: string
  input: Record<string, any> & { timeout_seconds?: number }
  mcpConfig?: MCPConfig
}): Promise<{
  output: ToolResultOutput[]
}> {
  const { ws, userInputId, toolName, input, mcpConfig } = params

  return new Promise((resolve) => {
    const requestId = generateCompactId()
    const timeoutInSeconds =
      (input.timeout_seconds || 30) < 0
        ? undefined
        : input.timeout_seconds || 30

    // Set up timeout
    const timeoutHandle =
      timeoutInSeconds === undefined
        ? undefined
        : setTimeout(
            () => {
              unsubscribe()
              resolve({
                output: [
                  {
                    type: 'json',
                    value: {
                      errorMessage: `Tool call '${toolName}' timed out after ${timeoutInSeconds}s`,
                    },
                  },
                ],
              })
            },
            timeoutInSeconds * 1000 + 5000, // Convert to ms and add a small buffer
          )

    // Subscribe to response
    const unsubscribe = subscribeToAction('tool-call-response', (action) => {
      if (action.requestId === requestId) {
        clearTimeout(timeoutHandle)
        unsubscribe()
        resolve({
          output: action.output,
        })
      }
    })

    // Send the request
    sendActionWs({
      ws,
      action: {
        type: 'tool-call-request',
        requestId,
        userInputId,
        toolName,
        input,
        timeout:
          timeoutInSeconds === undefined ? undefined : timeoutInSeconds * 1000, // Send timeout in milliseconds
        mcpConfig,
      },
    })
  })
}

/**
 * Requests a tool call execution from the client with timeout support
 * @param ws - The WebSocket connection
 * @param mcpConfig - The configuration for the MCP server
 * @param input - Arguments for the tool (can include timeout)
 * @returns Promise resolving to the tool execution result
 */
export async function requestMcpToolDataWs(
  params: ParamsOf<RequestMcpToolDataFn> & {
    ws: WebSocket
  },
): ReturnType<RequestMcpToolDataFn> {
  const { ws, mcpConfig, toolNames } = params

  return new Promise((resolve) => {
    const requestId = generateCompactId()

    // Set up timeout
    const timeoutHandle = setTimeout(
      () => {
        unsubscribe()
        resolve([])
      },
      45_000 + 5000, // Convert to ms and add a small buffer
    )

    // Subscribe to response
    const unsubscribe = subscribeToAction('mcp-tool-data', (action) => {
      if (action.requestId === requestId) {
        clearTimeout(timeoutHandle)
        unsubscribe()
        resolve(action.tools)
      }
    })

    // Send the request
    sendActionWs({
      ws,
      action: {
        type: 'request-mcp-tool-data',
        mcpConfig,
        requestId,
        ...(toolNames && { toolNames }),
      },
    })
  })
}

/**
 * Requests multiple files from the client
 * @param ws - The WebSocket connection
 * @param filePaths - Array of file paths to request
 * @returns Promise resolving to an object mapping file paths to their contents
 */
export async function requestFilesWs(
  params: {
    ws: WebSocket
  } & ParamsOf<RequestFilesFn>,
): ReturnType<RequestFilesFn> {
  const { ws, filePaths } = params
  return new Promise<Record<string, string | null>>((resolve) => {
    const requestId = generateCompactId()
    const unsubscribe = subscribeToAction('read-files-response', (action) => {
      for (const [filename, contents] of Object.entries(action.files)) {
        action.files[filename] = ensureEndsWithNewline(contents)
      }
      if (action.requestId === requestId) {
        unsubscribe()
        resolve(action.files)
      }
    })
    sendActionWs({
      ws,
      action: {
        type: 'read-files',
        filePaths,
        requestId,
      },
    })
  })
}

export async function requestOptionalFileWs(
  params: {
    ws: WebSocket
  } & ParamsOf<RequestOptionalFileFn>,
): ReturnType<RequestOptionalFileFn> {
  const { ws, filePath } = params
  const files = await requestFilesWs({ ws, filePaths: [filePath] })
  return toOptionalFile(files[filePath] ?? null)
}

export function sendSubagentChunkWs(
  params: {
    ws: WebSocket
  } & ParamsOf<SendSubagentChunkFn>,
): ReturnType<SendSubagentChunkFn> {
  const {
    ws,
    userInputId,
    agentId,
    agentType,
    chunk,
    prompt,
    forwardToPrompt = true,
  } = params
  return sendActionWs({
    ws,
    action: {
      type: 'subagent-response-chunk',
      userInputId,
      agentId,
      agentType,
      chunk,
      prompt,
      forwardToPrompt,
    },
  })
}

export function handleStepsLogChunkWs(
  params: {
    ws: WebSocket
  } & ParamsOf<HandleStepsLogChunkFn>,
): ReturnType<HandleStepsLogChunkFn> {
  const { ws, userInputId, runId, level, data, message } = params
  return sendActionWs({
    ws,
    action: {
      type: 'handlesteps-log-chunk',
      userInputId,
      agentId: runId,
      level,
      data,
      message,
    },
  })
}
