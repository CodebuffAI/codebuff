import { createTaskResearcher } from './task-researcher'

const definition = {
  ...createTaskResearcher(),
  id: 'task-researcher-full',
  outputSchema: {
    type: 'object',
    properties: {
      report: {
        type: 'string',
        description:
          'An analysis of the coding task, the cruxes of it, relevant information from web and docs (if relevant), and the key facts and insights about the coding task. Do not include opinions, plans, or recommendations. The research report should be just the facts.',
      },
      relevantFiles: {
        type: 'array',
        items: { type: 'string' },
        description:
          'A comprehensive list of the paths of files that are relevant to the coding task.',
      },
    },
    required: ['analysis', 'keyFacts', 'relevantFiles'],
  },
  instructionsPrompt: `Research the coding task and create a report. Take your time and be comprehensive.
    
## Example workflow

You recieve a coding task to implement a new feature. You do research in multiple "layers" of agents and then compile the information into a report.

1. Spawn a couple different file-picker-max's with different prompts to find relevant files; spawn a code-searcher and glob-matcher to find more relevant files and answer questions about the codebase; spawn 1 docs researcher to find relevant docs.
1a. Read all the relevant files using the read_files tool.
2. Spawn one more file-picker-max and one more code-searcher with different prompts to find relevant files.
2a. Read all the relevant files using the read_files tool.
3. Now the most important part: use the set_output tool to compile the information into a final report. Give a comprehensive, facts-only report of all the useful information you've gathered. Finally, include ALL the relevant files in the report.
Important: the report should not include a plan or recommendations or any other opinion.
4. End your turn.
`,
}
export default definition
