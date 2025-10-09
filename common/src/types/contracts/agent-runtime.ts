import type {
  AddAgentStepFn,
  FinishAgentRunFn,
  StartAgentRunFn,
} from './database'
import type { PromptAiSdkStreamFn } from './llm'
import type { Logger } from './logger'

export type AgentRuntimeDeps = {
  // Database
  startAgentRun: StartAgentRunFn
  finishAgentRun: FinishAgentRunFn
  addAgentStep: AddAgentStepFn

  // LLM
  promptAiSdkStream: PromptAiSdkStreamFn

  // Other
  logger: Logger
}
