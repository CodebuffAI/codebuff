import { SecretAgentDefinition } from 'types/secret-agent-definition'
import { createBase2 } from './base2'

const definition: SecretAgentDefinition = {
  ...createBase2('fast'),
  id: 'base2-with-files-input',
  displayName: 'Buffy the Fast Orchestrator',

  inputSchema: {
    prompt: {
      type: 'string',
      description: 'A coding task to complete',
    },
    params: {
      type: 'object',
      properties: {
        maxContextLength: {
          type: 'number',
        },
        filesToRead: {
          type: 'array',
          items: {
            type: 'string',
          },
        },
      },
      required: ['filesToRead'],
    },
  },

  handleSteps: function* ({ params }) {
    yield {
      toolName: 'read_files',
      input: { paths: params?.filesToRead || [] },
    }

    let steps = 0
    while (true) {
      steps++
      // Run context-pruner before each step
      yield {
        toolName: 'spawn_agent_inline',
        input: {
          agent_type: 'context-pruner',
          params: params ?? {},
        },
        includeToolCall: false,
      } as any

      const { stepsComplete } = yield 'STEP'
      if (stepsComplete) break
    }
  },
}
export default definition
