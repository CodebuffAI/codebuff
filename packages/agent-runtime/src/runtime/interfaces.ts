import type { LLMEnvironment } from '../llm/interfaces'
import type { IOEnvironment, InputGateEnvironment, ToolsEnvironment } from '../io/interfaces'
import type { TemplatesEnvironment } from '../templates/interfaces'
import type { AnalyticsEnvironment, LoggerEnvironment } from '../analytics/interfaces'

/**
 * Complete environment interface for the agent runtime
 * The backend implements this to provide all necessary services
 */
export interface AgentRuntimeEnvironment {
  /** LLM provider abstraction */
  llm: LLMEnvironment

  /** IO for tool calls, file requests, streaming */
  io: IOEnvironment

  /** Input gating for cancellation */
  inputGate: InputGateEnvironment

  /** Tool definitions and handlers */
  tools: ToolsEnvironment

  /** Template loading and prompt generation */
  templates: TemplatesEnvironment

  /** Analytics tracking (optional) */
  analytics?: AnalyticsEnvironment

  /** Logging (optional, defaults to console) */
  logger?: LoggerEnvironment

  /** Request context for tracing (optional) */
  requestContext?: {
    processedRepoId?: string
  }
}
