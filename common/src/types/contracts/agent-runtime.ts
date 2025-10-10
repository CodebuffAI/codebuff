import type {
  AddAgentStepFn,
  FinishAgentRunFn,
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
  startAgentRun: StartAgentRunFn
  finishAgentRun: FinishAgentRunFn
  addAgentStep: AddAgentStepFn

  // LLM
  promptAiSdkStream: PromptAiSdkStreamFn
  promptAiSdk: PromptAiSdkFn
  promptAiSdkStructured: PromptAiSdkStructuredFn

  // Other
  logger: Logger
}
