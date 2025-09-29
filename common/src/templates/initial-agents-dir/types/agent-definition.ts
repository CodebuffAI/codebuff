/**
 * Codebuff Agent Type Definitions
 *
 * This file provides TypeScript type definitions for creating custom Codebuff agents.
 * Import these types in your agent files to get full type safety and IntelliSense.
 *
 * Usage in .agents/your-agent.ts:
 *   import { AgentDefinition, ToolName, ModelName } from './types/agent-definition'
 *
 *   const definition: AgentDefinition = {
 *     // ... your agent configuration with full type safety ...
 *   }
 *
 *   export default definition
 */

// ============================================================================
// Agent Definition and Utility Types
// ============================================================================

export interface AgentDefinition {
  /** Unique identifier for this agent. Must contain only lowercase letters, numbers, and hyphens, e.g. 'code-reviewer' */
  id: string

  /** Version string (if not provided, will default to '0.0.1' and be bumped on each publish) */
  version?: string

  /** Publisher ID for the agent. Must be provided if you want to publish the agent. */
  publisher?: string

  /** Human-readable name for the agent */
  displayName: string

  /** AI model to use for this agent. Can be any model in OpenRouter: https://openrouter.ai/models */
  model: ModelName

  /**
   * https://openrouter.ai/docs/use-cases/reasoning-tokens
   * One of `max_tokens` or `effort` is required.
   * If `exclude` is true, reasoning will be removed from the response. Default is false.
   */
  reasoningOptions?: {
    enabled?: boolean
    exclude?: boolean
  } & (
    | {
        max_tokens: number
      }
    | {
        effort: 'high' | 'medium' | 'low'
      }
  )

  // ============================================================================
  // Tools and Subagents
  // ============================================================================

  /** MCP servers by name. Names cannot contain `/`. */
  mcpServers?: Record<string, MCPConfig>

  /**
   * Tools this agent can use.
   *
   * By default, all tools are available from any specified MCP server. In
   * order to limit the tools from a specific MCP server, add the tool name(s)
   * in the format `'mcpServerName/toolName1'`, `'mcpServerName/toolName2'`,
   * etc.
   */
  toolNames?: (ToolName | (string & {}))[]

  /** Other agents this agent can spawn, like 'codebuff/file-picker@0.0.1'.
   *
   * Use the fully qualified agent id from the agent store, including publisher and version: 'codebuff/file-picker@0.0.1'
   * (publisher and version are required!)
   *
   * Or, use the agent id from a local agent file in your .agents directory: 'file-picker'.
   */
  spawnableAgents?: string[]

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
    params?: JsonObjectSchema
  }

  /** Whether to include conversation history from the parent agent in context.
   *
   * Defaults to false.
   * Use this if the agent needs to know all the previous messages in the conversation.
   */
  includeMessageHistory?: boolean

  /** How the agent should output a response to its parent (defaults to 'last_message')
   *
   * last_message: The last message from the agent, typically after using tools.
   *
   * all_messages: All messages from the agent, including tool calls and results.
   *
   * structured_output: Make the agent output a JSON object. Can be used with outputSchema or without if you want freeform json output.
   */
  outputMode?: 'last_message' | 'all_messages' | 'structured_output'

  /** JSON schema for structured output (when outputMode is 'structured_output') */
  outputSchema?: JsonObjectSchema

  // ============================================================================
  // Prompts
  // ============================================================================

  /** Prompt for when and why to spawn this agent. Include the main purpose and use cases.
   *
   * This field is key if the agent is intended to be spawned by other agents. */
  spawnerPrompt?: string

  /** Background information for the agent. Fairly optional. Prefer using instructionsPrompt for agent instructions. */
  systemPrompt?: string

  /** Instructions for the agent.
   *
   * IMPORTANT: Updating this prompt is the best way to shape the agent's behavior.
   * This prompt is inserted after each user input. */
  instructionsPrompt?: string

  /** Prompt inserted at each agent step.
   *
   * Powerful for changing the agent's behavior, but usually not necessary for smart models.
   * Prefer instructionsPrompt for most instructions. */
  stepPrompt?: string

  // ============================================================================
  // Handle Steps
  // ============================================================================

  /** Programmatically step the agent forward and run tools.
   *
   * You can either yield:
   * - A tool call object with toolName and input properties.
   * - 'STEP' to run agent's model and generate one assistant message.
   * - 'STEP_ALL' to run the agent's model until it uses the end_turn tool or stops includes no tool calls in a message.
   *
   * Or use 'return' to end the turn.
   *
   * Example 1:
   * function* handleSteps({ agentState, prompt, params, logger }) {
   *   logger.info('Starting file read process')
   *   const { toolResult } = yield {
   *     toolName: 'read_files',
   *     input: { paths: ['file1.txt', 'file2.txt'] }
   *   }
   *   yield 'STEP_ALL'
   *
   *   // Optionally do a post-processing step here...
   *   logger.info('Files read successfully, setting output')
   *   yield {
   *     toolName: 'set_output',
   *     input: {
   *       output: 'The files were read successfully.',
   *     },
   *   }
   * }
   *
   * Example 2:
   * handleSteps: function* ({ agentState, prompt, params, logger }) {
   *   while (true) {
   *     logger.debug('Spawning thinker agent')
   *     yield {
   *       toolName: 'spawn_agents',
   *       input: {
   *         agents: [
   *         {
   *           agent_type: 'thinker',
   *           prompt: 'Think deeply about the user request',
   *         },
   *       ],
   *     },
   *   }
   *   const { stepsComplete } = yield 'STEP'
   *   if (stepsComplete) break
   * }
   * }
   */
  handleSteps?: (context: AgentStepContext) => Generator<
    ToolCall | 'STEP' | 'STEP_ALL',
    void,
    {
      agentState: AgentState
      toolResult: ToolResultOutput[] | undefined
      stepsComplete: boolean
    }
  >
}

