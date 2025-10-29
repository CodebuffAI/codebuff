import type { AgentTemplate } from '@codebuff/common/types/agent-template'
import type { AssistantMessage } from '@codebuff/common/types/messages/codebuff-message'
import type {
  AgentState,
  AgentOutput,
} from '@codebuff/common/types/session-state'

export function getAgentOutput(
  agentState: AgentState,
  agentTemplate: AgentTemplate,
): AgentOutput {
  if (agentTemplate.outputMode === 'structured_output') {
    return {
      type: 'structuredOutput',
      value: agentState.output ?? null,
    }
  }
  if (agentTemplate.outputMode === 'last_message') {
    const assistantMessages = agentState.messageHistory.filter(
      (message): message is AssistantMessage => message.role === 'assistant',
    )
    const lastAssistantMessage = assistantMessages[assistantMessages.length - 1]
    if (!lastAssistantMessage) {
      return {
        type: 'error',
        message: 'No response from agent',
      }
    }
    return {
      type: 'lastMessage',
      value: lastAssistantMessage.content,
    }
  }
  if (agentTemplate.outputMode === 'all_messages') {
    // Remove the first message, which includes the previous conversation history.
    const agentMessages = agentState.messageHistory.slice(1)
    return {
      type: 'allMessages',
      value: agentMessages,
    }
  }
  agentTemplate.outputMode satisfies never
  throw new Error(
    `Unknown output mode: ${'outputMode' in agentTemplate ? agentTemplate.outputMode : 'undefined'}`,
  )
}
