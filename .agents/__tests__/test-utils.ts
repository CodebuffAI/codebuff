import type { Message, ToolMessage } from '../types/util-types'

export const createMessage = (
  role: 'user' | 'assistant',
  content: string,
): Message => ({
  role,
  content,
})

export const createTerminalToolMessage = (
  command: string,
  output: string,
  exitCode?: number,
): ToolMessage => ({
  role: 'tool',
  toolCallId: 'test-id',
  toolName: 'run_terminal_command',
  content: [
    {
      type: 'json',
      value: {
        command,
        stdout: output,
        ...(exitCode !== undefined && { exitCode }),
      },
    },
  ],
})

export const createLargeToolMessage = (
  toolName: string,
  largeData: string,
): ToolMessage => ({
  role: 'tool',
  toolCallId: 'test-id',
  toolName,
  content: [
    {
      type: 'json',
      value: {
        data: largeData,
      },
    },
  ],
})

export const createToolMessage = (
  toolName: string,
  size: number,
): ToolMessage => ({
  role: 'tool',
  toolCallId: 'test-id',
  toolName,
  content: [
    {
      type: 'json',
      value: {
        data: 'a'.repeat(size),
      },
    },
  ],
})

export const createMockLogger = () => ({
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
})
