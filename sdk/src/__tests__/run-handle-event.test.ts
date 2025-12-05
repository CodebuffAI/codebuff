import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test'

import { getInitialSessionState } from '@codebuff/common/types/session-state'
import { getStubProjectFileContext } from '@codebuff/common/util/file'
import type { PrintModeEvent } from '@codebuff/common/types/print-mode'
import type { CodebuffClientOptions } from '../run'

describe('CodebuffClient handleEvent / handleStreamChunk', () => {
  afterEach(() => {
    mock.restore()
  })

  it('streams subagent start/finish once and forwards subagent chunks to handleStreamChunk', async () => {
    const databaseModule = await import('../impl/database')
    const mainPromptModule = await import('@codebuff/agent-runtime/main-prompt')

    spyOn(databaseModule, 'getUserInfoFromApiKey').mockResolvedValue({
      id: 'user-123',
    })
    spyOn(databaseModule, 'fetchAgentFromDatabase').mockResolvedValue(null)
    spyOn(databaseModule, 'startAgentRun').mockResolvedValue({ runId: 'run-1' })
    spyOn(databaseModule, 'finishAgentRun').mockResolvedValue()
    spyOn(databaseModule, 'addAgentStep').mockResolvedValue()

    spyOn(mainPromptModule, 'callMainPrompt').mockImplementation(
      async (
        params: Parameters<typeof mainPromptModule.callMainPrompt>[0],
      ) => {
        const { sendAction, action: promptAction } = params
        const sessionState = getInitialSessionState(
          getStubProjectFileContext(),
        )

        await sendAction({
          action: {
            type: 'response-chunk',
            chunk: {
              type: 'subagent_start',
              agentId: 'sub-1',
              agentType: 'commander',
              displayName: 'Commander',
              onlyChild: true,
              parentAgentId: 'main-agent',
              prompt: promptAction.prompt,
              params: promptAction.promptParams,
            },
          },
        })

        await sendAction({
          action: {
            type: 'subagent-response-chunk',
            userInputId: 'input-1',
            agentId: 'sub-1',
            agentType: 'commander',
            chunk: 'hello from subagent',
          },
        })

        await sendAction({
          action: {
            type: 'response-chunk',
            chunk: {
              type: 'subagent_finish',
              agentId: 'sub-1',
              agentType: 'commander',
              displayName: 'Commander',
              onlyChild: true,
              parentAgentId: 'main-agent',
              prompt: promptAction.prompt,
              params: promptAction.promptParams,
            },
          },
        })

        await sendAction({
          action: {
            type: 'prompt-response',
            sessionState,
            output: {
              type: 'lastMessage',
              value: [],
            },
          },
        })
      },
    )

    type StreamChunk = Parameters<
      NonNullable<CodebuffClientOptions['handleStreamChunk']>
    >[0]

    const events: PrintModeEvent[] = []
    const streamChunks: StreamChunk[] = []

    const { CodebuffClient } = await import('../client')

    const client = new CodebuffClient({
      apiKey: 'test-key',
    })

    const result = await client.run({
      agent: 'base',
      prompt: 'hello world',
      handleEvent: (event) => {
        events.push(event)
      },
      handleStreamChunk: (chunk) => {
        streamChunks.push(chunk)
      },
    })

    expect(
      events.filter((e) => e.type === 'subagent_start').map((e) => e.agentId),
    ).toEqual(['sub-1'])
    expect(
      events.filter((e) => e.type === 'subagent_finish').map((e) => e.agentId),
    ).toEqual(['sub-1'])

    expect(streamChunks).toEqual([
      {
        type: 'subagent_chunk',
        agentId: 'sub-1',
        agentType: 'commander',
        chunk: 'hello from subagent',
      },
    ])

    expect(result.output.type).toBe('lastMessage')
  })
})
