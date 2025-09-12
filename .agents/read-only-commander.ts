import { publisher } from './constants'
import {
  PLACEHOLDER,
  type SecretAgentDefinition,
} from './types/secret-agent-definition'

const readOnlyCommander: SecretAgentDefinition = {
  id: 'read-only-commander',
  publisher,
  model: 'openai/gpt-5-chat',
  reasoningOptions: {
    enabled: true,
    effort: 'low',
    exclude: true,
  },
  displayName: 'ReadOnly Commander',
  spawnerPrompt:
    'Can run quick read-only terminal commands and report back on the results. Has a decent understanding of the codebase.',
  inputSchema: {
    prompt: {
      type: 'string',
      description:
        'The question to answer about the codebase or with use of the terminal.',
    },
  },
  outputMode: 'last_message',
  includeMessageHistory: true,
  toolNames: ['run_terminal_command', 'code_search', 'read_files'],
  systemPrompt: `You are an expert software engineer, however you only execute READ ONLY commands to answer the user's question.
  
${PLACEHOLDER.FILE_TREE_PROMPT}
${PLACEHOLDER.KNOWLEDGE_FILES_CONTENTS}`,
  instructionsPrompt: `Use the tools to answer the user's question. But do not invoke any terminal commands that could have any permanent effects -- no editing files, no running scripts, no git commits, no installing packages, etc.`,
}

export default readOnlyCommander
