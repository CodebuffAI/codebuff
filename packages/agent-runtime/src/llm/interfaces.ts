import type { CodebuffMessage } from '@codebuff/common/types/messages/codebuff-message'
import type { PrintModeEvent } from '@codebuff/common/types/print-mode'
import type { AgentTemplate } from '@codebuff/common/types/agent-template'

/**
 * LLM provider abstraction interface
 * The backend implements this to provide LLM services while keeping
 * provider-specific logic and cost tracking out of the runtime
 */
export interface LLMEnvironment {
  /**
   * Get a stream from an agent template
   * This wraps the existing backend logic for getting LLM responses
   * while preserving cost tracking and provider selection
   */
  getAgentStreamFromTemplate: (params: {
    clientSessionId: string
    fingerprintId: string
    userInputId: string
    userId: string | undefined
    agentId?: string
    template: AgentTemplate
    onCostCalculated?: (credits: number) => Promise<void>
    includeCacheControl?: boolean
  }) => (messages: CodebuffMessage[]) => AsyncGenerator<string | PrintModeEvent>
}
