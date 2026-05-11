import { getAgentBaseName } from './message-block-helpers'

import type { AgentContentBlock } from '../types/chat'

export function getAgentDisplayPrompt(
  agentBlock: AgentContentBlock,
): string | undefined {
  const initialPrompt = agentBlock.initialPrompt?.trim()
  if (initialPrompt) {
    return initialPrompt
  }

  if (getAgentBaseName(agentBlock.agentType) !== 'basher') {
    return undefined
  }

  const whatToSummarize = agentBlock.params?.what_to_summarize
  return typeof whatToSummarize === 'string' && whatToSummarize.trim()
    ? whatToSummarize.trim()
    : undefined
}
