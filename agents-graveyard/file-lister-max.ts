import { publisher } from '../agents/constants'
import {
  PLACEHOLDER,
  type SecretAgentDefinition,
} from '../agents/types/secret-agent-definition'
import type { AssistantMessage } from '../agents/types/util-types'

const definition: SecretAgentDefinition = {
  id: 'file-lister-max',
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
  instructionsPrompt: `PHASE 1 Instructions:
- Do not use any tools.
- Do not write any analysis.
- List out the full paths of up to 12 files that are relevant to the prompt, separated by newlines.
- Write out the following string to signal the end of this phase:
"cb_easp": true

Do not write an introduction. Do not use any tools. Do not write anything else other than the file paths.

PHASE 2 Instructions:
- Do not use any tools.
- Do not write any analysis.
- After reading those files, give your new best guess at the most relevant files, separated by newlines.
  `.trim(),

  handleSteps: function* ({ logger }) {
    const { agentState } = yield 'STEP_ALL'
    const { messageHistory } = agentState
    const lastAssistantMessage = messageHistory.findLast(
      (message) => message.role === 'assistant',
    ) as AssistantMessage
    const lastMessageContent = lastAssistantMessage.content
    const lastMessageStr = Array.isArray(lastMessageContent)
      ? lastMessageContent[0].type === 'text'
        ? lastMessageContent[0].text
        : ''
      : lastMessageContent

    const files = lastMessageStr.split('\n').filter(Boolean)

    yield {
      toolName: 'read_files',
      input: {
        paths: files,
      },
    }

    yield 'STEP_ALL'
  },
}

export default definition
