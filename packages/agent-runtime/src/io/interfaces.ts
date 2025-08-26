import type { PrintModeEvent } from '@codebuff/common/types/print-mode'
import type { ToolName } from '@codebuff/common/tools/constants'

/**
 * IO abstraction for tool calls, file requests, and streaming
 * The backend implements this over WebSockets
 */
export interface IOEnvironment {
  /**
   * Request a tool call execution from the client
   */
  requestToolCall: (
    userInputId: string,
    toolName: string,
    input: Record<string, any>
  ) => Promise<{
    success: boolean
    output?: {
      type: 'text'
      value: string
    }
    error?: string
  }>

  /**
   * Request multiple files from the client
   */
  requestFiles: (paths: string[]) => Promise<Record<string, string | null>>

  /**
   * Request a single file from the client
   */
  requestFile: (path: string) => Promise<string | null>

  /**
   * Send a response chunk to the client (optional, can be passed as callback)
   */
  onResponseChunk?: (chunk: string | PrintModeEvent) => void
}

/**
 * Tool definitions and handlers environment
 */
export interface ToolsEnvironment {
  /**
   * Tool definitions for validation
   */
  definitions: Record<string, any>

  /**
   * Tool handlers for execution
   */
  handlers: Record<string, any>
}

/**
 * Input gate for managing user input cancellation and interruption
 */
export interface InputGateEnvironment {
  /**
   * Start tracking a user input session
   */
  start: (userId: string | undefined, userInputId: string) => void

  /**
   * Check if a user input is still live (not cancelled)
   */
  check: (
    userId: string | undefined,
    userInputId: string,
    clientSessionId: string
  ) => boolean

  /**
   * End tracking a user input session
   */
  end: (userId: string | undefined, userInputId: string) => void
}
