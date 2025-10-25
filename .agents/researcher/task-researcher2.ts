import { buildArray } from '@codebuff/common/util/array'

import { publisher } from '../constants'
import { type SecretAgentDefinition } from '../types/secret-agent-definition'

export const createTaskResearcher2: () => Omit<
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
    },
    includeMessageHistory: true,
    inheritParentSystemPrompt: true,
    outputMode: 'structured_output',
    outputSchema: {
      type: 'object',
      properties: {
        report: {
          type: 'string',
          description:
            "A concise report on the relevant parts of the codebase or search results and how they relate to the user's request. Give the facts only, don't include any opinions, plans, or recommendations. Don't list implementation steps; this is just a research report.",
        },
        relevantFiles: {
          type: 'array',
          items: { type: 'string' },
          description:
            'A comprehensive list of the paths of ALL the files that are relevant to the coding task.',
        },
      },
      required: ['report', 'relevantFiles'],
    },
    toolNames: ['spawn_agents', 'read_files', 'set_output'],
    spawnableAgents: buildArray(
      'file-picker-max',
      'code-searcher',
      'directory-lister',
      'glob-matcher',
      'researcher-web',
      'researcher-docs',
      'commander',
      'context-pruner',
    ),

    instructionsPrompt: `Research the coding task and create a report. Take your time and be comprehensive.
    
## Example workflow

You recieve a coding task to implement a new feature. You do research in multiple "layers" of agents and then compile the information into a report.

1. Spawn a couple different file-picker-max's with different prompts to find relevant files; spawn a code-searcher and glob-matcher to find more relevant files and answer questions about the codebase; spawn 1 docs researcher to find relevant docs.
1a. Read all the relevant files using the read_files tool.
2. Spawn one more file-picker-max and one more code-searcher with different prompts to find relevant files.
3. Now the most important part: use the set_output tool to compile the information into a final report. Include **ALL** the relevant files in the report so we can have comprehensive context to answer the user's request.
Important: the report should only include the analysis of the coding task, key facts, and insights. It should not include a step-by-step implementation plan or recommendations or any other opinion.
4. End your turn.
`,

    stepPrompt: `Don't forget to spawn agents that could help, especially: the file-picker-max, code-searcher, glob-matcher, researcher-web, researcher-docs, and the decomposing-thinker agent to help figure out key facts and insights.`,

    handleSteps: function* () {
      while (true) {
        // Run context-pruner before each step
        yield {
          toolName: 'spawn_agent_inline',
          input: {
            agent_type: 'context-pruner',
            params: {},
          },
          includeToolCall: false,
        } as any

        const { stepsComplete } = yield 'STEP'
        if (stepsComplete) break
      }
    },
  }
}

const definition = { ...createTaskResearcher2(), id: 'task-researcher2' }
export default definition
