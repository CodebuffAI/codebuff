import React, { useState, useEffect } from 'react'

import { BottomBanner } from './bottom-banner'
import { Button } from './button'
import { useChatStore } from '../state/chat-store'
import {
  openOAuthInBrowser,
  exchangeCodeForTokens,
  disconnectClaudeOAuth,
  getClaudeOAuthStatus,
} from '../utils/claude-oauth'
import { useTheme } from '../hooks/use-theme'

type FlowState =
  | 'checking'
  | 'not-connected'
  | 'waiting-for-code'
  | 'connected'
  | 'error'

export const ClaudeConnectBanner = () => {
  const setInputMode = useChatStore((state) => state.setInputMode)
  const theme = useTheme()
  const [flowState, setFlowState] = useState<FlowState>('checking')
  const [error, setError] = useState<string | null>(null)
  const [isDisconnectHovered, setIsDisconnectHovered] = useState(false)
  const [isConnectHovered, setIsConnectHovered] = useState(false)

  // Check initial connection status and auto-open browser if not connected
  useEffect(() => {
    const status = getClaudeOAuthStatus()
    if (status.connected) {
      setFlowState('connected')
    } else {
      // Automatically start OAuth flow when not connected
      setFlowState('waiting-for-code')
      openOAuthInBrowser().catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to open browser')
        setFlowState('error')
      })
    }
  }, [])

  const handleConnect = async () => {
    try {
      setFlowState('waiting-for-code')
      await openOAuthInBrowser()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open browser')
      setFlowState('error')
    }
  }

  const handleDisconnect = () => {
    disconnectClaudeOAuth()
    setFlowState('not-connected')
  }

  const handleClose = () => {
    setInputMode('default')
  }

  // Connected state
  if (flowState === 'connected') {
    const status = getClaudeOAuthStatus()
    const connectedDate = status.connectedAt
      ? new Date(status.connectedAt).toLocaleDateString()
      : 'Unknown'

    return (
      <BottomBanner borderColorKey="success" onClose={handleClose}>
        <box style={{ flexDirection: 'column', gap: 0, flexGrow: 1 }}>
          <text style={{ fg: theme.success }}>✓ Connected to Claude</text>
          <box style={{ flexDirection: 'row', gap: 2, marginTop: 1 }}>
            <text style={{ fg: theme.muted }}>Since {connectedDate}</text>
            <text style={{ fg: theme.muted }}>·</text>
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

  // Error state
  if (flowState === 'error') {
    return (
      <BottomBanner
        borderColorKey="error"
        text={`Error: ${error}. Press Escape to close.`}
        onClose={handleClose}
      />
    )
  }

  // Waiting for code state
  if (flowState === 'waiting-for-code') {
    return (
      <BottomBanner borderColorKey="info" onClose={handleClose}>
        <box style={{ flexDirection: 'column', gap: 0, flexGrow: 1 }}>
          <text style={{ fg: theme.info }}>Waiting for authorization</text>
          <text style={{ fg: theme.muted, marginTop: 1 }}>
            Sign in with your Claude account in the browser, then paste the code
            here.
          </text>
        </box>
      </BottomBanner>
    )
  }

  // Not connected / checking state - show connect button
  return (
    <BottomBanner borderColorKey="info" onClose={handleClose}>
      <box style={{ flexDirection: 'column', gap: 0, flexGrow: 1 }}>
        <text style={{ fg: theme.info }}>Connect to Claude</text>
        <box style={{ flexDirection: 'row', gap: 2, marginTop: 1 }}>
          <text style={{ fg: theme.muted }}>Use your Pro/Max subscription</text>
          <text style={{ fg: theme.muted }}>·</text>
          <Button
            onClick={handleConnect}
            onMouseOver={() => setIsConnectHovered(true)}
            onMouseOut={() => setIsConnectHovered(false)}
          >
            <text style={{ fg: isConnectHovered ? theme.success : theme.link }}>
              Click to connect →
            </text>
          </Button>
        </box>
      </box>
    </BottomBanner>
  )
}

/**
 * Handle the authorization code input from the user.
 * This is called when the user pastes their code in connect:claude mode.
 */
export async function handleClaudeAuthCode(code: string): Promise<{
  success: boolean
  message: string
}> {
  try {
    await exchangeCodeForTokens(code)
    return {
      success: true,
      message:
        'Successfully connected your Claude subscription! Codebuff will now use it for Claude model requests.',
    }
  } catch (err) {
    return {
      success: false,
      message:
        err instanceof Error
          ? err.message
          : 'Failed to exchange authorization code',
    }
  }
}
