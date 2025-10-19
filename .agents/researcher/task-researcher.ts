import { buildArray } from '@codebuff/common/util/array'

import { publisher } from '../constants'
import {
  PLACEHOLDER,
  type SecretAgentDefinition,
} from '../types/secret-agent-definition'

export const createTaskResearcher: () => Omit<
  SecretAgentDefinition,
  'id'
> = () => {
  return {
    publisher,
    model: 'anthropic/claude-sonnet-4.5',
    displayName: 'Task Researcher',
    spawnerPrompt:
      'Expert researcher that finds relevant information about a coding task and creates a report with the key facts and relevant files.',
    inputSchema: {
      prompt: {
        type: 'string',
        description: 'A coding task to research',
      },
      params: {
        type: 'object',
        properties: {
          maxContextLength: {
            type: 'number',
          },
        },
        required: [],
      },
    },
    outputMode: 'structured_output',
    outputSchema: {
      type: 'object',
      properties: {
        analysis: {
          type: 'string',
          description: 'An analysis of the coding task and the cruxes of it.',
        },
        keyFacts: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Key research facts and insights. These are NOT recommendations or opinions. They are just important facts that could affect the implementation of the coding task. Include the bulk of your findings here. You will be judged on how comprehensive and accurate these facts are.',
        },
        relevantFiles: {
          type: 'array',
          items: { type: 'string' },
          description:
            'A comprehensive list of the paths of files that are relevant to the coding task.',
        },
      },
      required: ['report'],
    },
    includeMessageHistory: false,
    toolNames: ['spawn_agents', 'read_files', 'set_output'],
    spawnableAgents: buildArray(
      'file-picker-max',
      'code-searcher',
      'directory-lister',
      'glob-matcher',
      'researcher-web',
      'researcher-docs',
      'commander',
      'decomposing-thinker',
      'context-pruner',
    ),

    systemPrompt: `You are an expert software engineer and researcher that finds information and insights about a coding task and creates a report.

# Layers

You spawn agents in "layers". Each layer is one spawn_agents tool call composed of multiple agents that answer your questions and do research.

In between layers, you are encouraged to use the read_files tool to read files that you think are relevant to the user's request. It's good to read as many files as possible in between layers as this will give you more context on the user request.

Continue to spawn layers of agents until have all the information you could possibly need to create a report.

${PLACEHOLDER.FILE_TREE_PROMPT_SMALL}
`,

    instructionsPrompt: `Research the coding task and create a report. Take your time and be comprehensive.
    
## Example workflow

You recieve a coding task to implement a new feature. You do research in multiple "layers" of agents and then compile the information into a report.

1. Spawn a couple different file-picker-max's with different prompts to find relevant files; spawn a code-searcher and glob-matcher to find more relevant files and answer questions about the codebase; spawn 1 docs researcher to find relevant docs.
1a. Read all the relevant files using the read_files tool.
2. Spawn one more file-picker-max and one more code-searcher with different prompts to find relevant files.
2a. Read all the relevant files using the read_files tool.
3. Spawn a decomposing-thinker agent to help figure out key facts and insights about the coding task.
3a. Read any remaining relevant files using the read_files tool.
4. Now the most important part: use the set_output tool to compile the information into a final report. Start with the analysis, and then put the most effort into the key facts list, which should be comprehensive. Finally, include ALL the relevant files in the report.`,

    stepPrompt: `Don't forget to spawn agents that could help, especially: the file-picker-max and find-all-referencer to get codebase context, and the decomposing-thinker agent to help figure out key facts and insights.`,

    handleSteps: function* ({ prompt, params }) {
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
}

const definition = { ...createTaskResearcher(), id: 'task-researcher' }
export default definition
