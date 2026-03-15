import { z } from 'zod/v4'

import { FreebuffSession } from './freebuff-session'

import type { ZodType } from 'zod/v4'

interface FreebuffToolDefinition {
  toolName: string
  description: string
  inputSchema: ZodType
  endsAgentStep: boolean
  exampleInputs: Record<string, unknown>[]
  execute: (input: Record<string, unknown>) => Promise<ToolOutput>
}

type ToolOutput = { type: 'json'; value: Record<string, unknown> }[]

/**
 * Creates custom tool definitions that allow a Codebuff SDK agent
 * to interact with a Freebuff CLI binary via tmux.
 *
 * Returns the tools array and a cleanup function to call in afterEach.
 *
 * Usage:
 * ```ts
 * const { tools, cleanup } = createFreebuffTmuxTools(binaryPath)
 * // ... pass tools to client.run({ customToolDefinitions: tools })
 * // ... in afterEach: await cleanup()
 * ```
 */
export function createFreebuffTmuxTools(binaryPath: string): {
  tools: FreebuffToolDefinition[]
  cleanup: () => Promise<void>
} {
  let session: FreebuffSession | null = null

  const startTool: FreebuffToolDefinition = {
    toolName: 'start_freebuff',
    description:
      'Start the Freebuff CLI binary in a tmux terminal session. Call this first before interacting with Freebuff.',
    inputSchema: z.object({}),
    endsAgentStep: true,
    exampleInputs: [{}],
    execute: async (): Promise<ToolOutput> => {
      if (session) {
        return [
          {
            type: 'json',
            value: {
              error: 'Session already running',
              sessionName: session.name,
            },
          },
        ]
      }
      session = await FreebuffSession.start(binaryPath)
      await session.waitForReady()
      const initialOutput = await session.capture()
      return [
        {
          type: 'json',
          value: {
            started: true,
            sessionName: session.name,
            initialOutput,
          },
        },
      ]
    },
  }

  const sendInputTool: FreebuffToolDefinition = {
    toolName: 'send_to_freebuff',
    description:
      'Send text input to the running Freebuff CLI. The text is sent as if typed by the user and Enter is pressed.',
    inputSchema: z.object({
      text: z.string().describe('Text to send to Freebuff'),
    }),
    endsAgentStep: false,
    exampleInputs: [{ text: '/help' }],
    execute: async (input): Promise<ToolOutput> => {
      const text = (input as { text: string }).text
      if (!session) {
        return [
          {
            type: 'json',
            value: { error: 'No session running. Call start_freebuff first.' },
          },
        ]
      }
      await session.send(text)
      return [{ type: 'json', value: { sent: true, text } }]
    },
  }

  const captureOutputTool: FreebuffToolDefinition = {
    toolName: 'capture_freebuff_output',
    description:
      'Capture the current terminal output from the running Freebuff CLI session. ' +
      'Use waitSeconds to wait before capturing (useful after sending a command).',
    inputSchema: z.object({
      waitSeconds: z
        .number()
        .optional()
        .describe('Seconds to wait before capturing (default: 0)'),
    }),
    endsAgentStep: true,
    exampleInputs: [{ waitSeconds: 2 }],
    execute: async (input): Promise<ToolOutput> => {
      const waitSeconds = (input as { waitSeconds?: number }).waitSeconds
      if (!session) {
        return [
          {
            type: 'json',
            value: { error: 'No session running. Call start_freebuff first.' },
          },
        ]
      }
      const output = await session.capture(waitSeconds)
      return [{ type: 'json', value: { output } }]
    },
  }

  const stopTool: FreebuffToolDefinition = {
    toolName: 'stop_freebuff',
    description:
      'Stop the running Freebuff CLI session and clean up resources. Always call this when done testing.',
    inputSchema: z.object({}),
    endsAgentStep: true,
    exampleInputs: [{}],
    execute: async (): Promise<ToolOutput> => {
      if (!session) {
        return [
          { type: 'json', value: { stopped: true, wasRunning: false } },
        ]
      }
      await session.stop()
      session = null
      return [
        { type: 'json', value: { stopped: true, wasRunning: true } },
      ]
    },
  }

  const cleanup = async () => {
    if (session) {
      await session.stop()
      session = null
    }
  }

  return {
    tools: [startTool, sendInputTool, captureOutputTool, stopTool],
    cleanup,
  }
}
