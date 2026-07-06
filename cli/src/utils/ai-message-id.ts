/**
 * Identity of streamed AI-response messages, kept in a dependency-free leaf
 * module so lightweight consumers (e.g. the ads hook) can discriminate real LLM
 * answers from other 'ai'-variant messages without pulling in the full
 * send-message helper graph.
 */

/** Id prefix identifying streamed AI response shells. */
export const AI_MESSAGE_ID_PREFIX = 'ai-'

export const generateAiMessageId = (): string =>
  `${AI_MESSAGE_ID_PREFIX}${Date.now()}-${Math.random().toString(16).slice(2)}`
