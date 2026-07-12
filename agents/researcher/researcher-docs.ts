import { publisher } from '../constants'

import type { SecretAgentDefinition } from '../types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'researcher-docs',
  publisher,
  displayName: 'Doc',
  spawnerPrompt: `Expert at reading technical documentation of major public libraries and frameworks to find relevant information. (e.g. React, MongoDB, Postgres, etc.)`,
  inputSchema: {
    prompt: {
      type: 'string',
      description:
        'A question you would like answered using technical documentation.',
    },
  },
  outputMode: 'structured_output',
  outputSchema: {
    type: 'object',
    properties: {
      status: { type: 'string', enum: ['answered', 'partial', 'failed'] },
      answer: { type: 'string' },
      source: { type: 'string' },
      version: { type: 'string' },
      failure: { type: 'string' },
    },
    required: ['status', 'answer', 'source', 'version'],
  },
  includeMessageHistory: false,
  toolNames: ['read_docs'],
  spawnableAgents: [],

  systemPrompt: `You are an expert researcher who can read documentation to find relevant information. Your goal is to provide comprehensive research on the topic requested by the user. Use read_docs to get detailed documentation.`,
  instructionsPrompt: `Instructions:
1. Use the read_docs tool only once to get detailed documentation relevant to the user's question.
2. Use the selected Context7 library metadata returned by read_docs for source and version/branch. If alternatives are present, mention ambiguity in failure or answer rather than guessing. Use "unknown" only when metadata is genuinely absent. Include failure when retrieval is incomplete or fails.
  `.trim(),
}

export default definition
