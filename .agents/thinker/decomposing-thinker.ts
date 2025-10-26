import { publisher } from '../constants'

import type { SecretAgentDefinition } from '../types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'decomposing-thinker',
  publisher,
  model: 'anthropic/claude-sonnet-4.5',
  displayName: 'Decomposing Thinker',
  spawnerPrompt:
    'Creates comprehensive analysis by decomposing problems into multiple thinking angles and synthesizing insights from parallel thinker agents. Takes a list of files as context.',
  inputSchema: {
    params: {
      type: 'object',
      properties: {
        prompts: {
          type: 'array',
          items: {
            type: 'string',
            description: 'A specific problem or topic to analyze',
          },
          description: 'A list of 2-8 specific problems or topics to analyze',
        },
        filePaths: {
          type: 'array',
          items: {
            type: 'string',
            description: 'The path to a file',
          },
          description:
            'A list of relevant file paths. Try to provide as many as possible that could be relevant to your request.',
        },
      },
      required: ['prompts'],
    },
  },
  outputMode: 'structured_output',
  toolNames: ['spawn_agents', 'set_output'],
  spawnableAgents: ['thinker-with-files-input'],

  handleSteps: function* ({ params }) {
    const prompts: string[] = params?.prompts ?? []
    const filePaths: string[] = params?.filePaths ?? []

    if (prompts.length > 1) {
      // Prompt cache with a dummy thinker first!
      const prompt = `We are prompt caching the above files. This is a warm-up request so that subsequent (parallel!) requests can be cached. Please respond with just the phrase: 'The context is now cached!'. It's important that you don't include any other text or reasoning in your response, since that would increase latency and cost for this request, which is just meant to warm up the cache before firing off the real requests in parallel.`
      yield {
        toolName: 'spawn_agents',
        input: {
          agents: [
            {
              agent_type: 'thinker-with-files-input',
              prompt,
              params: { filePaths },
            },
          ],
        },
      }
    }

    const { toolResult } = yield {
      toolName: 'spawn_agents',
      input: {
        agents: prompts.map((promptText) => ({
          agent_type: 'thinker-with-files-input',
          prompt: promptText,
          params: {
            filePaths,
          },
        })),
      },
    }

    const thoughts = toolResult
      ? toolResult.map((result) =>
          result.type === 'json' ? result.value : '',
        )[0]
      : []
    yield {
      toolName: 'set_output',
      input: { thoughts },
    }
  },
}

export default definition
