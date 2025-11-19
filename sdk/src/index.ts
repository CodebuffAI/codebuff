export type * from '../../common/src/types/json'
export type * from '../../common/src/types/messages/codebuff-message'
export type * from '../../common/src/types/messages/data-content'
export type * from '../../common/src/types/print-mode'
export type * from './run'
// Agent type exports
export type { AgentDefinition } from '../../common/src/templates/initial-agents-dir/types/agent-definition'
export type { ToolName } from '../../common/src/tools/constants'

// Re-export code analysis functionality
export * from '../../packages/code-map/src/index'

export type {
  ClientToolCall,
  ClientToolName,
  CodebuffToolOutput,
} from '../../common/src/tools/list'
export * from './client'
export * from './custom-tool'
export * from './native/ripgrep'
export * from './run-state'
export { ToolHelpers } from './tools'
export * from './websocket-client'
export * from './constants'
export { formatState } from '../../common/src/websockets/websocket-client'
export type { ReadyState } from '../../common/src/websockets/websocket-client'

export { getUserInfoFromApiKey } from './impl/database'
export { getUserInfoFromApiKeySafe } from './impl/database-safe'

export { validateAgents } from './validate-agents'

// Error types and guards
export {
  AuthenticationError,
  NetworkError,
  isAuthenticationError,
  isNetworkError,
  isErrorWithCode,
  ErrorCodes,
  RETRYABLE_ERROR_CODES,
  type ErrorCode,
  type ErrorWithCode,
  type ErrorWithStatus,
  type NetworkErrorDetails
} from './errors'
export type { ValidationResult, ValidateAgentsOptions } from './validate-agents'

// Retry and connection configuration
export {
  MAX_RETRIES_PER_MESSAGE,
  RETRY_BACKOFF_BASE_DELAY_MS,
  RETRY_BACKOFF_MAX_DELAY_MS,
  RECONNECTION_RETRY_DELAY_MS,
  RECONNECTION_MESSAGE_DURATION_MS,
  calculateBackoffDelay,
  DEFAULT_RETRY_CONFIG,
  type RetryConfig,
} from './retry-config'

// Re-export promise utilities and constants from common
export { INITIAL_RETRY_DELAY } from '@codebuff/common/util/promise'

// ErrorOr utilities
export {
  failure,
  success,
  type ErrorObject,
  type ErrorOr,
  type Success,
  type Failure,
} from '@codebuff/common/util/error'

export type { CodebuffFileSystem } from '@codebuff/common/types/filesystem'

export { runTerminalCommand } from './tools/run-terminal-command'
