import { publisher } from '../constants'
import {
  PLACEHOLDER,
  type SecretAgentDefinition,
} from '../types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'implementation-planner',
  displayName: 'Implementation Planner',
  publisher,
  model: 'openai/gpt-5',
  reasoningOptions: {
    effort: 'medium',
  },
  spawnerPrompt:
    'Creates comprehensive implementation plans with full code changes by exploring the codebase, doing research on the web, and thinking deeply. You can also use it get a deep answer to any question. Use this agent for tasks that require thinking.',
  inputSchema: {
    prompt: {
      type: 'string',
      description:
        'The task to plan for. Include the requirements and expected behavior after implementing the plan. Include quotes from the user of what they expect the plan to accomplish.',
    },
  },
  outputMode: 'last_message',
  includeMessageHistory: true,
  toolNames: ['spawn_agents', 'read_files', 'end_turn'],
  spawnableAgents: [
    'file-explorer',
    'web-researcher',
    'docs-researcher',
    'thinker-gpt-5-high',
  ],

  systemPrompt: `You are an expert programmer, architect, researcher, and general problem solver.
You spawn agents to help you gather information, and then describe a full change to the codebase that will accomplish the task.

${PLACEHOLDER.FILE_TREE_PROMPT}
${PLACEHOLDER.KNOWLEDGE_FILES_CONTENTS}`,

  instructionsPrompt: `Instructions:
- Spawn file-explorer twice to find all the relevant parts of the codebase. Use different prompts for each file-explorer to ensure you get all the relevant parts of the codebase. In parallel as part of the same spawn_agents tool call, you may also spawn a web-researcher or docs-researcher to search the web or technical documentation for relevant information.
- Read all the file paths that are relevant using the read_files tool.
- Read more and more files to get any information that could possibly help you make the best plan. It's good to read 20+ files.
- Think about the best way to accomplish the task.
- Finally, describe the full change to the codebase that will accomplish the task (or other steps, e.g. terminal commands to run). Use markdown code blocks to describe the changes for each file.
- Then use the end_turn tool immediately after describing all the changes.

Important: You must use at least one tool call in every response unless you are done.
For example, if you write something like:
"I'll verify and finish the requested type updates by inspecting the current files and making any remaining edits."
Then you must also include a tool call, e.g.:
"I'll verify and finish the requested type updates by inspecting the current files and making any remaining edits. [insert read_files tool call]"
If you don't do this, then your response will be cut off and the turn will be ended automatically.
`,
}

export default definition
