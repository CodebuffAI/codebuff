import React, { useState } from 'react'

import { Button } from './button'
import { useTerminalLayout } from '../hooks/use-terminal-layout'
import { useTheme } from '../hooks/use-theme'
import { BORDER_CHARS } from '../utils/ui-constants'

import type { ChatTheme } from '../types/theme-system'

/**
 * Theme color keys that can be used for banner colors.
 * Add new color keys here as needed.
 */
export type BannerColorKey = keyof ChatTheme

/**
 * Configuration interface for bottom banners.
 * Use this to define new banner types with consistent styling.
 */
export interface BottomBannerConfig {
  /** Theme color key for the border */
  borderColorKey: BannerColorKey
  /** Override border color directly (takes precedence over borderColorKey) */
  borderColor?: string
  /** Theme color key for text, defaults to borderColorKey */
  textColorKey?: BannerColorKey
  /** Override text color directly */
  textColor?: string
  /** Simple text content */
  text?: string
  /** Custom children content (used instead of text) */
  children?: React.ReactNode
  /** Called when close button is clicked. If not provided, no close button is shown. */
  onClose?: () => void
}

export type BottomBannerProps = BottomBannerConfig

/**
 * Unified bottom banner component.
 *
 * Provides consistent styling and behavior for all banners that appear below the input.
 *
 * @example Simple text banner with close button:
 * ```tsx
 * <BottomBanner
 *   borderColorKey="warning"
 *   text="This is a warning message"
 *   onClose={() => setInputMode('default')}
 * />
 * ```
 *
 * @example Custom content banner:
 * ```tsx
 * <BottomBanner borderColorKey="imageCardBorder">
 *   <text>Custom content here</text>
 *   <box><ImageCard ... /></box>
 * </BottomBanner>
 * ```
 */
export const BottomBanner: React.FC<BottomBannerProps> = ({
  borderColorKey,
  borderColor: borderColorOverride,
  textColorKey,
  textColor: textColorOverride,
  text,
  children,
  onClose,
}) => {
  const { width, terminalWidth } = useTerminalLayout()
  const theme = useTheme()
  const [isCloseHovered, setIsCloseHovered] = useState(false)

  // Resolve colors from theme or use overrides
  const themeRecord = theme as unknown as Record<string, string>
  const borderColor = borderColorOverride ?? themeRecord[borderColorKey]
  const textColor =
    textColorOverride ??
    (textColorKey ? themeRecord[textColorKey] : borderColor)

  const hasCloseButton = onClose !== undefined
  const hasTextContent = text !== undefined && children === undefined

  return (
    <box
      key={terminalWidth}
      style={{
        marginLeft: width.is('sm') ? 0 : 1,
        marginRight: width.is('sm') ? 0 : 1,
        borderStyle: 'single',
        borderColor: borderColor,
        flexDirection: hasCloseButton ? 'row' : 'column',
        justifyContent: hasCloseButton ? 'space-between' : undefined,
        paddingLeft: 1,
        paddingRight: 1,
        marginTop: 0,
        marginBottom: 0,
      }}
      border={['bottom', 'left', 'right']}
      customBorderChars={BORDER_CHARS}
    >
      {hasTextContent ? (
        // Simple text content with optional close button
        <>
          <text
            style={{
              fg: textColor,
              wrapMode: 'word',
              flexShrink: 1,
              marginRight: hasCloseButton ? 3 : 0,
            }}
          >
            {text}
          </text>
        </>
      ) : (
        // Custom children content
        children
      )}
      {hasCloseButton && (
        <Button
          onClick={onClose}
          onMouseOver={() => setIsCloseHovered(true)}
          onMouseOut={() => setIsCloseHovered(false)}
        >
          <text style={{ fg: isCloseHovered ? theme.error : theme.muted }}>
            x
          </text>
        </Button>
      )}
    </box>
  )
}
