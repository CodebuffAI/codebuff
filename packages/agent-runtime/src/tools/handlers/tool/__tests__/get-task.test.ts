import { describe, expect, test } from 'bun:test'

import { handleGetTask } from '../get-task'

describe('handleGetTask', () => {
  test('proxies the requested plan session after prior work settles', async () => {
    const output = [
      {
        type: 'json' as const,
        value: {
          session: 'demo',
          sessionDir: '.agents/sessions/demo',
          state: null,
          preflight: null,
          artifacts: [],
        },
      },
    ] as const
    const result = await handleGetTask({
      previousToolCallFinished: Promise.resolve(),
      toolCall: {
        toolName: 'get_task',
        toolCallId: 'task-tool',
        input: { session: 'demo' },
      },
      requestClientToolCall: async (call: unknown) => {
        expect(call).toMatchObject({
          toolName: 'get_task',
          toolCallId: 'task-tool',
          input: { session: 'demo' },
        })
        return output as never
      },
    } as never)
    expect(result.output as unknown).toEqual(output)
  })
})