// ============================================================================
// Supporting Types
// ============================================================================

export interface AgentState {
  agentId: string
  runId: string
  parentId: string | undefined

  /** The agent's conversation history: messages from the user and the assistant. */
  messageHistory: Message[]

  /** The last value set by the set_output tool. This is a plain object or undefined if not set. */
  output: Record<string, any> | undefined
}

/**
 * Context provided to handleSteps generator function
 */
export interface AgentStepContext {
  agentState: AgentState
  prompt?: string
  params?: Record<string, any>
  logger: Logger
}

/**
 * Tool call object for handleSteps generator
 */
export type ToolCall<T extends ToolName = ToolName> = {
  [K in T]: {
    toolName: K
    input: Tools.GetToolParams<K>
    includeToolCall?: boolean
  }
}[T]

// ============================================================================
// Available Tools
// ============================================================================

/**
 * File operation tools
 */
export type FileEditingTools = 'read_files' | 'write_file' | 'str_replace'

/**
 * Code analysis tools
 */
export type CodeAnalysisTools = 'code_search' | 'find_files' | 'read_files'

/**
 * Terminal and system tools
 */
export type TerminalTools = 'run_terminal_command' | 'code_search'

/**
 * Web and browser tools
 */
export type WebTools = 'web_search' | 'read_docs'

/**
 * Agent management tools
 */
export type AgentTools = 'spawn_agents'

/**
 * Output and control tools
 */
export type OutputTools = 'set_output'

// ============================================================================
// Available Models (see: https://openrouter.ai/models)
// ============================================================================

/**
 * AI models available for agents. Pick from our selection of recommended models or choose any model in OpenRouter.
 *
 * See available models at https://openrouter.ai/models
 */
export type ModelName =
  // Recommended Models

  // OpenAI
  | 'openai/gpt-5'
  | 'openai/gpt-5-chat'
  | 'openai/gpt-5-mini'
  | 'openai/gpt-5-nano'

  // Anthropic
  | 'anthropic/claude-sonnet-4'
  | 'anthropic/claude-opus-4.1'

  // Gemini
  | 'google/gemini-2.5-pro'
  | 'google/gemini-2.5-flash'
  | 'google/gemini-2.5-flash-lite'
  | 'google/gemini-2.5-flash-preview-09-2025'
  | 'google/gemini-2.5-flash-lite-preview-09-2025'

  // X-AI
  | 'x-ai/grok-4-07-09'
  | 'x-ai/grok-4-fast:free'
  | 'x-ai/grok-code-fast-1'

  // Qwen
  | 'qwen/qwen3-max'
  | 'qwen/qwen3-coder-plus'
  | 'qwen/qwen3-coder'
  | 'qwen/qwen3-coder:nitro'
  | 'qwen/qwen3-coder-flash'
  | 'qwen/qwen3-235b-a22b-2507'
  | 'qwen/qwen3-235b-a22b-2507:nitro'
  | 'qwen/qwen3-235b-a22b-thinking-2507'
  | 'qwen/qwen3-235b-a22b-thinking-2507:nitro'
  | 'qwen/qwen3-30b-a3b'
  | 'qwen/qwen3-30b-a3b:nitro'

  // DeepSeek
  | 'deepseek/deepseek-chat-v3-0324'
  | 'deepseek/deepseek-chat-v3-0324:nitro'
  | 'deepseek/deepseek-r1-0528'
  | 'deepseek/deepseek-r1-0528:nitro'

  // Other open source models
  | 'moonshotai/kimi-k2'
  | 'moonshotai/kimi-k2:nitro'
  | 'z-ai/glm-4.5'
  | 'z-ai/glm-4.5:nitro'
  | (string & {})

export type { Tools }

import type * as Tools from './tools'
import type {
  Message,
  ToolResultOutput,
  JsonObjectSchema,
  MCPConfig,
  Logger,
} from './util-types'
type ToolName = Tools.ToolName
