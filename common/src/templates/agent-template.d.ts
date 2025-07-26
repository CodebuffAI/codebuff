/**
 * Codebuff Agent Type Definitions
 *
 * This file provides TypeScript type definitions for creating custom Codebuff agents.
 * Import these types in your agent files to get full type safety and IntelliSense.
 *
 * Usage:
 *   import { AgentConfig, ToolName, ModelName } from './agent-template.d.ts'
 *
 *   const config: AgentConfig = {
 *     // Your agent configuration with full type safety
 *   }
 */

// ============================================================================
// Core Agent Configuration Types
// ============================================================================

/**
 * Simple configuration interface for defining a custom agent
 */
export interface AgentConfig {
  /** Unique identifier for this agent */
  id: string

  /** Human-readable name for the agent */
  name: string

  /** Description of what this agent does */
  purpose: string

  /** AI model to use for this agent */
  model: ModelName

  /** Main system prompt defining the agent's behavior */
  systemPrompt: string

  /** Optional: Tools this agent can use (defaults to common file editing tools) */
  tools?: ToolName[]

  /** Optional: Other agents this agent can spawn */
  spawnableAgents?: SpawnableAgentName[]

  /** Optional: Advanced generator function for programmatic control */
  handleSteps?: (context: AgentStepContext) => AsyncGenerator<any, any, any>
}
/**
 * Advanced configuration interface with all options (for power users)
 */
export interface AdvancedAgentConfig extends AgentConfig {
  /** Version string (defaults to '1.0.0') */
  version?: string

  /** How the agent should output responses (defaults to 'last_message') */
  outputMode?: 'last_message' | 'all_messages' | 'json'

  /** JSON schema for structured output (when outputMode is 'json') */
  outputSchema?: JsonSchema

  /** Whether to include conversation history (defaults to true) */
  includeMessageHistory?: boolean

  /** Prompt template for user input (defaults to standard template) */
  userInputPrompt?: string

  /** Prompt for continuing agent steps (defaults to standard template) */
  agentStepPrompt?: string

  /** Instructions for spawned sub-agents */
  parentInstructions?: Record<SpawnableAgentName, string>
}

// ============================================================================
// Supporting Types
// ============================================================================

/**
 * Context provided to handleSteps generator function
 */
export interface AgentStepContext {
  agentState: any
  prompt: string
  params: any
}

/**
 * JSON Schema definition (for advanced users)
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

  // Or any string for custom models, as long as they are supported by OpenRouter
  | string

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
  | string // Allow custom agent names

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Common tool combinations for convenience
 */
export type FileEditingTools = FileTools | 'end_turn'
export type ResearchTools = WebTools | 'write_file' | 'end_turn'
export type CodeAnalysisToolSet = FileTools | CodeAnalysisTools | 'end_turn'
