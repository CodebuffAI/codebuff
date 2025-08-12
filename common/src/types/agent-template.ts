import type { Model } from '../constants'
import type { AgentState, AgentTemplateType } from './session-state'
import type { ToolCall } from '../templates/initial-agents-dir/types/agent-definition'
import type { ToolName } from '../tools/constants'
import type { z } from 'zod'

export type AgentTemplate<
  P = string | undefined,
  T = Record<string, any> | undefined,
> = {
  id: AgentTemplateType
  displayName: string
  model: Model

  toolNames: ToolName[]
  spawnableAgents: AgentTemplateType[]

  spawnerPrompt?: string
  systemPrompt: string
  instructionsPrompt: string
  stepPrompt: string
  parentInstructions?: Record<string, string>

  // Required parameters for spawning this agent.
  inputSchema: {
    prompt?: z.ZodSchema<P>
    params?: z.ZodSchema<T>
  }
  includeMessageHistory: boolean
  outputMode: 'last_message' | 'all_messages' | 'structured_output'
  outputSchema?: z.ZodSchema<any>

  handleSteps?: StepHandler<P, T> | string // Function or string of the generator code for running in a sandbox
}

export type StepGenerator = Generator<
  Omit<ToolCall, 'toolCallId'> | 'STEP' | 'STEP_ALL', // Generic tool call type
  void,
  { agentState: AgentState; toolResult: string | undefined }
>

export type StepHandler<
  P = string | undefined,
  T = Record<string, any> | undefined,
> = (params: { agentState: AgentState; prompt: P; params: T }) => StepGenerator
