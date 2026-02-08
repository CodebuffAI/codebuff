import React, { useState, useEffect } from 'react'

import { BottomBanner } from './bottom-banner'
import { Button } from './button'
import { useTheme } from '../hooks/use-theme'
import { useChatStore } from '../state/chat-store'
import {
  getByokAnthropicStatus,
  clearByokAnthropicConfig,
  getCurrentByokStep,
  resetByokFlow,
  maskApiKey,
} from '../utils/anthropic-byok'

export const AnthropicConnectBanner = () => {
  const setInputMode = useChatStore((state) => state.setInputMode)
  // Subscribe to message count so banner re-renders when router adds system messages after each step
  const _messageCount = useChatStore((state) => state.messages.length)
  const theme = useTheme()
  const [isDisconnectHovered, setIsDisconnectHovered] = useState(false)

  const status = getByokAnthropicStatus()
  const step = getCurrentByokStep()

  // Reset step flow when entering the banner while not connected
  useEffect(() => {
    if (!status.connected) {
      resetByokFlow()
    }
  }, [])

  const handleDisconnect = () => {
    clearByokAnthropicConfig()
    resetByokFlow()
    setInputMode('default')
  }

  const handleClose = () => {
    resetByokFlow()
    setInputMode('default')
  }

  // Connected state
  if (status.connected && status.config) {
    const { config } = status
    return (
      <BottomBanner borderColorKey="success" onClose={handleClose}>
        <box style={{ flexDirection: 'column', gap: 0, flexGrow: 1 }}>
          <text style={{ fg: theme.success }}>✓ Connected to Anthropic API</text>
          <box style={{ flexDirection: 'column', marginTop: 1 }}>
            <text style={{ fg: theme.muted }}>API Key: {maskApiKey(config.apiKey)}</text>
            {config.baseUrl && (
              <text style={{ fg: theme.muted }}>Base URL: {config.baseUrl}</text>
            )}
            {config.models && (
              <text style={{ fg: theme.muted }}>Models: {config.models}</text>
            )}
          </box>
          <box style={{ flexDirection: 'row', gap: 2, marginTop: 1 }}>
            <Button
              onClick={handleDisconnect}
              onMouseOver={() => setIsDisconnectHovered(true)}
              onMouseOut={() => setIsDisconnectHovered(false)}
            >
              <text
                style={{ fg: isDisconnectHovered ? theme.error : theme.muted }}
              >
                Disconnect
              </text>
            </Button>
          </box>
        </box>
      </BottomBanner>
    )
  }

  // Not connected - show step instructions

  return (
    <BottomBanner borderColorKey="info" onClose={handleClose}>
      <box style={{ flexDirection: 'column', gap: 0, flexGrow: 1 }}>
        <text style={{ fg: theme.info }}>Connect Anthropic API</text>
        {step === 'api-key' && (
          <text style={{ fg: theme.muted, marginTop: 1 }}>
            Enter your Anthropic API key (from console.anthropic.com):
          </text>
        )}
        {step === 'base-url' && (
          <box style={{ flexDirection: 'column', marginTop: 1 }}>
            <text style={{ fg: theme.muted }}>
              Enter base URL for your API/proxy, or press Enter for default:
            </text>
            <text style={{ fg: theme.muted }}>
              (default: https://api.anthropic.com)
            </text>
          </box>
        )}
        {step === 'models' && (
          <box style={{ flexDirection: 'column', marginTop: 1 }}>
            <text style={{ fg: theme.muted }}>
              Enter model aliases, or press Enter to skip:
            </text>
            <text style={{ fg: theme.muted }}>
              (format: haiku:model-id,sonnet:model-id,opus:model-id)
            </text>
          </box>
        )}
      </box>
    </BottomBanner>
  )
}
