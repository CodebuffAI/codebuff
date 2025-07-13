import { z } from 'zod/v4'
import { ProgrammaticAgentTemplate } from '../types'

export const exampleProgrammatic: ProgrammaticAgentTemplate = {
  id: 'example_programmatic',
  implementation: 'programmatic',
  name: 'Example Programmatic Agent',
  description:
    'A simple example of a programmatic agent using file-based handler loading',
  handler:
    'backend/src/features/agents/templates/static/handlers/example-handler.ts',
  includeMessageHistory: true,
  promptSchema: {
    prompt: z.string().optional(),
    params: z.any().optional(),
  },
  toolNames: ['update_report'] as const,
  spawnableAgents: [],
}
