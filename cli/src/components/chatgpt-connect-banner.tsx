import React, { useEffect, useState } from 'react'

import { loadProviderConfigSync } from '@codebuff/sdk'

import { Button } from './button'
import { useTheme } from '../hooks/use-theme'
import { useChatStore } from '../state/chat-store'
import {
  connectChatGptOAuth,
  disconnectChatGptOAuth,
  exchangeChatGptCodeForTokens,
  getChatGptOAuthStatus,
  stopChatGptOAuthServer,
} from '../utils/chatgpt-oauth'
import { setupOpenbuffProviderFromArgs } from '../utils/openbuff-provider'
import { BORDER_CHARS } from '../utils/ui-constants'

type FlowState =
  | 'checking'
  | 'not-connected'
  | 'waiting-for-code'
  | 'connected'
  | 'error'

type AutoConfigState = 'idle' | 'prompt' | 'done'

export const ChatGptConnectBanner = () => {
  const theme = useTheme()
  const setInputMode = useChatStore((state) => state.setInputMode)
  const [flowState, setFlowState] = useState<FlowState>('checking')
  const [error, setError] = useState<string | null>(null)
  const [authUrl, setAuthUrl] = useState<string | null>(null)
  const [isCloseHovered, setIsCloseHovered] = useState(false)
  const [isAutoConfigHovered, setIsAutoConfigHovered] = useState(false)
  const [isDisconnectHovered, setIsDisconnectHovered] = useState(false)
  const [isConnectHovered, setIsConnectHovered] = useState(false)
  const [isRetryHovered, setIsRetryHovered] = useState(false)
  const [autoConfigState, setAutoConfigState] = useState<AutoConfigState>('idle')
  const [autoConfigError, setAutoConfigError] = useState<string | null>(null)

  function maybePromptAutoConfig(): void {
    try {
      const loadedConfig = loadProviderConfigSync()
      const hasCodexProvider = loadedConfig.config.providers?.codex != null
      if (!hasCodexProvider) {
        setAutoConfigState('prompt')
      }
    } catch {        // If config can't be read, quietly skip the prompt; the user can still run /setup codex
    }
  }

  useEffect(() => {
    const status = getChatGptOAuthStatus()
    if (!status.connected) {
      setFlowState('waiting-for-code')
      const result = connectChatGptOAuth()
      setAuthUrl(result.authUrl)
      result.credentials
        .then(() => {
          setFlowState('connected')
          maybePromptAutoConfig()
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : 'Failed to connect')
          setFlowState('error')
        })
    } else {
      setFlowState('connected')
      maybePromptAutoConfig()
    }

    return () => {
      stopChatGptOAuthServer()
    }
  }, [])

  const handleConnect = () => {
    setFlowState('waiting-for-code')
    setError(null)
    setAutoConfigState('idle')
    setAutoConfigError(null)
    const result = connectChatGptOAuth()
    setAuthUrl(result.authUrl)
    result.credentials
      .then(() => {
        setFlowState('connected')
        maybePromptAutoConfig()
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to connect')
        setFlowState('error')
      })
  }

  const handleDisconnect = () => {
    disconnectChatGptOAuth()
    setFlowState('not-connected')
    setAutoConfigState('idle')
    setAutoConfigError(null)
  }

  const handleAutoConfigure = () => {
    try {
      setupOpenbuffProviderFromArgs('codex')
      setAutoConfigError(null)
      setAutoConfigState('done')
    } catch (err) {
      setAutoConfigError(err instanceof Error ? err.message : 'Failed to auto-configure')
      // Keep the button visible so the user can retry
    }
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
    borderColor: theme.border,
    customBorderChars: BORDER_CHARS,
  }

  const handleClose = () => {
    setInputMode('default')
  }

  const closeButton = (
    <Button
      onClick={handleClose}
      onMouseOver={() => setIsCloseHovered(true)}
      onMouseOut={() => setIsCloseHovered(false)}
    >
      <text style={{ fg: isCloseHovered ? theme.error : theme.muted }}>
        x
      </text>
    </Button>
  )

  if (flowState === 'connected') {
    const showAutoConfig = autoConfigState === 'prompt'
    const showAutoConfigError = autoConfigState === 'prompt' && autoConfigError != null
    const statusText = autoConfigState === 'done'
      ? '✓ ChatGPT connected · Codex provider added'
      : showAutoConfigError
        ? `✓ ChatGPT connected · ${autoConfigError}`
        : showAutoConfig
          ? '✓ ChatGPT connected · Route requests through Codex?'
          : '✓ ChatGPT connected'

    return (
      <box style={{ ...panelStyle, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <text style={{ fg: theme.foreground }}>{statusText}</text>
        <box style={{ flexDirection: 'row', gap: 1, alignItems: 'center' }}>
          {showAutoConfig && (
            <Button
              style={{
                ...actionButtonStyle,
                borderColor: isAutoConfigHovered ? theme.foreground : theme.border,
              }}
              onClick={handleAutoConfigure}
              onMouseOver={() => setIsAutoConfigHovered(true)}
              onMouseOut={() => setIsAutoConfigHovered(false)}
            >
              <text wrapMode="none">
                <span fg={theme.success}>Use Codex preset</span>
              </text>
            </Button>
          )}
          <Button
            style={{
              ...actionButtonStyle,
              borderColor: isDisconnectHovered ? theme.foreground : theme.border,
            }}
            onClick={handleDisconnect}
            onMouseOver={() => setIsDisconnectHovered(true)}
            onMouseOut={() => setIsDisconnectHovered(false)}
          >
            <text wrapMode="none">
              <span fg={theme.muted}>Disconnect</span>
            </text>
          </Button>
          {closeButton}
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
            style={{
              ...actionButtonStyle,
              borderColor: isRetryHovered ? theme.foreground : theme.border,
            }}
            onClick={handleConnect}
            onMouseOver={() => setIsRetryHovered(true)}
            onMouseOut={() => setIsRetryHovered(false)}
          >
            <text wrapMode="none">
              <span fg={theme.foreground}>Retry</span>
            </text>
          </Button>
          {closeButton}
        </box>
      </box>
    )
  }

  if (flowState === 'waiting-for-code') {
    return (
      <box style={{ ...panelStyle, flexDirection: 'column' }}>
        <box style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <text style={{ fg: theme.foreground }}>Connecting to ChatGPT...</text>
          {closeButton}
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
          style={{
            ...actionButtonStyle,
            borderColor: isConnectHovered ? theme.foreground : theme.border,
          }}
          onClick={handleConnect}
          onMouseOver={() => setIsConnectHovered(true)}
          onMouseOut={() => setIsConnectHovered(false)}
        >
          <text wrapMode="none">
            <span fg={theme.link}>Connect to ChatGPT</span>
          </text>
        </Button>
        {closeButton}
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
        `Successfully connected your ChatGPT subscription! If needed, run /setup codex to route requests through Codex, or click Use Codex preset if the banner is still open.`,
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
