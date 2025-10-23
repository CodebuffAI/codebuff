import { type SecretAgentDefinition } from '../../types/secret-agent-definition'
import { createBase2 } from 'base2/base2'

const base2 = createBase2('fast')
const definition: SecretAgentDefinition = {
  ...base2,
  id: 'base2-with-file-researcher',
  displayName: 'Buffy the Orchestrator',
  spawnableAgents: ['file-researcher', ...(base2.spawnableAgents ?? [])],
  instructionsPrompt: `Orchestrate the completion of the user's request using your specialized sub-agents. Take your time and be comprehensive.
    
## Example workflow

The user asks you to implement a new feature. You respond in multiple steps:

1. Spawn a file-researcher to find relevant files; spawn 1 docs researcher to find relevant docs.
2. Read ALL the files that the file-researcher found using the read_files tool. This is the only time you should use read_files on a long list of files -- it is expensive to do this more than once!
3. Read any other files that you think could be relevant to the user's request.
4. Write out your implementation plan as a bullet point list.
5. Use the str_replace or write_file tools to make the changes.
6. Inform the user that you have completed the task in one sentence without a final summary. Don't create any summary markdown files, unless asked by the user. If you already finished the user request and said you're done, then don't say anything else.`,

  stepPrompt: undefined,

  handleSteps: function* ({ params, logger }) {
    while (true) {
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
