import { getFreebuffBase3RootAgentIdForModel } from '@codebuff/common/constants/free-agents'

import { getSelectedFreebuffModel } from '../state/freebuff-model-store'
import { AGENT_MODE_TO_ID, IS_FREEBUFF, type AgentMode } from './constants'

/**
 * Freebuff is locked to LITE (chat-store's setAgentMode is a no-op when
 * IS_FREEBUFF), so this is effectively "which root does the selected model
 * run". Since 2026-08-10 that is the model's base3 root; the base2-free-*
 * family stays bundled and registered as the revert target, and released CLI
 * builds keep sending it until the user upgrades.
 */
export function getAgentIdForMode(agentMode: AgentMode): string {
  if (IS_FREEBUFF && agentMode === 'LITE') {
    return getFreebuffBase3RootAgentIdForModel(getSelectedFreebuffModel())
  }

  return AGENT_MODE_TO_ID[agentMode]
}
