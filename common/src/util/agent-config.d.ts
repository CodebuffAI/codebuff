/**
 * Codebuff Agent Type Definitions
 *
 * This file provides TypeScript type definitions for creating custom Codebuff agents.
 * Import these types in your agent files to get full type safety and IntelliSense.
 *
 * Usage:
 *   import { AgentConfig, ToolName, ModelName } from './agent-config'
 *
 *   const config: AgentConfig = {
 *     // Your agent configuration with full type safety
 *   }
 */

import type * as Tools from './tools'
export type { Tools }
type ToolName = Tools.ToolName

// ============================================================================
// Core Agent Configuration Types
// ============================================================================

export interface AgentConfig {
  /** Unique identifier for this agent. Use alphanumeric characters and hyphens only, e.g. 'code-reviewer' */
  id: string

  /** Version string (if not provided, will default to '0.0.1' and be bumped on each publish) */
  version?: string

  /** Human-readable name for the agent */
  displayName: string

  /** AI model to use for this agent. Can be any model in OpenRouter: https://openrouter.ai/models */
  model: ModelName

  // ============================================================================
  // Tools and Subagents
  // ============================================================================

  /** Tools this agent can use. */
  toolNames?: ToolName[]

  /** Other agents this agent can spawn. */
  subagents?: SubagentName[]

  // ============================================================================
  // Prompts
  // ============================================================================

  /** Prompt for when to spawn this agent as a subagent. Include the main purpose and use cases.
   * This field is key if the agent is a subagent and intended to be spawned. */
  parentPrompt?: string

  /** Background information for the agent. Fairly optional. Prefer using instructionsPrompt for agent instructions. */
  systemPrompt?: string

  /** Instructions for the agent.
   * IMPORTANT: Updating this prompt is the best way to shape the agent's behavior.
   * This prompt is inserted after each user input. */
  instructionsPrompt?: string

  /** Prompt inserted at each agent step. Powerful for changing the agent's behavior,
   * but usually not necessary for smart models. Prefer instructionsPrompt for most instructions. */
  stepPrompt: string

  // ============================================================================
  // Input and Output
  // ============================================================================

  /** The input schema required to spawn the agent. Provide a prompt string and/or a params object or none.
   * 80% of the time you want just a prompt string with a description:
   * inputSchema: {
   *   prompt: { type: 'string', description: 'A description of what info would be helpful to the agent' }
   * }
   */
  inputSchema?: {
    prompt?: { type: 'string'; description?: string }
    params?: JsonSchema
  }

  /** Whether to include conversation history. Defaults to false.
   * Use this if the agent needs to know all the previous messages in the conversation.
   */
  includeMessageHistory?: boolean

  /** How the agent should output a response to its parent (defaults to 'last_message')
   * last_message: The last message from the agent, typcically after using tools.
   * all_messages: All messages from the agent, including tool calls and results.
   * json: Make the agent output a JSON object. Can be used with outputSchema or without if you want freeform json output.
   */
  outputMode?: 'last_message' | 'all_messages' | 'json'

  /** JSON schema for structured output (when outputMode is 'json') */
  outputSchema?: JsonSchema

  // ============================================================================
  // Handle Steps
  // ============================================================================

  /** Programmatically step the agent forward and run tools.
   *
   * You can either yield:
   * - A tool call object with toolName and args properties.
   * - 'STEP' to run agent's model and generate one assistant message.
   * - 'STEP_ALL' to run the agent's model until it uses the end_turn tool or stops includes no tool calls in a message.
   *
   * Or use 'return' to end the turn.
   *
   * Example 1:
   * function* handleSteps({ agentStep, prompt, params}) {
   *   const { toolResult } = yield {
   *     toolName: 'read_files',
   *     args: { paths: ['file1.txt', 'file2.txt'] }
   *   }
   *   yield 'STEP_ALL'
   * }
   *
   * Example 2:
   * handleSteps: function* ({ agentState, prompt, params }) {
   *   while (true) {
   *     yield {
   *       toolName: 'spawn_agents',
   *       args: {
   *         agents: [
   *         {
   *           agent_type: 'thinker',
   *           prompt: 'Think deeply about the user request',
   *         },
   *       ],
   *     },
   *   }
   *   const { toolResult: thinkResult } = yield 'STEP'
   *   if (thinkResult?.toolName === 'end_turn') {
   *     break
   *   }
   * }
   * }
   */
  handleSteps?: (
    context: AgentStepContext
  ) => Generator<
    ToolCall | 'STEP' | 'STEP_ALL',
    void,
    { agentState: AgentState; toolResult: ToolResult | undefined }
  >
}

