import { saveSettings, loadSettings } from '../utils/settings'
import { getCliEnv } from '../utils/env'
import { getSystemMessage } from '../utils/message-history'
import { logger } from '../utils/logger'

import type { ChatMessage } from '../types/chat'

export const handleAdsEnable = (): {
  postUserMessage: (messages: ChatMessage[]) => ChatMessage[]
} => {
  const apiKey = getCliEnv().GRAVITY_API_KEY
  logger.info({ hasApiKey: !!apiKey }, '[gravity] Enabling ads')
  
  saveSettings({ adsEnabled: true })

  if (!apiKey) {
    return {
      postUserMessage: (messages) => [
        ...messages,
        getSystemMessage('Ads enabled, but GRAVITY_API_KEY is not set. Set the environment variable to see ads.'),
      ],
    }
  }

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
  const settings = loadSettings()
  return settings.adsEnabled ?? false
}
