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
        'The commands to run with use of the terminal. Has no other context about the current task or project, so you must specify everything you want to be done and what information you want back.',
    },
  },
  outputMode: 'last_message',
  includeMessageHistory: false,
  toolNames: ['run_terminal_command'],
  systemPrompt: `You are an expert software engineer, however you only execute READ ONLY terminal commands to answer the user's question. You also cannot spawn any agents.`,
  instructionsPrompt: `Use the run_terminal_command tool to answer the user's question. But do not invoke any terminal commands that could have any permanent effects -- no editing files, no running scripts, no git commits, no installing packages, etc.`,
}

export default readOnlyCommander
