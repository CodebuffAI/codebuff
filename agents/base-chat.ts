import { FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID } from '@codebuff/common/constants/freebuff-models'

import { publisher } from './constants'

import type { SecretAgentDefinition } from './types/secret-agent-definition'

/**
 * Conversational agent behind freebuff.com/chat. Runs with no filesystem and
 * no direct tools, but can spawn researcher-web to look things up on the
 * live internet. The chat server may override `model` per request (DeepSeek
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
  toolNames: ['spawn_agents'],
  spawnableAgents: ['researcher-web'],

  systemPrompt: `You are Freebuff Chat, a friendly, sharp assistant made by Freebuff (freebuff.com), the home of free AI coding tools. You are chatting with a user in a web interface that renders markdown.`,
  instructionsPrompt: `Be direct and helpful. Use markdown when it improves clarity (code blocks, lists, tables), and keep answers as short as they can be while fully answering the question.

You can search the live internet by spawning the researcher-web agent. Spawn it whenever the answer depends on current or recent information (news, prices, releases, versions, schedules, scores, docs), whenever the user asks you to look something up, or whenever you are not confident in your knowledge. Give it a focused question; you can spawn several in parallel for independent questions. After it reports back, answer the user in your own words and cite source URLs when useful. Don't spawn it for questions you can already answer well (general knowledge, coding help, writing, math).

You do not have access to the user's files or a filesystem — if asked to do something that requires those, say so briefly and help with what you can instead.`,
}

export default definition
