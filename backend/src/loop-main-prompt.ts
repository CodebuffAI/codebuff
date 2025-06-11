import { WebSocket } from 'ws'
import { AgentState, ToolResult } from 'common/types/agent-state'
import { ClientAction } from 'common/actions'
import { mainPrompt, MainPromptOptions } from './main-prompt'
import { ClientToolCall } from './tools'

export async function loopMainPrompt(
  ws: WebSocket,
  action: Extract<ClientAction, { type: 'prompt' }>,
  options: MainPromptOptions
): Promise<{
  agentState: AgentState
  toolCalls: Array<ClientToolCall>
  toolResults: Array<ToolResult>
}> {
  let { agentState, toolResults, toolCalls } = await mainPrompt(ws, action, options)

  // Continue running as long as the agent is using tools and hasn't decided to end the turn.
  while (
    toolCalls.length > 0 &&
    !toolCalls.some((tc) => tc.name === 'end_turn')
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
  }

  return { agentState, toolCalls, toolResults }
}
