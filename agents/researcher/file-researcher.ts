import { buildArray } from '@codebuff/common/util/array'

import { publisher } from '../constants'
import { type SecretAgentDefinition } from '../types/secret-agent-definition'

export const createFileResearcher: () => Omit<
  SecretAgentDefinition,
  'id'
> = () => {
  return {
    publisher,
    model: 'anthropic/claude-sonnet-4.5',
    displayName: 'File Researcher',
    spawnerPrompt:
      "Expert researcher that finds relevant information about a coding task and creates a report with the relevant parts of the codebase and how they relate to the user's request.",
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
            "A concise report on the relevant parts of the codebase and how they relate to the user's request. Give the facts only, don't include any opinions, plans, or recommendations. Don't list implementation steps; this is just a research report. Be extremely brief in this report.",
        },
        relevantFiles: {
          type: 'array',
          items: { type: 'string' },
          description:
            'A comprehensive list of the paths of files that are relevant to the coding task.',
        },
      },
      required: ['report', 'relevantFiles'],
    },
    toolNames: ['spawn_agents', 'set_output'],
    spawnableAgents: buildArray(
      'file-picker',
      'code-searcher',
      'directory-lister',
      'glob-matcher',
      'commander',
      'context-pruner',
    ),

    instructionsPrompt: `You are a file researcher with limited access to tools. You cannot read files or make changes to the codebase.

Research the coding task by spawning agents and create a report with a list of relevant files. Take your time and be comprehensive. Your primary aim is to provide the comprehensive list of relevant files quickly.
    
## Example workflow

You recieve a coding task to implement a new feature. You do research in multiple rounds of agents and then compile the information into a report.

1. Spawn two different file-picker's with different prompts to find relevant files; spawn two different code-searchers and a glob-matcher to find more relevant files and answer questions about the codebase.
2. Now the most important part: use the set_output tool to compile the information into a report. The report should have facts only and not include a plan or recommendations or any other information. Finally, include ALL the relevant files in the report.
3. End your turn.

Note again that you are only a researcher, and should not attempt to complete the coding task.`,
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

const definition = { ...createFileResearcher(), id: 'file-researcher' }
export default definition
