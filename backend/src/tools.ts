import { ToolName, toolSchema } from '@codebuff/common/constants/tools'
import { CodebuffToolCall } from './features/tools/constants'
import { z } from 'zod'
import { AgentState, AgentTemplateType } from '@codebuff/common/types/session-state'

export interface ToolCallError {
  error: string
}

export function parseRawToolCall<T extends ToolName>(params: {
  type: 'tool-call'
  toolName: T
  toolCallId: string
  args: Record<string, string>
}): CodebuffToolCall<T> | ToolCallError {
  try {
    // Get the schema for this tool
    const schema = toolSchema[params.toolName]
    if (!schema) {
      return { error: `Unknown tool: ${params.toolName}` }
    }
    
    // Parse the arguments according to the schema
    const parsedArgs = parseToolArgs(params.args, schema)
    
    return {
      type: 'tool-call',
      toolName: params.toolName,
      toolCallId: params.toolCallId,
      args: parsedArgs,
    } as CodebuffToolCall<T>
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to parse tool call' }
  }
}

function parseToolArgs(args: Record<string, string>, schema: any): any {
  // Handle the case where schema might be an array (for tools with array parameters)
  if (!schema || typeof schema !== 'object' || !('shape' in schema)) {
    // Special handling for tools that need JSON parsing
    const parsedArgs: any = {}
    for (const [key, value] of Object.entries(args)) {
      // Parse json_update for update_report tool
      if (key === 'json_update') {
        try {
          parsedArgs[key] = JSON.parse(value)
        } catch {
          parsedArgs[key] = value
        }
      } else if (key === 'agents' || key === 'paths' || key === 'replacements') {
        // Parse array parameters
        try {
          parsedArgs[key] = JSON.parse(value)
        } catch {
          parsedArgs[key] = value
        }
      } else {
        parsedArgs[key] = value
      }
    }
    return parsedArgs
  }
  
  const shape = schema.shape
  const parsedArgs: any = {}
  
  for (const [key, value] of Object.entries(args)) {
    if (!(key in shape)) {
      continue // Skip unknown parameters
    }
    
    const fieldSchema = shape[key]
    
    // Handle different types
    if (fieldSchema instanceof z.ZodString) {
      parsedArgs[key] = value
    } else if (fieldSchema instanceof z.ZodNumber) {
      parsedArgs[key] = Number(value)
    } else if (fieldSchema instanceof z.ZodBoolean) {
      parsedArgs[key] = value === 'true'
    } else if (fieldSchema instanceof z.ZodArray) {
      try {
        parsedArgs[key] = JSON.parse(value)
      } catch {
        parsedArgs[key] = [value] // Fallback to single-item array
      }
    } else if (fieldSchema instanceof z.ZodObject || fieldSchema instanceof z.ZodRecord) {
      try {
        parsedArgs[key] = JSON.parse(value)
      } catch {
        parsedArgs[key] = value // Fallback to string
      }
    } else if (fieldSchema instanceof z.ZodEnum) {
      parsedArgs[key] = value
    } else if (fieldSchema instanceof z.ZodOptional || fieldSchema instanceof z.ZodDefault) {
      // Recursively handle optional/default types
      const innerSchema = fieldSchema._def.innerType
      parsedArgs[key] = parseToolArgs({ [key]: value }, z.object({ [key]: innerSchema }))[key]
    } else {
      // Default to string
      parsedArgs[key] = value
    }
  }
  
  // Validate with zod
  const result = schema.safeParse(parsedArgs)
  if (!result.success) {
    throw new Error(`Validation failed: ${result.error.message}`)
  }
  
  return result.data
}

