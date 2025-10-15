import { publisher } from '../constants'
import {
  PLACEHOLDER,
  type SecretAgentDefinition,
} from '../types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'file-lister',
  displayName: 'Liszt the File Lister',
  publisher,
  model: 'anthropic/claude-haiku-4.5',
  spawnerPrompt: 'Lists files that are relevant to the prompt',
  inputSchema: {
    prompt: {
      type: 'string',
      description: 'A coding task to complete',
    },
  },
  outputMode: 'last_message',
  includeMessageHistory: false,
  toolNames: [],
  spawnableAgents: [],

  systemPrompt: `You are an expert at finding relevant files in a codebase and listing them out. ${PLACEHOLDER.FILE_TREE_PROMPT}`,
  instructionsPrompt: `Instructions:
- Do not use any tools.
- Do not write any analysis.
- List out the full paths of up to 12 files that are relevant to the prompt, separated by newlines.

Do not write an introduction. Do not use any tools. Do not write anything else other than the file paths.
  `.trim(),
}

export default definition
