import { ClientAction } from 'common/actions'
import { SessionState } from 'common/types/session-state'
import { WebSocket } from 'ws'
import { mainPrompt, MainPromptOptions } from './main-prompt'
import { ClientToolCall } from './tools'

const DEFAULT_MAX_ITERATIONS = 20

export async function loopMainPrompt(
  ws: WebSocket,
  action: Extract<ClientAction, { type: 'prompt' }>,
  options: MainPromptOptions & { maxIterations?: number }
): Promise<{
  sessionState: SessionState
  toolCalls: Array<ClientToolCall>
}> {
  const maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS
  let { sessionState, toolCalls } = await mainPrompt(ws, action, options)
  let iterations = 0
  // Continue running as long as the agent is using tools and hasn't decided to end the turn.
  while (
    toolCalls.length > 0 &&
    !toolCalls.some((tc) => tc.toolName === 'end_turn')
  ) {
    const nextAction: Extract<ClientAction, { type: 'prompt' }> = {
      ...action,
      sessionState,
      toolResults: [],
      prompt: undefined,
    }
    const result = await mainPrompt(ws, nextAction, options)
    sessionState = result.sessionState
    toolCalls = result.toolCalls
    iterations++
    if (iterations >= maxIterations) {
      break
    }
  }

  return { sessionState, toolCalls }
}
