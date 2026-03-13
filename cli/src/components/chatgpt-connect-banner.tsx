import React, { useEffect, useState } from 'react'

import { Button } from './button'
import { useTheme } from '../hooks/use-theme'
import {
  connectChatGptOAuth,
  disconnectChatGptOAuth,
  exchangeChatGptCodeForTokens,
  getChatGptOAuthStatus,
  stopChatGptOAuthServer,
} from '../utils/chatgpt-oauth'
import { BORDER_CHARS } from '../utils/ui-constants'

type FlowState =
  | 'checking'
  | 'not-connected'
  | 'waiting-for-code'
  | 'connected'
  | 'error'

export const ChatGptConnectBanner = () => {
  const theme = useTheme()
  const [flowState, setFlowState] = useState<FlowState>('checking')
  const [error, setError] = useState<string | null>(null)
  const [authUrl, setAuthUrl] = useState<string | null>(null)
  const [hovered, setHovered] = useState(false)

  useEffect(() => {
    const status = getChatGptOAuthStatus()
    if (!status.connected) {
      setFlowState('waiting-for-code')
      const result = connectChatGptOAuth()
      setAuthUrl(result.authUrl)
      result.credentials
        .then(() => {
          setFlowState('connected')
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : 'Failed to connect')
          setFlowState('error')
        })
    } else {
      setFlowState('connected')
    }

    return () => {
      stopChatGptOAuthServer()
    }
  }, [])

  const handleConnect = () => {
    setFlowState('waiting-for-code')
    const result = connectChatGptOAuth()
    setAuthUrl(result.authUrl)
    result.credentials
      .then(() => {
        setFlowState('connected')
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to connect')
        setFlowState('error')
      })
  }

  const handleDisconnect = () => {
    disconnectChatGptOAuth()
    setFlowState('not-connected')
  }

  const panelStyle = {
    width: '100%' as const,
    borderStyle: 'single' as const,
    borderColor: theme.border,
    customBorderChars: BORDER_CHARS,
    paddingLeft: 1,
    paddingRight: 1,
  }

  const actionButtonStyle = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingLeft: 1,
    paddingRight: 1,
    borderStyle: 'single' as const,
    borderColor: hovered ? theme.foreground : theme.border,
    customBorderChars: BORDER_CHARS,
  }

  const escHint = (
    <text style={{ fg: theme.muted }}> esc</text>
  )

  if (flowState === 'connected') {
    return (
      <box style={{ ...panelStyle, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <text style={{ fg: theme.foreground }}>✓ ChatGPT connected</text>
        <box style={{ flexDirection: 'row', gap: 1, alignItems: 'center' }}>
          <Button
            style={actionButtonStyle}
            onClick={handleDisconnect}
            onMouseOver={() => setHovered(true)}
            onMouseOut={() => setHovered(false)}
          >
            <text wrapMode="none">
              <span fg={theme.muted}>Disconnect</span>
            </text>
          </Button>
          {escHint}
        </box>
      </box>
    )
  }

  if (flowState === 'error') {
    return (
      <box style={{ ...panelStyle, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <text style={{ fg: theme.error, flexShrink: 1 }}>
          {error ?? 'Unknown error'}
        </text>
        <box style={{ flexDirection: 'row', gap: 1, alignItems: 'center' }}>
          <Button
            style={actionButtonStyle}
            onClick={handleConnect}
            onMouseOver={() => setHovered(true)}
            onMouseOut={() => setHovered(false)}
          >
            <text wrapMode="none">
              <span fg={theme.foreground}>Retry</span>
            </text>
          </Button>
          {escHint}
        </box>
      </box>
    )
  }

  if (flowState === 'waiting-for-code') {
    return (
      <box style={{ ...panelStyle, flexDirection: 'column' }}>
        <box style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <text style={{ fg: theme.foreground }}>Connecting to ChatGPT...</text>
          {escHint}
        </box>
        <text style={{ fg: theme.muted }}>
          Sign in via your browser to connect.
        </text>
        {authUrl ? (
          <text style={{ fg: theme.muted }}>
            {authUrl}
          </text>
        ) : null}
      </box>
    )
  }

  if (flowState === 'not-connected') {
    return (
      <box style={{ ...panelStyle, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Button
          style={actionButtonStyle}
          onClick={handleConnect}
          onMouseOver={() => setHovered(true)}
          onMouseOut={() => setHovered(false)}
        >
          <text wrapMode="none">
            <span fg={theme.link}>Connect to ChatGPT</span>
          </text>
        </Button>
        {escHint}
      </box>
    )
  }

  return null
}

export async function handleChatGptAuthCode(code: string): Promise<{
  success: boolean
  message: string
}> {
  try {
    await exchangeChatGptCodeForTokens(code)
    stopChatGptOAuthServer()
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
