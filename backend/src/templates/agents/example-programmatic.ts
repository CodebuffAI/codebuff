import { z } from 'zod/v4'
import {
  ProgrammaticAgentContext,
  ProgrammaticAgentFunction,
  ProgrammaticAgentTemplate,
} from '../types'

// Example generator function
const exampleHandler: ProgrammaticAgentFunction = function* (
  context: ProgrammaticAgentContext
) {
  // This is a simple example that just returns a greeting
  const greeting = `Hello! You said: "${context.prompt}"`

  yield {
    toolName: 'update_report' as const,
    args: {
      json_update: {
        greeting,
      },
    },
  }
}

export const exampleProgrammatic: ProgrammaticAgentTemplate = {
  id: 'example_programmatic',
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
  toolNames: ['update_report'] as const,
  spawnableAgents: [],
}
