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
  displayName: string

  /** Description of what this agent does. Provided to the parent agent so it knows when to spawn this agent. */
  purpose: string

  /** AI model to use for this agent. Can be any model in OpenRouter: https://openrouter.ai/models */
  model: ModelName

  parentPrompt?: string

  /** Background information for the agent. Prefer to use instructionsPrompt for agent instructions. */
  systemPrompt?: string

  /** Instructions for the agent. This prompt is inserted after each user input.
   * Updating this prompt is the best way to shape the agent's behavior. */
  instructionsPrompt?: string

  /** Tools this agent can use (defaults to common file editing tools) */
  tools?: ToolName[]

  /** Other agents this agent can spawn */
  spawnableAgents?: SpawnableAgentName[]

  // ============================================================================
  // Advanced fields below!
  // ============================================================================

  /** Version string (if not provided, will default to '0.0.1' and be bumped on each publish) */
  version?: string

  /** How the agent should output responses after spawned (defaults to 'last_message') */
  outputMode?: 'last_message' | 'all_messages' | 'json'

  /** JSON schema for structured output (when outputMode is 'json') */
  outputSchema?: JsonSchema

  /** Whether to include conversation history (defaults to true) */
  includeMessageHistory?: boolean

  /** Prompt inserted at each agent step. Powerful for changing the agent's behavior. */
  stepPrompt?: string

  /** Instructions for spawned sub-agents */
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
  | (string & {})

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
  | (string & {})

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Common tool combinations for convenience
 */
export type FileEditingTools = FileTools | 'end_turn'
export type ResearchTools = WebTools | 'write_file' | 'end_turn'
export type CodeAnalysisToolSet = FileTools | CodeAnalysisTools | 'end_turn'

// ============================================================================
// Example Configurations
// ============================================================================

/**
 * Example configuration for a basic file-editing agent
 */
export const FileEditorExample: AgentConfig = {
  id: 'file-editor',
  name: 'File Editor',
  purpose: 'Specialized in reading and editing files',
  model: 'anthropic/claude-4-sonnet-20250522',
  tools: ['read_files', 'write_file', 'str_replace', 'end_turn'],
  instructionsPrompt: `
1. Read all the files you need first to get as much context as possible.
2. Make the edits, preferring to use str_replace.
  `.trim(),
}

/**
 * Example configuration for a research agent
 */
export const ResearcherExample: AgentConfig = {
  id: 'researcher',
  name: 'Research Assistant',
  purpose: 'Specialized in gathering information and research',
  model: 'anthropic/claude-3.5-haiku-20241022',
  tools: ['web_search', 'read_docs', 'write_file', 'end_turn'],
  spawnableAgents: ['researcher', 'knowledge-keeper'],
  systemPrompt:
    'You are a research specialist. Help users gather information, analyze sources, and document findings.',
}

/**
 * Example configuration for a code analysis agent
 */
export const CodeAnalyzerExample: AgentConfig = {
  id: 'code-analyzer',
  name: 'Code Analyzer',
  purpose: 'Specialized in understanding codebases and finding patterns',
  model: 'google/gemini-2.5-flash',
  tools: ['read_files', 'code_search', 'find_files', 'end_turn'],
  systemPrompt:
    'You are a code analysis expert. Help users understand codebases, find patterns, and identify issues.',
}

/**
 * Example configuration using advanced features
 */
export const AdvancedExample: AgentConfig = {
  id: 'advanced-agent',
  name: 'Advanced Agent',
  purpose: 'Demonstrates advanced configuration options',
  model: 'anthropic/claude-4-sonnet-20250522',
  tools: ['read_files', 'code_search', 'set_output'],
  systemPrompt:
    'You analyze code and return structured JSON responses with confidence scores.',
  parentInstructions: {
    file_picker: 'Focus on finding the most relevant code files for analysis',
  },
  outputMode: 'json',
  outputSchema: {
    type: 'object',
    properties: {
      result: { type: 'string' },
      confidence: { type: 'number' },
    },
    required: ['result'],
  },
}
