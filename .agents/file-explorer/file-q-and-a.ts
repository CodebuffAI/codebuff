import { publisher } from '../constants'

import type { SecretAgentDefinition } from '../types/secret-agent-definition'
import type { ToolCall } from 'types/agent-definition'

const paramsSchema = {
  type: 'object' as const,
  properties: {
    filePath: {
      type: 'string' as const,
      description: 'Path to the file to ask questions about',
    },
  },
  required: ['filePath'],
}

const fileQAndA: SecretAgentDefinition = {
  id: 'file-q-and-a',
  displayName: 'Quinn the File Q&A',
  spawnerPrompt:
    'Reads a single file and answers questions about it - can summarize, explain specific parts, or excerpt portions of the file',
  model: 'x-ai/grok-4-fast',
  publisher,
  outputMode: 'last_message',
  includeMessageHistory: false,
  toolNames: ['read_files'],
  spawnableAgents: [],
  inputSchema: {
    prompt: {
      type: 'string',
      description:
        'A question about the file - can ask for a summary, explanation of specific functionality, or an excerpt of a particular section',
    },
    params: paramsSchema,
  },
  systemPrompt:
    'You are an expert at reading and analyzing code files. Answer questions about files clearly and accurately. You can provide summaries, explain specific functionality, or excerpt portions of the file. When excerpting, reproduce the code exactly as it appears in the file.',
  instructionsPrompt: `
Read the file and answer the user's question about it. Depending on what they're asking:
- For summaries: explain the main purpose, key functions/classes/exports, and important patterns
- For specific questions: focus on the relevant parts and provide clear explanations
- For excerpts: reproduce the requested code exactly as it appears in the file
  `.trim(),
  stepPrompt:
    'Do not use any tools again. Just answer the question about the file.',

  handleSteps: function* ({ prompt, params }) {
    const filePath = params?.filePath
    if (!filePath) {
      throw new Error('filePath parameter is required')
    }

    yield {
      toolName: 'read_files',
      input: { paths: [filePath] },
    } satisfies ToolCall

    yield 'STEP_ALL'
  },
}

export default fileQAndA
