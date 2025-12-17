import React from 'react'

import { Button } from './button'
import { useTheme } from '../hooks/use-theme'
import { useChatStore, type TopBannerType } from '../state/chat-store'
import { BORDER_CHARS } from '../utils/ui-constants'

import type { ThemeColorKey, InputMode } from '../utils/input-modes'

type BannerConfig = {
  /** Theme color key for the border */
  borderColorKey: ThemeColorKey
  /** Theme color key for text */
  textColorKey: ThemeColorKey
  /** Banner content */
  content: React.ReactNode
  /** Input mode to reset to when closing, if currently in a related mode */
  relatedInputMode?: InputMode
}

/**
 * Registry mapping top banner types to their configurations.
 *
 * To add a new top banner:
 * 1. Add the type to TopBannerType in chat-store.ts
 * 2. Add the configuration here
 */
const TOP_BANNER_REGISTRY: Record<NonNullable<TopBannerType>, BannerConfig> = {
  homeDir: {
    borderColorKey: 'warning',
    textColorKey: 'foreground',
    relatedInputMode: 'homeDir',
    content: (
      <>
        You are currently in your home directory.
        <br />
        Select a project folder to get started, or choose "Start here".
      </>
    ),
  },
}

/**
 * Centralized component for rendering top banners.
 * Handles all banner types with consistent styling and behavior.
 */
export const TopBanner = () => {
  const theme = useTheme()
  const activeTopBanner = useChatStore((state) => state.activeTopBanner)
  const closeTopBanner = useChatStore((state) => state.closeTopBanner)
  const inputMode = useChatStore((state) => state.inputMode)
  const setInputMode = useChatStore((state) => state.setInputMode)

  if (!activeTopBanner) {
    return null
  }

  const config = TOP_BANNER_REGISTRY[activeTopBanner]
  if (!config) {
    return null
  }

  const handleClose = () => {
    closeTopBanner()
    // Reset input mode if it's related to this banner
    if (config.relatedInputMode && inputMode === config.relatedInputMode) {
      setInputMode('default')
    }
  }

  const themeRecord = theme as unknown as Record<string, string>
  const borderColor = themeRecord[config.borderColorKey]
  const textColor = themeRecord[config.textColorKey]

  return (
    <box
      style={{
        width: '100%',
        borderStyle: 'single',
        borderColor: borderColor,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        paddingLeft: 1,
        paddingRight: 1,
        paddingTop: 0,
        paddingBottom: 0,
        marginTop: 0,
        marginBottom: 0,
        flexShrink: 0,
      }}
      border={['top', 'bottom', 'left', 'right']}
      customBorderChars={BORDER_CHARS}
    >
      <text
        style={{
          fg: textColor,
          wrapMode: 'word',
          flexShrink: 1,
          marginRight: 3,
        }}
      >
        {config.content}
      </text>
      <Button onClick={handleClose}>
        <text style={{ fg: borderColor }}>x</text>
      </Button>
    </box>
  )
}
