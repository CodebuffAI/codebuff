import * as mainPromptModule from '@codebuff/agent-runtime/main-prompt'
import { assistantMessage, userMessage } from '@codebuff/common/util/messages'
import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test'

import { CodebuffClient } from '../client'
import * as databaseModule from '../impl/database'


describe('Prompt Caching', () => {
  afterEach(() => {
    mock.restore()
  })

  it(
    'should be cheaper on second request',
    async () => {
      spyOn(databaseModule, 'getUserInfoFromApiKey').mockResolvedValue({
        id: 'user-123',
      } as Awaited<ReturnType<typeof databaseModule.getUserInfoFromApiKey>>)

      spyOn(mainPromptModule, 'callMainPrompt').mockImplementation(
        async (params) => {
          const { sendAction, action: promptAction, promptId } = params
          const sessionState = promptAction.sessionState
          const hasHistory =
            sessionState.mainAgentState.messageHistory.length > 0
          const creditsUsed = hasHistory ? 10 : 100

          sessionState.mainAgentState.creditsUsed = creditsUsed
          sessionState.mainAgentState.directCreditsUsed = creditsUsed

          if (promptAction.prompt) {
            sessionState.mainAgentState.messageHistory.push(
              userMessage(promptAction.prompt),
              assistantMessage('hi'),
            )
          }

          await sendAction({
            action: {
              type: 'response-chunk',
              userInputId: promptId,
              chunk: {
                type: 'finish',
                totalCost: creditsUsed,
              },
            },
          })

          const output = {
            type: 'lastMessage' as const,
            value: sessionState.mainAgentState.messageHistory.slice(-1),
          }

          await sendAction({
            action: {
              type: 'prompt-response',
              promptId,
              sessionState,
              output,
            },
          })

          return {
            sessionState,
            output,
          }
        },
      )

      const filler =
        `Run UUID: ${crypto.randomUUID()} ` +
        'Ignore this text. This is just to make the prompt longer. '.repeat(500)
      const prompt = 'respond with "hi"'

      const client = new CodebuffClient({
        apiKey: 'test-api-key',
      })
      let cost1 = -1
      const run1 = await client.run({
        prompt: `${filler}\n\n${prompt}`,
        agent: 'base2',
        handleEvent: (event) => {
          if (event.type === 'finish') {
            cost1 = event.totalCost
          }
        },
      })

      console.dir(run1.output, { depth: null })
      expect(run1.output.type).not.toEqual('error')
      expect(cost1).toBeGreaterThanOrEqual(0)

      let cost2 = -1
      const run2 = await client.run({
        prompt,
        agent: 'base2',
        previousRun: run1,
        handleEvent: (event) => {
          if (event.type === 'finish') {
            cost2 = event.totalCost
          }
        },
      })

      console.dir(run2.output, { depth: null })
      expect(run2.output.type).not.toEqual('error')
      expect(cost2).toBeGreaterThanOrEqual(0)

      expect(cost1).toBeGreaterThan(cost2)
    },
    { timeout: 20_000 },
  )
})
