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
      getSystemMessage('Ads enabled. You will see contextual ads above the input.'),
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

  // Codebuff LITE is a paid mode now, so use the normal saved setting.
  const settings = loadSettings()
  return settings.adsEnabled ?? false
}
