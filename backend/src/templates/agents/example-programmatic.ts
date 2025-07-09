import { z } from 'zod/v4'
import {
  ProgrammaticAgentTemplate,
  ProgrammaticAgentContext,
  ProgrammaticAgentFunction,
} from '../types'
import { baseAgentToolNames, baseAgentSpawnableAgents } from '../types'

// Example generator function
const exampleHandler: ProgrammaticAgentFunction = function* (
  context: ProgrammaticAgentContext
) {
  // This is a simple example that just returns a greeting
  const greeting = `Hello! You said: "${context.prompt}"`

  // In a real implementation, you could yield tool calls here:
  // yield { toolName: 'read_files', toolCallId: 'example', args: { paths: ['README.md'] } }
  // const toolResult = yield // This would receive the tool result

  // For now, just return the greeting
  return greeting
}

export const exampleProgrammatic: ProgrammaticAgentTemplate = {
  type: 'example_programmatic',
  implementation: 'programmatic',
  name: 'Example Programmatic Agent',
  description:
    'A simple example of a programmatic agent using direct generator functions',
  handler: exampleHandler,
  includeMessageHistory: true,
  promptSchema: {
    prompt: z.string().optional(),
    params: z.any().optional(),
  },
  toolNames: baseAgentToolNames,
  spawnableAgents: baseAgentSpawnableAgents,
}
