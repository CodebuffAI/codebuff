import { ClientAction } from '@codebuff/common/actions'
import { SessionState, ToolResult } from '@codebuff/common/types/session-state'
import { ServerWebSocket } from 'bun'
import { mainPrompt, MainPromptOptions } from './main-prompt'
import { ClientToolCall } from './tools'

const DEFAULT_MAX_ITERATIONS = 20

export async function loopMainPrompt(
  ws: ServerWebSocket<any>,
  action: Extract<ClientAction, { type: 'prompt' }>,
  options: MainPromptOptions & { maxIterations?: number }
): Promise<{
  sessionState: SessionState
  toolCalls: Array<ClientToolCall>
  toolResults: Array<ToolResult>
}> {
  const maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS
  let { sessionState, toolResults, toolCalls } = await mainPrompt(
    ws,
    action,
    options
  )
  let iterations = 0
  // Continue running as long as the agent is using tools and hasn't decided to end the turn.
  while (
    toolCalls.length > 0 &&
    !toolCalls.some((tc) => tc.toolName === 'end_turn')
  ) {
    const nextAction: Extract<ClientAction, { type: 'prompt' }> = {
      ...action,
      sessionState,
      toolResults,
      prompt: undefined,
    }
    const result = await mainPrompt(ws, nextAction, options)
    sessionState = result.sessionState
    toolResults = result.toolResults
    toolCalls = result.toolCalls
    iterations++
    if (iterations >= maxIterations) {
      break
    }
  }

  return { sessionState, toolCalls, toolResults }
}
