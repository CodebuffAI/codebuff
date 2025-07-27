/**
 * Codebuff Agent Type Definitions
 *
 * This file provides TypeScript type definitions for creating custom Codebuff agents.
 * Import these types in your agent files to get full type safety and IntelliSense.
 *
 * Usage:
 *   import { AgentConfig, ToolName, ModelName } from './agent-template'
 *
 *   const config: AgentConfig = {
 *     // Your agent configuration with full type safety
 *   }
 */

// ============================================================================
// Core Agent Configuration Types
// ============================================================================

export interface AgentConfig {
  // ============================================================================
  // Required Fields (these 4 are all you need to get started!)
  // ============================================================================

  /** Unique identifier for this agent (e.g., 'code-reviewer', 'test-writer') */
  id: string

  /** Human-readable name for the agent (e.g., 'Code Reviewer', 'Test Writer') */
  name: string

  /** Description of what this agent does. Provided to the parent agent so it knows when to spawn this agent. */
  purpose: string

  /** AI model to use for this agent. Can be any model in OpenRouter: https://openrouter.ai/models */
  model: ModelName

  // ============================================================================
  // Optional Customization
  // ============================================================================

  /** Background information for the agent. */
  systemPrompt?: string

  /** Instructions for the agent. This prompt is inserted after each user input.
   * Updating this prompt is the best way to shape the agent's behavior. */
  userInputPrompt?: string

  /** Tools this agent can use (defaults to ['read_files', 'write_file', 'str_replace', 'end_turn']) */
  tools?: ToolName[]

  /** Other agents this agent can spawn (defaults to []) */
  spawnableAgents?: SpawnableAgentName[]

  // ============================================================================
  // Advanced fields below!
  // ============================================================================

  /** Version string (defaults to '0.0.1' and bumped on each publish) */
  version?: string

  /** How the agent should output responses after spawned (defaults to 'last_message') */
  outputMode?: 'last_message' | 'all_messages' | 'json'

  /** JSON schema for structured output (when outputMode is 'json') */
  outputSchema?: JsonSchema

  /** Whether to include conversation history (defaults to true) */
  includeMessageHistory?: boolean

  /** Prompt inserted at each agent step. Powerful for changing the agent's behavior. */
  agentStepPrompt?: string

  /** Instructions for spawned sub-agents (defaults to {}) */
  parentInstructions?: Record<SpawnableAgentName, string>

  /** Programmatically step the agent forward and run tools.
   *
   * Example:
   * function* handleSteps({ agentStep, prompt, params}) {
   *   const { toolResult } = yield {
   *     toolName: 'read_files',
   *     paths: ['file1.txt', 'file2.txt'],
   *   }
   *   yield 'STEP_ALL'
   * }
   */
  handleSteps?: (
    context: AgentStepContext
  ) => Generator<
    ToolName | 'STEP' | 'STEP_ALL',
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
  prompt: string | undefined
  params: Record<string, any> | undefined
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
 * All available tools that agents can use
 */
export type ToolName =
  | FileTools
  | CodeAnalysisTools
  | TerminalTools
  | WebTools
  | AgentTools
  | PlanningTools
  | OutputTools

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
  | (string & {}) // Preserves autocomplete while allowing any string

// ============================================================================
// Spawnable Agents
// ============================================================================

/**
 * Built-in agents that can be spawned by custom agents
 */
export type SpawnableAgentName =
  | 'file_picker'
  | 'file_explorer'
  | 'researcher'
  | 'thinker'
  | 'reviewer'
  | (string & {}) // Preserves autocomplete while allowing any string

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Common tool combinations for convenience
 */
export type FileEditingTools = FileTools | 'end_turn'
export type ResearchTools = WebTools | 'write_file' | 'end_turn'
export type CodeAnalysisToolSet = FileTools | CodeAnalysisTools | 'end_turn'
