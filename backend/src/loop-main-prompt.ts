import { WebSocket } from 'ws'
import { AgentState, ToolResult } from 'common/types/agent-state'
import { ClientAction } from 'common/actions'
import { mainPrompt } from './main-prompt'
import { ClientToolCall } from './tools'

export async function loopMainPrompt(
  ws: WebSocket,
  action: Extract<ClientAction, { type: 'prompt' }>,
  userId: string | undefined,
  clientSessionId: string,
  onResponseChunk: (chunk: string) => void,
  selectedModel: string | undefined
): Promise<{
  agentState: AgentState
  toolCalls: Array<ClientToolCall>
  toolResults: Array<ToolResult>
}> {
  let { agentState, toolResults, toolCalls } = await mainPrompt(
    ws,
    action,
    userId,
    clientSessionId,
    onResponseChunk,
    selectedModel
  );

  // Keep running as long as the agent is using tools and hasn't decided to end the turn.
  while (toolCalls.length > 0 && !toolCalls.some(tc => tc.name === 'end_turn')) {
    const nextAction: Extract<ClientAction, { type: 'prompt' }> = {
        ...action,
        agentState,
        toolResults,
        prompt: '', // No new user prompt, we're in a loop
    };
    const result = await mainPrompt(
        ws,
        nextAction,
        userId,
        clientSessionId,
        onResponseChunk,
        selectedModel
    );
    agentState = result.agentState;
    toolResults = result.toolResults;
    toolCalls = result.toolCalls;
  }

  return { agentState, toolCalls, toolResults };
}
