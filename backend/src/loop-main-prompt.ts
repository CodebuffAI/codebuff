import { ClientAction } from 'common/actions'
import { AgentState, ToolResult } from 'common/types/agent-state'
import { WebSocket } from 'ws'
import { mainPrompt, MainPromptOptions } from './main-prompt'
import { ClientToolCall } from './tools'

const DEFAULT_MAX_ITERATIONS = 20

export async function loopMainPrompt(
  ws: WebSocket,
  action: Extract<ClientAction, { type: 'prompt' }>,
  options: MainPromptOptions & { maxIterations?: number }
): Promise<{
  agentState: AgentState
  toolCalls: Array<ClientToolCall>
  toolResults: Array<ToolResult>
}> {
  const maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS
  let { agentState, toolResults, toolCalls } = await mainPrompt(
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
      agentState,
      toolResults,
      prompt: undefined,
    }
    const result = await mainPrompt(ws, nextAction, options)
    agentState = result.agentState
    toolResults = result.toolResults
    toolCalls = result.toolCalls
    iterations++
    if (iterations >= maxIterations) {
      break
    }
  }

  return { agentState, toolCalls, toolResults }
}
