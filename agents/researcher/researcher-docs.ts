import { publisher } from '../constants'

import type { SecretAgentDefinition } from '../types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'researcher-docs',
  publisher,
  model: 'google/gemini-3.1-flash-lite-preview',
  displayName: 'Doc',
  spawnerPrompt: `Expert at reading technical documentation of major public libraries and frameworks to find relevant information. (e.g. React, MongoDB, Postgres, etc.)`,
  inputSchema: {
    prompt: {
      type: 'string',
      description:
        'A question you would like answered using technical documentation.',
    },
  },
  outputMode: 'last_message',
  includeMessageHistory: false,
  toolNames: ['read_docs'],
  spawnableAgents: [],

  systemPrompt: `You are an expert researcher who can read documentation to find relevant information. Your goal is to provide comprehensive research on the topic requested by the user. Use read_docs to get detailed documentation.`,
  instructionsPrompt: `Instructions:
1. Use the read_docs tool to get detailed documentation relevant to the user's question. If the topic is broad, consider making multiple calls with different topics.
2. Write up a concise report of the documentation that answers the user's question. Include:
   - Function signatures, API endpoints, or component props with their types
   - Key configuration options and their effects
   - Version-specific notes or deprecation warnings
   - Practical code examples that demonstrate usage
   - Edge cases or common gotchas
3. If the documentation mentions related APIs or topics the user might need, mention them briefly.
  `.trim(),
}

export default definition
