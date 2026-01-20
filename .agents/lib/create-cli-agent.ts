import type { AgentDefinition } from '../types/agent-definition'
import type { CliAgentConfig } from './cli-agent-types'
import { CLI_AGENT_MODES } from './cli-agent-types'
import { outputSchema } from './cli-agent-schemas'
import {
  getSpawnerPrompt,
  getSystemPrompt,
  getInstructionsPrompt,
} from './cli-agent-prompts'

export function createCliAgent(config: CliAgentConfig): AgentDefinition {
  // Simple validation for shortName since it's used in file paths
  if (!/^[a-z0-9-]+$/.test(config.shortName)) {
    throw new Error(
      `CliAgentConfig '${config.id}': shortName must be lowercase alphanumeric with hyphens, got '${config.shortName}'`
    )
  }

  const defaultMode = config.defaultMode ?? 'work'
  const modeDescriptions = {
    work: 'implementation tasks',
    review: `code review via ${config.cliName}`,
  }
  const modeDescParts = CLI_AGENT_MODES.map(mode => {
    const isDefault = mode === defaultMode
    return `"${mode}" for ${modeDescriptions[mode]}${isDefault ? ' (default)' : ''}`
  })

  const baseInputParams = {
    mode: {
      type: 'string' as const,
      enum: [...CLI_AGENT_MODES],
      description: `Operation mode - ${modeDescParts.join(', ')}`,
    },
  }

  const inputParams = config.extraInputParams
    ? { ...baseInputParams, ...config.extraInputParams }
    : baseInputParams

  return {
    id: config.id,
    displayName: config.displayName,
    model: config.model,

    spawnerPrompt: getSpawnerPrompt(config),

    inputSchema: {
      prompt: {
        type: 'string' as const,
        description:
          'Description of what to do. For work mode: implementation task to complete. For review mode: code to review.',
      },
      params: {
        type: 'object' as const,
        properties: inputParams,
      },
    },

    outputMode: 'structured_output',
    outputSchema,
    includeMessageHistory: false,

    toolNames: ['run_terminal_command', 'read_files', 'code_search', 'set_output'],

    systemPrompt: getSystemPrompt(config),
    instructionsPrompt: getInstructionsPrompt(config),
  }
}
