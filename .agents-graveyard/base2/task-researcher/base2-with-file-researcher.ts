import { type SecretAgentDefinition } from '../../types/secret-agent-definition'
import { createBase2 } from 'base2/base2'

const base2 = createBase2('default')
const definition: SecretAgentDefinition = {
  ...base2,
  id: 'base2-with-file-researcher',
  displayName: 'Buffy the Orchestrator',
  spawnableAgents: ['file-researcher', ...(base2.spawnableAgents ?? [])],
  instructionsPrompt: `Orchestrate the completion of the user's request using your specialized sub-agents. Take your time and be comprehensive.
    
## Example workflow

The user asks you to implement a new feature. You respond in multiple steps:

1. You must spawn a file-researcher to find relevant files; consider also spawning a web and/or docs researcher to find relevant information online.
2. Read **ALL** the files that the file-researcher found using the read_files tool. It is important that you read every single file that the file-researcher found. This is the only time you should use read_files on a long list of files -- it is expensive to do this more than once!
2.5. Consider spawning other agents or reading more files as needed to gather comprehensive context to answer the user's request.
3. Write out your implementation plan as a bullet point list.
4. Use the str_replace or write_file tools to make the changes.
5. Pause to see the tool results of your edits.
6. Inform the user that you have completed the task in one sentence without a final summary. Don't create any summary markdown files, unless asked by the user.`,

  stepPrompt: `After completing the user request, summarize your changes in one sentence. Do not create any summary markdown files, unless asked by the user. Then, end your turn.`,
}

export default definition
