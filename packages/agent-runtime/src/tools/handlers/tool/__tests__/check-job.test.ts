import { beforeEach, describe, expect, test } from 'bun:test'

import { handleCheckJob } from '../check-job'
import {
  __clearPendingBackgroundJobsForTest,
  upsertPendingBackgroundJob,
} from '@codebuff/common/util/pending-background-jobs'

import type {
  ClientToolCall,
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'

describe('handleCheckJob', () => {
  beforeEach(() => {
    __clearPendingBackgroundJobsForTest()
  })

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
    upsertPendingBackgroundJob({
      jobId: 'job-123',
      command: 'bun test',
      status: 'running',
      startedAt: Date.now(),
      owner: {
        clientSessionId: 'client-1',
        rootRunId: 'root-run',
        parentRunId: 'parent-run',
        parentAgentId: 'parent-agent',
      },
    })

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
      clientSessionId: 'client-1',
      agentState: {
        ancestorRunIds: ['root-run'],
        runId: 'parent-run',
        agentId: 'parent-agent',
      },
    } as Parameters<typeof handleCheckJob>[0])

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
