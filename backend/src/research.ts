import { SessionState } from 'common/types/session-state'
import { toContentString } from 'common/util/messages'
import { WebSocket } from 'ws'
import { loopMainPrompt } from './loop-main-prompt'

export async function research(
  ws: WebSocket,
  prompts: string[],
  initialSessionState: SessionState,
  options: {
    userId: string | undefined
    clientSessionId: string
    fingerprintId: string
    promptId: string
  }
): Promise<string[]> {
  const { userId, clientSessionId, fingerprintId, promptId } = options
  const maxIterations = 10
  const maxPrompts = 10
  const researchPromises = prompts.slice(0, maxPrompts).map((prompt) => {
    // Each research prompt runs in 'lite' mode and can only use read-only tools.
    const researchSessionState: SessionState = {
      ...{
        ...initialSessionState,
        mainAgentState: {
          ...initialSessionState.mainAgentState,
          stepsRemaining: maxIterations,
          messageHistory: [],
        },
      },
    }

    const action = {
      type: 'prompt' as const,
      prompt,
      sessionState: researchSessionState,
      costMode: 'lite' as const,
      toolResults: [],
      fingerprintId,
      promptId,
    }

    return loopMainPrompt(ws, action, {
      userId,
      clientSessionId,
      onResponseChunk: () => {
        /* We can ignore chunks for now */
      },
      selectedModel: undefined, // Use default model for lite mode
      readOnlyMode: true, // readOnlyMode = true
      maxIterations,
    })
  })

  const results = await Promise.all(researchPromises)
  // We'll return the final message from each research agent.
  return results.map((result) =>
    result.sessionState.mainAgentState.messageHistory
      .filter((m) => m.role === 'assistant')
      .map((m) => `Research agent: ${toContentString(m)}`)
      .join('\n\n')
  )
}
