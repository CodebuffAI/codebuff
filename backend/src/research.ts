import { WebSocket } from 'ws'
import { AgentState } from 'common/types/agent-state'
import { loopMainPrompt } from './loop-main-prompt'

export async function research(
  ws: WebSocket,
  prompts: string[],
  initialAgentState: AgentState,
  userId: string | undefined,
  clientSessionId: string
) {
  const researchPromises = prompts.map(prompt => {
    // Each research prompt runs in 'lite' mode and can only use read-only tools.
    const researchAgentState: AgentState = {
        ...initialAgentState,
        messageHistory: [], // Start with a clean history for each researcher
    };
    
    const action = {
      type: 'prompt' as const,
      prompt,
      agentState: researchAgentState,
      costMode: 'lite' as const,
      toolResults: [],
      fingerprintId: 'research-fingerprint', // Using a dedicated fingerprint for research tasks
      promptId: `research-${crypto.randomUUID()}`,
      cwd: initialAgentState.fileContext.currentWorkingDirectory,
    };

    return loopMainPrompt(
      ws,
      action,
      userId,
      clientSessionId,
      () => { /* We can ignore chunks for now */ },
      undefined // Use default model for lite mode
    );
  });

  const results = await Promise.all(researchPromises);
  // We'll return the final message history from each research agent.
  return results.map(result => result.agentState.messageHistory);
}
