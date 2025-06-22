import { WebSocket } from 'ws'
import { AgentState } from '@codebuff/common/types/agent-state'
import { loopMainPrompt } from './loop-main-prompt'
import { toContentString } from '@codebuff/common/util/messages'

export async function research(
  ws: WebSocket,
  prompts: string[],
  initialAgentState: AgentState,
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
    const researchAgentState: AgentState = {
      ...initialAgentState,
      agentStepsRemaining: maxIterations,
      messageHistory: [],
    }

    const action = {
      type: 'prompt' as const,
      prompt,
      agentState: researchAgentState,
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
    result.agentState.messageHistory
      .filter((m) => m.role === 'assistant')
      .map((m) => `Research agent: ${toContentString(m)}`)
      .join('\n\n')
  )
}
