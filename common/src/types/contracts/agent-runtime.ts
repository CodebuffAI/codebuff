import type { AgentTemplate } from '../agent-template'
import type {
  HandleStepsLogChunkFn,
  RequestFilesFn,
  RequestMcpToolDataFn,
  RequestOptionalFileFn,
  RequestToolCallFn,
  SendActionFn,
  SendSubagentChunkFn,
} from './client'
import type {
  AddAgentStepFn,
  FetchAgentFromDatabaseFn,
  FinishAgentRunFn,
  GetUserInfoFromApiKeyFn,
  StartAgentRunFn,
} from './database'
import type {
  PromptAiSdkFn,
  PromptAiSdkStreamFn,
  PromptAiSdkStructuredFn,
} from './llm'
import type { Logger } from './logger'

export type AgentRuntimeDeps = {
  // Database
  getUserInfoFromApiKey: GetUserInfoFromApiKeyFn
  fetchAgentFromDatabase: FetchAgentFromDatabaseFn
  startAgentRun: StartAgentRunFn
  finishAgentRun: FinishAgentRunFn
  addAgentStep: AddAgentStepFn
  databaseAgentCache: Map<string, AgentTemplate | null>

  // LLM
  promptAiSdkStream: PromptAiSdkStreamFn
  promptAiSdk: PromptAiSdkFn
  promptAiSdkStructured: PromptAiSdkStructuredFn

  // Other
  logger: Logger
}

export type AgentRuntimeScopedDeps = {
  // Client (WebSocket)
  handleStepsLogChunk: HandleStepsLogChunkFn
  requestToolCall: RequestToolCallFn
  requestMcpToolData: RequestMcpToolDataFn
  requestFiles: RequestFilesFn
  requestOptionalFile: RequestOptionalFileFn
  sendAction: SendActionFn
  sendSubagentChunk: SendSubagentChunkFn
}