export const toolParams: Record<ToolName, string[]> = {
  read_files: ['paths'],
  write_file: ['path', 'instructions', 'content'],
  str_replace: ['path', 'replacements'],
  run_terminal_command: ['command', 'process_type', 'cwd', 'timeout_seconds'],
  code_search: ['pattern', 'flags', 'cwd'],
  create_plan: ['path', 'plan'],
  add_subgoal: ['id', 'objective', 'status', 'plan', 'log'],
  update_subgoal: ['id', 'status', 'plan', 'log'],
  end_turn: [],
  find_files: ['description'],
  read_docs: ['libraryTitle', 'topic', 'max_tokens'],
  browser_logs: ['type', 'url', 'waitUntil'],
  run_file_change_hooks: [],
  spawn_agents: ['agents'],
  web_search: ['query', 'depth'],
  think_deeply: ['thought'],
  update_report: ['json_update'],
}

export async function updateContextFromToolCalls(
  agentState: AgentState,
  toolCalls: CodebuffToolCall<'add_subgoal' | 'update_subgoal'>[]
): Promise<AgentState> {
  let updatedContext = { ...agentState }
  
  for (const toolCall of toolCalls) {
    if (toolCall.toolName === 'add_subgoal') {
      const { id, objective, status, plan, log } = toolCall.args
      // TODO: Implement subgoals in AgentState
      // For now, we'll store subgoals in the agentContext field as a JSON string
      const currentSubgoals = updatedContext.agentContext ? JSON.parse(updatedContext.agentContext).subgoals || [] : []
      const newSubgoals = [
        ...currentSubgoals,
        {
          id,
          objective,
          status,
          plan: plan || '',
          logs: log ? [log] : [],
        }
      ]
      updatedContext.agentContext = JSON.stringify({ subgoals: newSubgoals })
    } else if (toolCall.toolName === 'update_subgoal') {
      const { id, status, plan, log } = toolCall.args
      // TODO: Implement subgoals in AgentState
      // For now, we'll store subgoals in the agentContext field as a JSON string
      const currentSubgoals = updatedContext.agentContext ? JSON.parse(updatedContext.agentContext).subgoals || [] : []
      const newSubgoals = currentSubgoals.map((subgoal: any) => {
        if (subgoal.id === id) {
          return {
            ...subgoal,
            ...(status && { status }),
            ...(plan && { plan }),
            ...(log && { logs: [...subgoal.logs, log] }),
          }
        }
        return subgoal
      })
      updatedContext.agentContext = JSON.stringify({ subgoals: newSubgoals })
    }
  }
  
  return updatedContext
}

export function getShortToolInstructions(
  toolNames: ToolName[],
  spawnableAgents: AgentTemplateType[]
): string {
  return toolNames.map(name => `- ${name}`).join('\n')
}

export function getToolsInstructions(
  toolNames: ToolName[],
  spawnableAgents: AgentTemplateType[]
): string {
  const instructions: string[] = []
  
  for (const toolName of toolNames) {
    const schema = toolSchema[toolName]
    if (schema && typeof schema === 'object' && 'shape' in schema && schema.shape) {
      instructions.push(`### ${toolName}`)
      instructions.push(`Parameters: ${Object.keys(schema.shape as Record<string, any>).join(', ')}`)
      instructions.push('')
    } else {
      instructions.push(`### ${toolName}`)
      instructions.push(`Parameters: ${toolParams[toolName].join(', ')}`)
      instructions.push('')
    }
  }
  
  return instructions.join('\n')
}

export function getFilteredToolsInstructions(
  mode: 'normal' | 'ask',
  includeSpawnableAgents: boolean = false
): string {
  // Define which tools are available in each mode
  const normalModeTools: ToolName[] = [
    'add_subgoal',
    'update_subgoal',
    'write_file',
    'str_replace',
    'read_files',
    'find_files',
    'code_search',
    'run_terminal_command',
    'think_deeply',
    'create_plan',
    'browser_logs',
    'read_docs',
    'web_search',
    'end_turn',
  ]
  
  const askModeTools: ToolName[] = [
    'add_subgoal',
    'update_subgoal',
    'read_files',
    'find_files',
    'code_search',
    'think_deeply',
    'create_plan',
    'browser_logs',
    'read_docs',
    'web_search',
    'end_turn',
  ]
  
  const toolNames = mode === 'ask' ? askModeTools : normalModeTools
  return getToolsInstructions(toolNames, [])
}
