import { saveSettings, loadSettings } from '../utils/settings'
import { getSystemMessage } from '../utils/message-history'
import { useChatStore } from '../state/chat-store'
import { logger } from '../utils/logger'

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
