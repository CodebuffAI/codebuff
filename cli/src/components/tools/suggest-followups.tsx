import { TextAttributes } from '@opentui/core'
import React, { useCallback, useState } from 'react'

import { defineToolComponent } from './types'
import { useTheme } from '../../hooks/use-theme'
import { useChatStore } from '../../state/chat-store'
import { Button } from '../button'

import type { ToolRenderConfig } from './types'
import type { SuggestedFollowup } from '../../state/chat-store'

// Stable empty set to avoid creating new references on each render
const EMPTY_CLICKED_SET = new Set<number>()

interface FollowupLineProps {
  followup: SuggestedFollowup
  index: number
  isClicked: boolean
  isHovered: boolean
  onSendFollowup: (prompt: string, index: number) => void
  onHover: (index: number | null) => void
  disabled?: boolean
  /** Width of the label column (for fixed-width alignment) */
  labelColumnWidth: number
}

const FollowupLine = ({
  followup,
  index,
  isClicked,
  isHovered,
  onSendFollowup,
  onHover,
  disabled,
  labelColumnWidth,
}: FollowupLineProps) => {
  const theme = useTheme()

  const handleClick = useCallback(() => {
    if (isClicked || disabled) return
    onSendFollowup(followup.prompt, index)
  }, [followup.prompt, index, onSendFollowup, isClicked, disabled])

  const handleMouseOver = useCallback(() => onHover(index), [onHover, index])
  const handleMouseOut = useCallback(() => onHover(null), [onHover])

  // Compute effective hover state declaratively
  // Only show hover effects if actually hovered AND item is interactive
  const showHoverState = isHovered && !disabled && !isClicked

  const hasLabel = Boolean(followup.label)
  const displayText = hasLabel ? followup.label : followup.prompt

  // Show description when hovered and has a label
  const showDescription = showHoverState && hasLabel

  // Determine colors based on state
  // When hovered, use primary color (acid green) for both arrow and title
  const iconColor = isClicked
    ? theme.success
    : showHoverState
      ? theme.primary
      : theme.muted
  const labelColor = isClicked
    ? theme.muted
    : showHoverState
      ? theme.primary
      : theme.foreground

  return (
    <Button
      onClick={handleClick}
      onMouseOver={handleMouseOver}
      onMouseOut={handleMouseOut}
      style={{
        flexDirection: 'column',
        backgroundColor: showHoverState ? theme.surface : undefined,
      }}
    >
      {/* Row layout: fixed-width label column + flexible description */}
      <box style={{ flexDirection: 'row', width: '100%' }}>
        {/* Fixed-width label column */}
        <box style={{ width: labelColumnWidth, flexShrink: 0 }}>
          <text style={{ wrapMode: 'none' }}>
            <span fg={iconColor}>{isClicked ? '✓' : '→'}</span>
            <span
              fg={labelColor}
              attributes={showHoverState ? TextAttributes.BOLD : undefined}
            >
              {' '}
              {displayText}
            </span>
          </text>
        </box>
        {/* Flexible description column - text wraps within remaining space */}
        {showDescription && (
          <box style={{ flexGrow: 1 }}>
            <text style={{ wrapMode: 'word' }}>
              <span fg={theme.foreground} attributes={TextAttributes.ITALIC}>
                {followup.prompt}
              </span>
            </text>
          </box>
        )}
      </box>
    </Button>
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
  const inputFocused = useChatStore((state) => state.inputFocused)
  // Get clicked indices from the persistent map
  // Use stable EMPTY_CLICKED_SET to avoid creating new references that cause infinite re-renders
  const clickedIndices = useChatStore(
    (state) => state.clickedFollowupsMap.get(toolCallId) ?? EMPTY_CLICKED_SET,
  )

  // Track which item is hovered (for passing to children)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  // Calculate label column width for alignment across all followups
  // Width = "→ " (2 chars) + max label length + "  " spacing (2 chars)
  const maxLabelLength = Math.max(
    0,
    ...followups.filter((f) => f.label).map((f) => f.label?.length ?? 0),
  )
  const labelColumnWidth = 2 + maxLabelLength + 2 // "→ " + label + "  "

  return (
    <box style={{ flexDirection: 'column' }}>
      <text style={{ fg: theme.muted }}>Suggested followups:</text>
      <box style={{ flexDirection: 'column' }}>
        {followups.map((followup, index) => (
          <FollowupLine
            key={`followup-${index}`}
            followup={followup}
            index={index}
            isClicked={clickedIndices.has(index)}
            isHovered={hoveredIndex === index}
            onSendFollowup={onSendFollowup}
            onHover={setHoveredIndex}
            disabled={!inputFocused}
            labelColumnWidth={labelColumnWidth}
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
    // Only initialize if this is a different toolCallId (new set of followups)
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
    // Note: We don't reset clickedIndices if the toolCallId matches -
    // this preserves the clicked state across re-renders

    // The actual click handling is done in chat.tsx via the global handler
    // Here we just pass a placeholder that will be replaced
    const handleSendFollowup = (prompt: string, index: number) => {
      // This gets called from the FollowupCard component
      // The actual logic is handled via the global followup handler
      const event = new CustomEvent('codebuff:send-followup', {
        detail: { prompt, index, toolCallId },
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
