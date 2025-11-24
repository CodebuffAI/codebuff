import { TextAttributes } from '@opentui/core'
import React, { useMemo, useState } from 'react'

import { useHoverToggle } from './agent-mode-toggle'
import { Button } from './button'
import { useTheme } from '../hooks/use-theme'
import { useTimeout } from '../hooks/use-timeout'
import { copyTextToClipboard } from '../utils/clipboard'
import type { ContentBlock } from '../types/chat'

interface CopyIconButtonProps {
  blocks?: ContentBlock[]
  content?: string
}

const BULLET_CHAR = '•'

const extractTextFromBlocks = (blocks?: ContentBlock[]): string => {
  if (!blocks || blocks.length === 0) return ''
  
  const textParts: string[] = []
  const agentToolGroup: string[] = []
  
  for (const block of blocks) {
    if (block.type === 'text') {
      // Flush any accumulated agent/tool names
      if (agentToolGroup.length > 0) {
        // Remove trailing whitespace from last text block
        if (textParts.length > 0) {
          const lastIndex = textParts.length - 1
          textParts[lastIndex] = textParts[lastIndex].trimEnd()
        }
        // Add agent/tool names with bullets
        textParts.push(agentToolGroup.join('\n'))
        // Add blank line after agent/tool group
        textParts.push('')
        agentToolGroup.length = 0
      }
      textParts.push(block.content)
    } else if (block.type === 'agent') {
      // Only include agent name, not nested content
      agentToolGroup.push(`${BULLET_CHAR} ${block.agentName}`)
    } else if (block.type === 'tool') {
      // Only include tool name, not nested content
      agentToolGroup.push(`${BULLET_CHAR} ${block.toolName}`)
    }
    // Skip other block types (html, agent-list, etc.)
  }
  
  // Flush any remaining agent/tool names at the end
  if (agentToolGroup.length > 0) {
    if (textParts.length > 0) {
      const lastIndex = textParts.length - 1
      textParts[lastIndex] = textParts[lastIndex].trimEnd()
    }
    textParts.push(agentToolGroup.join('\n'))
    textParts.push('')
  }
  
  return textParts.join('\n').trim()
}

export const CopyIconButton: React.FC<CopyIconButtonProps> = ({
  blocks,
  content,
}) => {
  const theme = useTheme()
  const hover = useHoverToggle()
  const { setTimeout } = useTimeout()
  const [isCopied, setIsCopied] = useState(false)

  // Compute text to copy from blocks or content
  const textToCopy = useMemo(() => {
    return blocks && blocks.length > 0
      ? extractTextFromBlocks(blocks) || content || ''
      : content || ''
  }, [blocks, content])

  const handleClick = async () => {
    try {
      await copyTextToClipboard(textToCopy, {
        suppressGlobalMessage: true,
      })
      setIsCopied(true)
      setTimeout('reset-copied', () => setIsCopied(false), 2000)
    } catch (error) {
      // Error is already logged and displayed by copyTextToClipboard
    }
  }

  const handleMouseOver = () => {
    if (!isCopied) {
      hover.clearCloseTimer()
      hover.scheduleOpen()
    }
  }

  const handleMouseOut = () => {
    if (!isCopied) {
      hover.scheduleClose()
    }
  }

  const textCollapsed = '⎘'
  const textExpanded = '[⎘ copy]'
  const textCopied = '[✔ copied]'

  return (
    <Button
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: 0,
        paddingRight: 0,
      }}
      onClick={handleClick}
      onMouseOver={handleMouseOver}
      onMouseOut={handleMouseOut}
    >
      <text
        style={{
          wrapMode: 'none',
          fg: isCopied ? 'green' : hover.isOpen ? theme.foreground : theme.muted,
        }}
      >
        {isCopied ? (
          textCopied
        ) : hover.isOpen ? (
          textExpanded
        ) : (
          <span attributes={TextAttributes.DIM}>{textCollapsed}</span>
        )}
      </text>
    </Button>
  )
}
