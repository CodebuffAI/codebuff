import { TextAttributes } from '@opentui/core'
import React, { useCallback, useState } from 'react'

import { Clickable } from './clickable'
import { useTheme } from '../hooks/use-theme'
import { useTimeout } from '../hooks/use-timeout'
import { copyTextToClipboard } from '../utils/clipboard'

import type { ReactNode } from 'react'

// ============================================================================
// Exported constants and utilities for testing
// ============================================================================

/** Time in ms before the "copied" state resets */
export const COPIED_RESET_DELAY_MS = 2000

/**
 * The copy-and-confirm state machine: copies `text` to the clipboard and flips
 * `isCopied` true for {@link COPIED_RESET_DELAY_MS} before resetting. Lifted out
 * of {@link CopyButton} so callers that render their own button (and may fire
 * the copy from elsewhere, e.g. keyboard navigation) can share the same
 * lifecycle instead of re-implementing it.
 */
export function useCopyToClipboard(text: string): {
  isCopied: boolean
  copy: () => void
} {
  const { setTimeout } = useTimeout()
  const [isCopied, setIsCopied] = useState(false)

  const copy = useCallback(() => {
    void (async () => {
      try {
        await copyTextToClipboard(text, { suppressGlobalMessage: true })
        setIsCopied(true)
        setTimeout(
          'reset-copied',
          () => setIsCopied(false),
          COPIED_RESET_DELAY_MS,
        )
      } catch (_error) {
        // Error is already logged and displayed by copyTextToClipboard.
      }
    })()
  }, [text, setTimeout])

  return { isCopied, copy }
}

/** Icon shown in collapsed state */
export const COPY_ICON_COLLAPSED = '⎘'
/** Text shown when hovering */
export const COPY_ICON_EXPANDED = '[⎘ copy]'
/** Text shown after copying */
export const COPY_ICON_COPIED = '[✔ copied]'

/**
 * Get the text to display for the copy icon based on state.
 * Exported for testing.
 */
export const getCopyIconText = (
  isCopied: boolean,
  isHovered: boolean,
  leadingSpace: boolean,
): string => {
  const space = leadingSpace ? ' ' : ''
  if (isCopied) return `${space}${COPY_ICON_COPIED}`
  if (isHovered) return `${space}${COPY_ICON_EXPANDED}`
  return `${space}${COPY_ICON_COLLAPSED}`
}

/**
 * State transition handlers for the copy button.
 * Exported for testing - these are the pure logic functions
 * that determine how state changes in response to user actions.
 */
export const copyButtonHandlers = {
  /** Handle mouse entering the button */
  handleMouseOver: (isCopied: boolean): boolean => {
    // Don't show hover state while showing "copied" feedback
    return !isCopied
  },

  /** Handle mouse leaving the button - always clears hover */
  handleMouseOut: (): boolean => {
    return false
  },

  /** Handle copy action - returns new state */
  handleCopy: (): { isCopied: boolean; isHovered: boolean } => {
    return { isCopied: true, isHovered: false }
  },
}

// ============================================================================
// Internal component
// ============================================================================

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
  const text = getCopyIconText(isCopied, isHovered, leadingSpace)

  if (isCopied) {
    return <span fg="green">{text}</span>
  }

  if (isHovered) {
    return <span fg={theme.foreground}>{text}</span>
  }

  return (
    <span fg={theme.muted} attributes={TextAttributes.DIM}>
      {text}
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
  const { isCopied, copy } = useCopyToClipboard(textToCopy)
  const [isHovered, setIsHovered] = useState(false)

  const handleCopy = () => {
    // copyButtonHandlers.handleCopy() encodes "clear hover on copy"; the copied
    // flag + reset timer now live in useCopyToClipboard.
    setIsHovered(copyButtonHandlers.handleCopy().isHovered)
    copy()
  }

  const handleMouseOver = () => {
    const shouldHover = copyButtonHandlers.handleMouseOver(isCopied)
    if (shouldHover) {
      setIsHovered(true)
    }
  }

  const handleMouseOut = () => {
    setIsHovered(copyButtonHandlers.handleMouseOut())
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