// ============================================================================
// Supporting Types
// ============================================================================

export interface AgentState {
  agentId: string
  parentId: string
  messageHistory: Message[]
}

/**
 * Message in conversation history
 */
export interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp?: number
}

/**
 * Result from executing a tool
 */
export interface ToolResult {
  success: boolean
  data?: any
  error?: string
}

/**
 * Context provided to handleSteps generator function
 */
export interface AgentStepContext {
  agentState: AgentState
  prompt?: string
  params?: Record<string, any>
}

/**
 * Tool call object for handleSteps generator
 */
export interface ToolCall<T extends ToolName = ToolName> {
  toolName: T
  args?: Tools.GetToolParams<T>
}

/**
 * JSON Schema definition (for prompt schema or output schema)
 */
export interface JsonSchema {
  type: string
  properties?: Record<string, any>
  required?: string[]
  [key: string]: any
}

// ============================================================================
// Available Tools
// ============================================================================

/**
 * File operation tools
 */
export type FileTools =
  | 'read_files'
  | 'write_file'
  | 'str_replace'
  | 'find_files'

/**
 * Code analysis tools
 */
export type CodeAnalysisTools = 'code_search' | 'find_files'

/**
 * Terminal and system tools
 */
export type TerminalTools = 'run_terminal_command' | 'run_file_change_hooks'

/**
 * Web and browser tools
 */
export type WebTools = 'browser_logs' | 'web_search' | 'read_docs'

/**
 * Agent management tools
 */
export type AgentTools =
  | 'spawn_agents'
  | 'spawn_agents_async'
  | 'send_agent_message'
  | 'set_messages'
  | 'add_message'

/**
 * Planning and organization tools
 */
export type PlanningTools =
  | 'think_deeply'
  | 'create_plan'
  | 'add_subgoal'
  | 'update_subgoal'

/**
 * Output and control tools
 */
export type OutputTools = 'set_output' | 'end_turn'

/**
 * Common tool combinations for convenience
 */
export type FileEditingTools = FileTools | 'end_turn'
export type ResearchTools = WebTools | 'write_file' | 'end_turn'
export type CodeAnalysisToolSet = FileTools | CodeAnalysisTools | 'end_turn'


// ============================================================================
// Available Models (see: https://openrouter.ai/models)
// ============================================================================

/**
 * AI models available for agents (all models in OpenRouter are supported)
 *
 * See available models at https://openrouter.ai/models
 */
export type ModelName =
  // Verified OpenRouter Models
  | 'anthropic/claude-4-sonnet-20250522'
  | 'anthropic/claude-4-opus-20250522'
  | 'anthropic/claude-3.5-haiku-20241022'
  | 'anthropic/claude-3.5-sonnet-20240620'
  | 'openai/gpt-4o-2024-11-20'
  | 'openai/gpt-4o-mini-2024-07-18'
  | 'openai/o3'
  | 'openai/o4-mini'
  | 'openai/o4-mini-high'
  | 'google/gemini-2.5-pro'
  | 'google/gemini-2.5-flash'
  | 'x-ai/grok-4-07-09'
  | (string & {})

// ============================================================================
// Spawnable Agents
// ============================================================================

/**
 * Built-in agents that can be spawned by custom agents
 */
export type SubagentName =
  | 'file_picker'
  | 'file_explorer'
  | 'researcher'
  | 'thinker'
  | 'reviewer'
  | (string & {})
