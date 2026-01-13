import { TextAttributes } from '@opentui/core'
import React, { useState } from 'react'

import { Clickable } from './clickable'
import { useTheme } from '../hooks/use-theme'
import { useTimeout } from '../hooks/use-timeout'
import { copyTextToClipboard } from '../utils/clipboard'

import type { ReactNode } from 'react'

interface CopyIconProps {
  isCopied: boolean
  isHovered: boolean
  leadingSpace: boolean
}

/**
 * Internal presentational component for the copy icon.
 * Displays a dimmed icon that expands on hover and changes to a checkmark when copied.
 */
const CopyIcon: React.FC<CopyIconProps> = ({
  isCopied,
  isHovered,
  leadingSpace,
}) => {
  const theme = useTheme()

  const space = leadingSpace ? ' ' : ''
  const textCollapsed = `${space}⎘`
  const textExpanded = `${space}[⎘ copy]`
  const textCopied = `${space}[✔ copied]`

  if (isCopied) {
    return <span fg="green">{textCopied}</span>
  }

  if (isHovered) {
    return <span fg={theme.foreground}>{textExpanded}</span>
  }

  return (
    <span fg={theme.muted} attributes={TextAttributes.DIM}>
      {textCollapsed}
    </span>
  )
}

interface CopyButtonProps {
  /** The text to copy to clipboard when clicked */
  textToCopy: string
  /** Optional content to display before the copy icon */
  children?: ReactNode
  /** Whether to include a leading space before the icon (default: true) */
  leadingSpace?: boolean
  /** Style props passed to the underlying Clickable */
  style?: Record<string, unknown>
}

/**
 * A clickable copy button that copies text to clipboard.
 *
 * Can be used standalone (just the icon) or with children (content + trailing icon).
 *
 * @example
 * ```tsx
 * // Standalone copy button
 * <CopyButton textToCopy="some text" leadingSpace={false} />
 *
 * // With content (icon appears after children)
 * <CopyButton textToCopy={content} style={{ wrapMode: 'word' }}>
 *   <span>Content to display</span>
 * </CopyButton>
 * ```
 */
export const CopyButton: React.FC<CopyButtonProps> = ({
  textToCopy,
  children,
  leadingSpace = true,
  style,
}) => {
  const [isCopied, setIsCopied] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const { setTimeout } = useTimeout()

  const handleCopy = async () => {
    try {
      await copyTextToClipboard(textToCopy, {
        suppressGlobalMessage: true,
      })
      setIsCopied(true)
      setIsHovered(false)
      setTimeout('reset-copied', () => setIsCopied(false), 2000)
    } catch (_error) {
      // Error is already logged and displayed by copyTextToClipboard
    }
  }

  const handleMouseOver = () => {
    if (!isCopied) {
      setIsHovered(true)
    }
  }

  const handleMouseOut = () => {
    setIsHovered(false)
  }

  return (
    <Clickable
      as="text"
      style={style}
      onMouseDown={handleCopy}
      onMouseOver={handleMouseOver}
      onMouseOut={handleMouseOut}
    >
      {children}
      <CopyIcon
        isCopied={isCopied}
        isHovered={isHovered}
        leadingSpace={leadingSpace}
      />
    </Clickable>
  )
}
