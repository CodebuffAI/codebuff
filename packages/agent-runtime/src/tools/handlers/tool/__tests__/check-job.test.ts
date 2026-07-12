import { describe, expect, test } from 'bun:test'

import { handleCheckJob } from '../check-job'

import type {
  ClientToolCall,
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'

describe('handleCheckJob', () => {
  test('forwards kill_on_timeout to the client tool call', async () => {
    const toolCall: CodebuffToolCall<'check_job'> = {
      toolName: 'check_job',
      toolCallId: 'tool-call-1',
      input: {
        jobId: 'job-123',
        wait_for: 'ready',
        timeout_seconds: 1,
        kill_on_timeout: false,
      },
    }
    let forwardedToolCall: ClientToolCall<'check_job'> | undefined

    const { output } = await handleCheckJob({
      previousToolCallFinished: Promise.resolve(),
      toolCall,
      requestClientToolCall: async (
        clientToolCall: ClientToolCall<'check_job'>,
      ) => {
        forwardedToolCall = clientToolCall
        return [
          {
            type: 'json',
            value: {
              jobId: clientToolCall.input.jobId,
              status: 'running',
              newOutput: '',
              matched: false,
              killed: false,
            },
          },
        ] satisfies CodebuffToolOutput<'check_job'>
      },
    } as unknown as Parameters<typeof handleCheckJob>[0])

    expect(forwardedToolCall).toEqual({
      toolName: 'check_job',
      toolCallId: 'tool-call-1',
      input: {
        jobId: 'job-123',
        wait_for: 'ready',
        timeout_seconds: 1,
        kill_on_timeout: false,
      },
    })
    expect(output[0].type).toBe('json')
  })
})
