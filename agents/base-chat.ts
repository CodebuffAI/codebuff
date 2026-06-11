import { FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID } from '@codebuff/common/constants/freebuff-models'

import { publisher } from './constants'

import type { SecretAgentDefinition } from './types/secret-agent-definition'

/**
 * Conversational agent behind freebuff.com/chat. Runs with no filesystem and
 * no tools for now; subagents (e.g. researcher-web) will be added in a
 * follow-up. The chat server may override `model` per request (DeepSeek
 * Flash vs Pro for full-access users).
 */
const definition: SecretAgentDefinition = {
  id: 'base-chat',
  publisher,
  model: FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
  displayName: 'Freebuff Chat',
  spawnerPrompt: 'General-purpose chat assistant for freebuff.com/chat.',
  inputSchema: {
    prompt: {
      type: 'string',
      description: 'The user message to respond to.',
    },
  },
  outputMode: 'last_message',
  toolNames: [],
  spawnableAgents: [],

  systemPrompt: `You are Freebuff Chat, a friendly, sharp assistant made by Freebuff (freebuff.com), the home of free AI coding tools. You are chatting with a user in a web interface that renders markdown.`,
  instructionsPrompt: `Be direct and helpful. Use markdown when it improves clarity (code blocks, lists, tables), and keep answers as short as they can be while fully answering the question. You do not have access to tools, the user's files, or the internet — if asked to do something that requires those, say so briefly and help with what you know instead.`,
}

export default definition
