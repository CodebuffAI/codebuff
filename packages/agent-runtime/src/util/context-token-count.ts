import { countTokens, countTokensJson, countTokensMessages } from './token-counter'

import type { Message } from '@codebuff/common/types/messages/codebuff-message'

/** The slice of AgentState this file needs, so the SDK and the step loop can
 *  both call in without either owning the full type. */
type CountableAgentState = {
  parentId?: string
  messageHistory: Message[]
  contextTokenCount: number
}

/**
 * `contextTokenCount` for an agent whose turn has ended.
 *
 * Inside the step loop the count is taken BEFORE the model call, so it never
 * includes the last step's assistant output or its tool results — systematically
 * the most recently added content, and on a step that read several files easily
 * tens of thousands of tokens. Harmless while it only fed the compaction check;
 * wrong once a host persists it and shows it to the user between turns.
 *
 * Root agents only. The host reads `sessionState.mainAgentState`, so a
 * subagent's final count is discarded along with the subagent — recounting it
 * would tokenize that agent's entire history for a number nobody reads, which
 * on a one-step subagent roughly doubles its tokenizer cost. Same predicate the
 * compaction callback in run-agent-step.ts already uses.
 */
export function recountContextTokens(params: {
  agentState: CountableAgentState
  systemPrompt: string
  toolsForTokenCount: unknown
}): number {
  const { agentState, systemPrompt, toolsForTokenCount } = params
  if (agentState.parentId) return agentState.contextTokenCount
  return (
    countTokensMessages(agentState.messageHistory) +
    countTokens(systemPrompt) +
    countTokensJson(toolsForTokenCount)
  )
}

/**
 * Carry `contextTokenCount` across a history edit made after the last recount.
 *
 * The persistence boundary edits history the runtime has already counted: the
 * SDK drops unanswered tool calls and appends the cancellation / error message
 * that a resumed run starts from. Leaving the count untouched persists a number
 * that does not describe the history stored beside it.
 *
 * A difference rather than a recount, because the editor holds only the
 * history: the system prompt and tool schemas are the other half of the number
 * and are not in scope there. Applying the delta keeps that half exactly, and
 * the estimate stays internally consistent.
 */
export function adjustContextTokenCountForHistoryEdit(params: {
  contextTokenCount: number
  previousHistory: Message[]
  nextHistory: Message[]
}): number {
  const { contextTokenCount, previousHistory, nextHistory } = params
  if (previousHistory === nextHistory) return contextTokenCount
  const delta =
    countTokensMessages(nextHistory) - countTokensMessages(previousHistory)
  // A count carried in from before this shipped need not match its history at
  // all; a negative token count would reach the composer as a negative chip.
  return Math.max(0, contextTokenCount + delta)
}
