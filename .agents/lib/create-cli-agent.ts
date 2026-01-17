import type { AgentDefinition } from '../types/agent-definition'
import type { CliAgentConfig } from './cli-agent-types'
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

  const baseInputParams = {
    mode: {
      type: 'string' as const,
      enum: ['test', 'review'],
      description: `Operation mode - "test" for CLI testing (default), "review" for code review via ${config.cliName}`,
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
          'Description of what to do. For test mode: what CLI functionality to test. For review mode: what code to review and any specific concerns.',
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
