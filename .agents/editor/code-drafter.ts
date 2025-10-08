import { publisher } from '../constants'
import { type SecretAgentDefinition } from '../types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'code-drafter',
  displayName: 'Code Drafter',
  publisher,
  model: 'anthropic/claude-sonnet-4.5',
  spawnerPrompt:
    'Writes full implementation plans with complete code changes. Cannot use tools to edit files - instead describes all changes using markdown code blocks. Does not spawn other agents.',
  inputSchema: {
    prompt: {
      type: 'string',
      description: 'The coding task to implement',
    },
  },
  outputMode: 'last_message',
  includeMessageHistory: true,
  inheritParentSystemPrompt: true,
  toolNames: [],
  spawnableAgents: [],

  instructionsPrompt: `You are an expert programmer who writes complete code implementations.

You do not have access to tools to modify files. Instead, you describe all code changes using markdown code blocks.

Instructions:
- Think about the best way to accomplish the task
- Write out the implementation for each file that needs to be changed
- Use markdown code blocks with the file path as the language identifier
- For each file, show the only the code changes needed, don't include the entire file

Guidelines:
- Pay close attention to the user's request and address all requirements
- Focus on the simplest solution that accomplishes the task
- Reuse existing code patterns and conventions from the codebase
- Keep naming consistent with the existing codebase
- Try not to modify more files than necessary
- Avoid comments unless absolutely necessary to understand the code
- Do not add try/catch blocks unless needed
- Do not write duplicate code that could use existing helpers

Format your response with:
\`\`\`path/to/file.ts
// Complete code for this file
\`\`\`
`,
}

export default definition
