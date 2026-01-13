import { TextAttributes } from '@opentui/core'
import React, { useState } from 'react'

import { useTheme } from '../hooks/use-theme'
import { useTimeout } from '../hooks/use-timeout'
import { copyTextToClipboard } from '../utils/clipboard'

interface CopyButtonProps {
  isCopied?: boolean
  isHovered?: boolean
  /** Whether to include a leading space before the icon */
  leadingSpace?: boolean
}

/**
 * Unified copy button that renders as a span within text content.
 * Displays a dimmed icon that expands on hover and changes to a checkmark when copied.
 * 
 * This is a presentational component - the parent must manage hover/copied state
 * and handle the click event on the containing text element.
 */
export const CopyButton: React.FC<CopyButtonProps> = ({
  isCopied = false,
  isHovered = false,
  leadingSpace = true,
}) => {
  const theme = useTheme()

  const space = leadingSpace ? ' ' : ''
  const textCollapsed = `${space}⎘`
  const textExpanded = `${space}[⎘ copy]`
  const textCopied = `${space}[✔ copied]`

  if (isCopied) {
    return (
      <span fg="green">
        {textCopied}
      </span>
    )
  }

  if (isHovered) {
    return (
      <span fg={theme.foreground}>
        {textExpanded}
      </span>
    )
  }

  return (
    <span fg={theme.muted} attributes={TextAttributes.DIM}>
      {textCollapsed}
    </span>
  )
}

interface UseCopyButtonResult {
  isCopied: boolean
  isHovered: boolean
  handleCopy: () => Promise<void>
  handleMouseOver: () => void
  handleMouseOut: () => void
}

/**
 * Hook to manage copy button state and handlers.
 * Use this with CopyButton to create a fully functional copy button.
 */
export const useCopyButton = (textToCopy: string): UseCopyButtonResult => {
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

  return {
    isCopied,
    isHovered,
    handleCopy,
    handleMouseOver,
    handleMouseOut,
  }
}

