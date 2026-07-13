import { describe, expect, it } from 'bun:test'

import {
  createToolExecutionDeadline,
  FILE_MUTATION_TOOL_TIMEOUT_MS,
  getDefaultToolExecutionTimeoutMs,
} from '../tool-execution-deadline'

describe('tool execution deadlines', () => {
  it('bounds file mutations while leaving interactive and self-bounded tools alone', () => {
    expect(getDefaultToolExecutionTimeoutMs('edit_transaction')).toBe(
      FILE_MUTATION_TOOL_TIMEOUT_MS,
    )
    expect(getDefaultToolExecutionTimeoutMs('write_file')).toBe(
      FILE_MUTATION_TOOL_TIMEOUT_MS,
    )
    expect(getDefaultToolExecutionTimeoutMs('ask_user')).toBeUndefined()
    expect(getDefaultToolExecutionTimeoutMs('run_terminal_command')).toBeUndefined()
  })

  it('aborts a hung mutation with a non-run-cancellation timeout error', async () => {
    const parent = new AbortController()
    const deadline = createToolExecutionDeadline({
      parentSignal: parent.signal,
      timeoutMs: 5,
      toolName: 'edit_transaction',
    })

    try {
      await new Promise<void>((resolve) => {
        deadline.signal.addEventListener('abort', () => resolve(), {
          once: true,
        })
      })
      expect(deadline.signal.aborted).toBe(true)
      expect(deadline.signal.reason).toBeInstanceOf(Error)
      expect(deadline.signal.reason.name).toBe('ToolExecutionTimeoutError')
      expect(deadline.signal.reason.message).toContain(
        'no successful result is confirmed',
      )
    } finally {
      deadline.dispose()
    }
  })

  it('propagates parent cancellation without replacing its reason', () => {
    const parent = new AbortController()
    const reason = new Error('user cancelled')
    const deadline = createToolExecutionDeadline({
      parentSignal: parent.signal,
      timeoutMs: 1_000,
      toolName: 'edit_transaction',
    })

    try {
      parent.abort(reason)
      expect(deadline.signal.aborted).toBe(true)
      expect(deadline.signal.reason).toBe(reason)
    } finally {
      deadline.dispose()
    }
  })
})
