import React, { useEffect, useState } from 'react'

import { BottomBanner } from './bottom-banner'
import { Button } from './button'
import { useTheme } from '../hooks/use-theme'
import { useChatStore } from '../state/chat-store'
import {
  disconnectChatGptOAuth,
  exchangeChatGptCodeForTokens,
  getChatGptOAuthStatus,
  openChatGptOAuthInBrowser,
} from '../utils/chatgpt-oauth'

type FlowState =
  | 'checking'
  | 'not-connected'
  | 'waiting-for-code'
  | 'connected'
  | 'error'

export const ChatGptConnectBanner = () => {
  const setInputMode = useChatStore((state) => state.setInputMode)
  const theme = useTheme()
  const [flowState, setFlowState] = useState<FlowState>('checking')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const status = getChatGptOAuthStatus()
    if (status.connected) {
      setFlowState('connected')
      return
    }

    setFlowState('waiting-for-code')
    openChatGptOAuthInBrowser().catch((err) => {
      setError(err instanceof Error ? err.message : 'Failed to open browser')
      setFlowState('error')
    })
  }, [])

  const handleConnect = async () => {
    try {
      setFlowState('waiting-for-code')
      await openChatGptOAuthInBrowser()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open browser')
      setFlowState('error')
    }
  }

  const handleDisconnect = () => {
    disconnectChatGptOAuth()
    setFlowState('not-connected')
  }

  const handleClose = () => setInputMode('default')

  if (flowState === 'connected') {
    const status = getChatGptOAuthStatus()
    const connectedDate = status.connectedAt
      ? new Date(status.connectedAt).toLocaleDateString()
      : 'Unknown'

    return (
      <BottomBanner borderColorKey="success" onClose={handleClose}>
        <box style={{ flexDirection: 'column', gap: 0 }}>
          <text style={{ fg: theme.success }}>✓ Connected to ChatGPT</text>
          <text style={{ fg: theme.muted, marginTop: 1 }}>
            Streaming requests for supported OpenAI models can now route directly through your ChatGPT subscription.
          </text>
          <box style={{ flexDirection: 'row', gap: 2, marginTop: 1 }}>
            <text style={{ fg: theme.muted }}>Since {connectedDate}</text>
            <text style={{ fg: theme.muted }}>·</text>
            <Button onClick={handleDisconnect}>
              <text style={{ fg: theme.error }}>Disconnect</text>
            </Button>
          </box>
        </box>
      </BottomBanner>
    )
  }

  if (flowState === 'error') {
    return (
      <BottomBanner
        borderColorKey="error"
        text={`Error: ${error ?? 'Unknown error'}. Press Escape to close.`}
        onClose={handleClose}
      />
    )
  }

  if (flowState === 'waiting-for-code') {
    return (
      <BottomBanner borderColorKey="info" onClose={handleClose}>
        <box style={{ flexDirection: 'column', gap: 0 }}>
          <text style={{ fg: theme.info }}>Waiting for ChatGPT authorization</text>
          <text style={{ fg: theme.muted, marginTop: 1 }}>
            Complete sign-in in your browser, then paste the auth code or callback URL here.
          </text>
        </box>
      </BottomBanner>
    )
  }

  return (
    <BottomBanner borderColorKey="info" onClose={handleClose}>
      <box style={{ flexDirection: 'column', gap: 0 }}>
        <text style={{ fg: theme.info }}>Connect to ChatGPT</text>
        <Button onClick={handleConnect}>
          <text style={{ fg: theme.link, marginTop: 1 }}>Click to connect →</text>
        </Button>
      </box>
    </BottomBanner>
  )
}

export async function handleChatGptAuthCode(code: string): Promise<{
  success: boolean
  message: string
}> {
  try {
    await exchangeChatGptCodeForTokens(code)
    return {
      success: true,
      message:
        'Successfully connected your ChatGPT subscription! Codebuff will use it for supported OpenAI streaming requests.',
    }
  } catch (err) {
    return {
      success: false,
      message:
        err instanceof Error
          ? err.message
          : 'Failed to exchange ChatGPT authorization code',
    }
  }
}
