import { describe, expect, test } from 'bun:test'

import { processBashContext } from '../bash-context-processor'

import type { PendingBashMessage } from '../../state/chat-store'

const createPendingBash = (
  overrides: Partial<PendingBashMessage> = {},
): PendingBashMessage => ({
  id: overrides.id ?? crypto.randomUUID(),
  command: overrides.command ?? 'echo "hi"',
  stdout: overrides.stdout ?? 'hi',
  stderr: overrides.stderr ?? '',
  exitCode: overrides.exitCode ?? 0,
  isRunning: overrides.isRunning ?? false,
  cwd: overrides.cwd ?? '/tmp',
  addedToHistory: overrides.addedToHistory,
})

describe('processBashContext', () => {
  test('builds bash messages and context', () => {
    const pending = [
      createPendingBash({ id: '1', command: 'echo hi' }),
      createPendingBash({
        id: '2',
        command: 'ls',
        addedToHistory: true,
      }),
    ]

    const { bashMessages, bashContextForPrompt } = processBashContext(pending)

    expect(bashMessages).toHaveLength(1)
    expect(bashMessages[0].blocks?.[0].type).toBe('tool')
    expect(bashContextForPrompt).toContain('Command: echo hi')
    expect(bashContextForPrompt).toContain('Command: ls')
  })
})
