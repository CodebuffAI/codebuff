import { getFreebuffRootAgentIdForModel } from '@codebirds/common/constants/free-agents'

import { getSelectedFreebuffModel } from '../state/codebirds-model-store'
import { AGENT_MODE_TO_ID, IS_CODEBIRDS, type AgentMode } from './constants'

export function getAgentIdForMode(agentMode: AgentMode): string {
  if (IS_CODEBIRDS && agentMode === 'LITE') {
    return getFreebuffRootAgentIdForModel(getSelectedFreebuffModel())
  }

  return AGENT_MODE_TO_ID[agentMode]
}
