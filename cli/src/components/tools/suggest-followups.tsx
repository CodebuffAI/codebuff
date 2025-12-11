import React, { useCallback } from 'react'

import { Button } from '../button'
import { defineToolComponent } from './types'
import { useTheme } from '../../hooks/use-theme'
import { useChatStore } from '../../state/chat-store'

import type { ToolRenderConfig } from './types'
import type { SuggestedFollowup } from '../../state/chat-store'

interface FollowupCardProps {
  followup: SuggestedFollowup
  index: number
  isClicked: boolean
  onSendFollowup: (prompt: string, index: number) => void
}

const FollowupCard = ({
  followup,
  index,
  isClicked,
  onSendFollowup,
}: FollowupCardProps) => {
  const theme = useTheme()

  const handleClick = useCallback(() => {
    onSendFollowup(followup.prompt, index)
  }, [followup.prompt, index, onSendFollowup])

  // Use label if provided, otherwise truncate the prompt
  const displayLabel = followup.label || truncateText(followup.prompt, 40)

  return (
    <Button
      onClick={handleClick}
      style={{
        paddingLeft: 2,
        paddingRight: 2,
        paddingTop: 0,
        paddingBottom: 0,
        backgroundColor: isClicked ? theme.surface : theme.surfaceHover,
        borderColor: isClicked ? theme.success : theme.border,
      }}
    >
      <text
        style={{
          fg: isClicked ? theme.muted : theme.foreground,
        }}
      >
        {isClicked && <span fg={theme.success}>✓ </span>}
        <span>{displayLabel}</span>
      </text>
    </Button>
  )
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength - 1) + '…'
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
    <box style={{ flexDirection: 'column', gap: 1, width: '100%' }}>
      <text style={{ fg: theme.muted }}>Suggested next steps:</text>
      <box
        style={{
          flexDirection: 'row',
          gap: 1,
          flexWrap: 'wrap',
          width: '100%',
        }}
      >
        {followups.map((followup, index) => (
          <FollowupCard
            key={`followup-${index}`}
            followup={followup}
            index={index}
            isClicked={clickedIndices.has(index)}
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
