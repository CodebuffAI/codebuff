/**
 * Utility functions for agent resolution and prompt building.
 */

import { AGENT_MODE_TO_ID } from './constants'

import type { AgentMode } from './constants'
import type { AgentDefinition, MessageContent } from '@codebuff/sdk'

/**
 * Choose the agent definition by explicit selection or mode-based fallback.
 */
export const resolveAgent = (
  agentMode: AgentMode,
  agentId: string | undefined,
  agentDefinitions: AgentDefinition[],
): AgentDefinition | string => {
  const selectedAgentDefinition =
    agentId && agentDefinitions.length > 0
      ? agentDefinitions.find((definition) => definition.id === agentId)
      : undefined

  return selectedAgentDefinition ?? agentId ?? AGENT_MODE_TO_ID[agentMode]
}

/**
 * Respect bash context, but avoid sending empty prompts when only images are attached.
 */
export const buildPromptWithContext = (
  promptWithBashContext: string,
  messageContent: MessageContent[] | undefined,
): string => {
  const trimmedPrompt = promptWithBashContext.trim()
  if (trimmedPrompt.length > 0) {
    return promptWithBashContext
  }

  if (messageContent && messageContent.length > 0) {
    return 'See attached image(s)'
  }

  return ''
}
