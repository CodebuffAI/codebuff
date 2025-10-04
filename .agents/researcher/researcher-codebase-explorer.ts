import type { SecretAgentDefinition } from '../types/secret-agent-definition'
import { publisher } from '../constants'

const definition: SecretAgentDefinition = {
  id: 'researcher-codebase-explorer',
  publisher,
  model: 'x-ai/grok-4-fast',
  displayName: 'Codebase Explorer',
  spawnerPrompt: `Expert at exploring the codebase to find relevant information using terminal commands.`,
  inputSchema: {
    prompt: {
      type: 'string',
      description:
        'A question you would like answered using technical documentation.',
    },
  },
  outputMode: 'last_message',
  includeMessageHistory: false,
  toolNames: ['code_search', 'run_terminal_command', 'read_files'],
  spawnableAgents: [],

  systemPrompt: `You are an expert software engineer who can explore the codebase to find relevant information using terminal commands. Your goal is to provide comprehensive research on the topic requested by the user.`,
  instructionsPrompt: `Instructions
1. Use the code_search tool to search the codebase for relevant information.
2. Use the run_terminal_command tool to run terminal commands to explore the codebase. (Read-only commands only!)
3. Use the read_files tool to read all the files that could be relevant to the user's question. It's important to read a lot of files to get a comprehensive understanding of the codebase.
4. Repeat the code_search, run_terminal_command, and read_files tool calls until you have gathered all the relevant information.
5. Provide a comprehensive report of the relevant information for the user's prompt. Include key findings, relevant insights, and actionable recommendations.
  `.trim(),
}

export default definition
