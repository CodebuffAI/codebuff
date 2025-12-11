import React, { useCallback, useState } from 'react'
import { TextAttributes } from '@opentui/core'

import { defineToolComponent } from './types'
import { useTheme } from '../../hooks/use-theme'
import { useChatStore } from '../../state/chat-store'
import { useTerminalDimensions } from '../../hooks/use-terminal-dimensions'

import type { ToolRenderConfig } from './types'
import type { SuggestedFollowup } from '../../state/chat-store'

interface FollowupLineProps {
  followup: SuggestedFollowup
  index: number
  isClicked: boolean
  onSendFollowup: (prompt: string, index: number) => void
}

const FollowupLine = ({
  followup,
  index,
  isClicked,
  onSendFollowup,
}: FollowupLineProps) => {
  const theme = useTheme()
  const { terminalWidth } = useTerminalDimensions()
  const [isHovered, setIsHovered] = useState(false)

  const handleClick = useCallback(() => {
    if (isClicked) return
    onSendFollowup(followup.prompt, index)
  }, [followup.prompt, index, onSendFollowup, isClicked])

  const handleMouseOver = useCallback(() => setIsHovered(true), [])
  const handleMouseOut = useCallback(() => setIsHovered(false), [])

  const hasLabel = Boolean(followup.label)
  // "→ " = 2 chars (icon + space), " · " separator = 3 chars, "…" = 1 char
  const iconWidth = 2
  const separatorWidth = hasLabel ? 3 : 0
  const ellipsisWidth = 1
  const maxWidth = terminalWidth - 6 // Extra margin for safety

  // Build the display text with label and prompt
  let labelText = followup.label || ''
  let promptText = followup.prompt

  // Calculate available space
  const availableForContent = maxWidth - iconWidth

  if (hasLabel) {
    // Show: label · prompt (truncated)
    const labelWithSeparator = labelText.length + separatorWidth
    const totalLength = labelWithSeparator + promptText.length

    if (totalLength > availableForContent) {
      // Truncate prompt to fit
      const availableForPrompt = availableForContent - labelWithSeparator - ellipsisWidth
      if (availableForPrompt > 0) {
        promptText = promptText.slice(0, availableForPrompt) + '…'
      } else {
        // Not enough space for prompt, just show label truncated
        promptText = ''
        if (labelText.length > availableForContent - ellipsisWidth) {
          labelText = labelText.slice(0, availableForContent - ellipsisWidth) + '…'
        }
      }
    }
  } else {
    // No label, just show prompt (truncated)
    if (promptText.length > availableForContent) {
      promptText = promptText.slice(0, availableForContent - ellipsisWidth) + '…'
    }
  }

  // Determine colors based on state
  const iconColor = isClicked
    ? theme.success
    : isHovered
      ? theme.primary
      : theme.muted
  const labelColor = isClicked
    ? theme.muted
    : isHovered
      ? theme.primary
      : theme.foreground
  const promptColor = isClicked
    ? theme.muted
    : isHovered
      ? theme.primary
      : theme.muted

  return (
    <box
      onMouseDown={handleClick}
      onMouseOver={handleMouseOver}
      onMouseOut={handleMouseOut}
    >
      <text selectable={false}>
        <span fg={iconColor}>{isClicked ? '✓' : '→'}</span>
        <span fg={labelColor} attributes={isHovered ? TextAttributes.UNDERLINE : undefined}>
          {' '}{hasLabel ? labelText : promptText}
        </span>
        {hasLabel && promptText && (
          <span fg={promptColor}>
            {' · '}{promptText}
          </span>
        )}
      </text>
    </box>
  )
}

interface SuggestFollowupsItemProps {
  toolCallId: string
  followups: SuggestedFollowup[]
  onSendFollowup: (prompt: string, index: number) => void
}

const SuggestFollowupsItem = ({
  toolCallId,
  followups,
  onSendFollowup,
}: SuggestFollowupsItemProps) => {
  const theme = useTheme()
  const suggestedFollowups = useChatStore((state) => state.suggestedFollowups)

  // Get clicked indices for this specific tool call
  const clickedIndices =
    suggestedFollowups?.toolCallId === toolCallId
      ? suggestedFollowups.clickedIndices
      : new Set<number>()

  return (
    <box style={{ flexDirection: 'column' }}>
      <text style={{ fg: theme.muted }}>
        Next steps:
      </text>
      {followups.map((followup, index) => (
        <FollowupLine
          key={`followup-${index}`}
          followup={followup}
          index={index}
          isClicked={clickedIndices.has(index)}
          onSendFollowup={onSendFollowup}
        />
      ))}
    </box>
  )
}

/**
 * UI component for suggest_followups tool.
 * Displays clickable cards that send the followup prompt as a user message when clicked.
 */
export const SuggestFollowupsComponent = defineToolComponent({
  toolName: 'suggest_followups',

  render(toolBlock): ToolRenderConfig {
    const { input, toolCallId } = toolBlock

    // Extract followups from input
    let followups: SuggestedFollowup[] = []

    if (Array.isArray(input?.followups)) {
      followups = input.followups.filter(
        (f: unknown): f is SuggestedFollowup =>
          typeof f === 'object' &&
          f !== null &&
          typeof (f as SuggestedFollowup).prompt === 'string',
      )
    }

    if (followups.length === 0) {
      return { content: null }
    }

    // Store the followups in state for tracking clicks
    // This is done via a ref to avoid re-renders during the render phase
    const store = useChatStore.getState()
    if (
      !store.suggestedFollowups ||
      store.suggestedFollowups.toolCallId !== toolCallId
    ) {
      // Schedule the state update for after render
      setTimeout(() => {
        useChatStore.getState().setSuggestedFollowups({
          toolCallId,
          followups,
          clickedIndices: new Set(),
        })
      }, 0)
    }

    // The actual click handling is done in chat.tsx via the global handler
    // Here we just pass a placeholder that will be replaced
    const handleSendFollowup = (prompt: string, index: number) => {
      // This gets called from the FollowupCard component
      // The actual logic is handled via the global followup handler
      const event = new CustomEvent('codebuff:send-followup', {
        detail: { prompt, index },
      })
      globalThis.dispatchEvent(event)
    }

    return {
      content: (
        <SuggestFollowupsItem
          toolCallId={toolCallId}
          followups={followups}
          onSendFollowup={handleSendFollowup}
        />
      ),
    }
  },
})
