import React, { useCallback, useState } from 'react'
import { TextAttributes } from '@opentui/core'

import { Button } from '../button'
import { defineToolComponent } from './types'
import { useTheme } from '../../hooks/use-theme'
import { useChatStore } from '../../state/chat-store'
import { useTerminalDimensions } from '../../hooks/use-terminal-dimensions'

import type { ToolRenderConfig } from './types'
import type { SuggestedFollowup } from '../../state/chat-store'

interface FollowupCardProps {
  followup: SuggestedFollowup
  index: number
  isClicked: boolean
  isStacked: boolean
  onSendFollowup: (prompt: string, index: number) => void
}

const FollowupCard = ({
  followup,
  index,
  isClicked,
  isStacked,
  onSendFollowup,
}: FollowupCardProps) => {
  const theme = useTheme()
  const [isHovered, setIsHovered] = useState(false)

  const handleClick = useCallback(() => {
    // Don't allow clicking already-selected followups
    if (isClicked) return
    onSendFollowup(followup.prompt, index)
  }, [followup.prompt, index, onSendFollowup, isClicked])

  const handleMouseOver = useCallback(() => setIsHovered(true), [])
  const handleMouseOut = useCallback(() => setIsHovered(false), [])

  const hasLabel = Boolean(followup.label)

  // Determine colors based on state
  const borderColor = isClicked
    ? theme.success
    : isHovered
      ? theme.primary
      : theme.border
  const labelColor = isClicked ? theme.muted : theme.secondary
  const promptColor = isClicked ? theme.muted : theme.foreground

  return (
    <Button
      onClick={handleClick}
      onMouseOver={handleMouseOver}
      onMouseOut={handleMouseOut}
      style={{
        paddingLeft: 2,
        paddingRight: 2,
        paddingTop: 0,
        paddingBottom: 0,
        ...(isStacked ? { width: '100%' } : { flexGrow: 1, flexShrink: 1 }),
        borderColor,
      }}
    >
      <box style={{ flexDirection: 'column' }}>
        {hasLabel && (
          <text
            style={{
              fg: labelColor,
            }}
            attributes={TextAttributes.BOLD}
          >
            {isClicked ? <span fg={theme.success}>✓ </span> : <span>→ </span>}
            <span>{followup.label}</span>
          </text>
        )}
        <text
          style={{
            fg: promptColor,
          }}
        >
          {!hasLabel && isClicked && <span fg={theme.success}>✓ </span>}
          <span>{followup.prompt}</span>
        </text>
      </box>
    </Button>
  )
}

interface SuggestFollowupsItemProps {
  toolCallId: string
  followups: SuggestedFollowup[]
  onSendFollowup: (prompt: string, index: number) => void
}

// Threshold width to switch between horizontal and stacked layouts
const WIDE_SCREEN_THRESHOLD = 100

const SuggestFollowupsItem = ({
  toolCallId,
  followups,
  onSendFollowup,
}: SuggestFollowupsItemProps) => {
  const theme = useTheme()
  const { terminalWidth } = useTerminalDimensions()
  const suggestedFollowups = useChatStore((state) => state.suggestedFollowups)

  // Get clicked indices for this specific tool call
  const clickedIndices =
    suggestedFollowups?.toolCallId === toolCallId
      ? suggestedFollowups.clickedIndices
      : new Set<number>()

  // Use stacked layout on narrow screens
  const isStacked = terminalWidth < WIDE_SCREEN_THRESHOLD

  return (
    <box
      style={{
        flexDirection: 'column',
        gap: 1,
      }}
    >
      <text style={{ fg: theme.primary }} attributes={TextAttributes.BOLD}>
        Suggested next steps:
      </text>
      <box
        style={{
          flexDirection: isStacked ? 'column' : 'row',
        }}
      >
        {followups.map((followup, index) => (
          <FollowupCard
            key={`followup-${index}`}
            followup={followup}
            index={index}
            isClicked={clickedIndices.has(index)}
            isStacked={isStacked}
            onSendFollowup={onSendFollowup}
          />
        ))}
      </box>
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
