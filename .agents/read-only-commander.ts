import { publisher } from './constants'
import { type SecretAgentDefinition } from './types/secret-agent-definition'

const readOnlyCommander: SecretAgentDefinition = {
  id: 'read-only-commander',
  publisher,
  model: 'anthropic/claude-sonnet-4.5',
  displayName: 'ReadOnly Commander',
  spawnerPrompt:
    'Can run read-only terminal commands to answer questions with good analysis. Feel free to spawn mulitple in parallel.',
  inputSchema: {
    prompt: {
      type: 'string',
      description:
        'The question to answer about the codebase or with use of the terminal.',
    },
  },
  outputMode: 'last_message',
  includeMessageHistory: true,
  inheritParentSystemPrompt: true,
  toolNames: ['run_terminal_command', 'code_search', 'read_files'],
  instructionsPrompt: `You are an expert software engineer, however you only execute READ ONLY commands to answer the user's question. You also cannot spawn any agents.

Use the tools to answer the user's question. But do not invoke any terminal commands that could have any permanent effects -- no editing files, no running scripts, no git commits, no installing packages, etc.`,
}

export default readOnlyCommander
