import { useChatStore } from '../state/chat-store'
import { IS_FREEBUFF } from '../utils/constants'
import { logger } from '../utils/logger'
import { getSystemMessage } from '../utils/message-history'
import { saveSettings, loadSettings } from '../utils/settings'

import type { ChatMessage } from '../types/chat'

export const handleAdsEnable = (): {
  postUserMessage: (messages: ChatMessage[]) => ChatMessage[]
} => {
  logger.info('[gravity] Enabling ads')

  saveSettings({ adsEnabled: true })

  return {
    postUserMessage: (messages) => [
      ...messages,
      getSystemMessage('Ads enabled. You will see contextual ads above the input and earn credits from impressions.'),
    ],
  }
}

export const handleAdsDisable = (): {
  postUserMessage: (messages: ChatMessage[]) => ChatMessage[]
} => {
  logger.info('[gravity] Disabling ads')
  saveSettings({ adsEnabled: false })

  return {
    postUserMessage: (messages) => [
      ...messages,
      getSystemMessage('Ads disabled.'),
    ],
  }
}

export const getAdsEnabled = (): boolean => {
  if (IS_FREEBUFF) return true

  // If no mode provided, get it from the store
  const mode = useChatStore.getState().agentMode

  // In FREE mode, ads are always enabled regardless of saved setting
  if (mode === 'FREE') {
    return true
  }

  // Otherwise, use the saved setting
  const settings = loadSettings()
  return settings.adsEnabled ?? false
}
