import React from 'react'

import { HighlightedSubsequenceText } from './highlighted-text'

import type { ChatTheme } from '../types/theme-system'

export interface SuggestionItem {
  id: string
  label: string
  labelHighlightIndices?: number[] | null
  description: string
  descriptionHighlightIndices?: number[] | null
}

interface SuggestionMenuProps {
  items: SuggestionItem[]
  selectedIndex: number
  theme: ChatTheme
  maxVisible?: number
  prefix?: string
}

export const SuggestionMenu = ({
  items,
  selectedIndex,
  theme,
  maxVisible = 10,
  prefix = '/',
}: SuggestionMenuProps) => {
  if (items.length === 0) {
    return null
  }

  const effectivePrefix = prefix ?? ''
  const maxLabelLength = items.reduce((max, item) => {
    const totalLength = effectivePrefix.length + item.label.length
    return totalLength > max ? totalLength : max
  }, 0)

  const clampedSelected = Math.min(
    Math.max(selectedIndex, 0),
    Math.max(items.length - 1, 0),
  )
  const visibleCount = Math.min(Math.max(maxVisible, 1), items.length)

  const maxStart = Math.max(items.length - visibleCount, 0)
  const idealStart = clampedSelected - Math.floor((visibleCount - 1) / 2)
  const start = Math.max(0, Math.min(idealStart, maxStart))
  const visibleItems = items.slice(start, start + visibleCount)

  const renderSuggestionItem = (item: SuggestionItem, idx: number) => {
    const absoluteIndex = start + idx
    const isSelected = absoluteIndex === clampedSelected
    const labelLength = effectivePrefix.length + item.label.length
    const paddingLength = Math.max(maxLabelLength - labelLength + 2, 2)
    const padding = ' '.repeat(paddingLength)
    const textColor = isSelected ? theme.agentContentText : theme.inputFg
    const descriptionColor = isSelected
      ? theme.agentContentText
      : theme.timestampUser
    const highlightColor = theme.agentPrefix

    return (
      <box
        key={item.id}
        style={{
          flexDirection: 'column',
          gap: 0,
          paddingLeft: 1,
          paddingRight: 1,
          paddingTop: 0,
          paddingBottom: 0,
          backgroundColor: isSelected ? theme.agentFocusedBg : theme.messageBg,
          width: '100%',
        }}
      >
        <text
          wrap={false}
          style={{
            fg: textColor,
            marginBottom: 0,
          }}
        >
          <span fg={theme.agentPrefix}>{effectivePrefix}</span>
          <HighlightedSubsequenceText
            text={item.label}
            indices={item.labelHighlightIndices}
            color={textColor}
            highlightColor={highlightColor}
          />
          <span>{padding}</span>
          <HighlightedSubsequenceText
            text={item.description}
            indices={item.descriptionHighlightIndices}
            color={descriptionColor}
            highlightColor={highlightColor}
          />
        </text>
      </box>
    )
  }

  return (
    <box
      style={{
        flexDirection: 'column',
        gap: 0,
        paddingLeft: 1,
        paddingRight: 1,
        paddingTop: 0,
        paddingBottom: 0,
        backgroundColor: theme.panelBg,
        width: '100%',
      }}
    >
      <box
        style={{
          flexDirection: 'column',
          gap: 0,
          backgroundColor: theme.messageBg,
          width: '100%',
        }}
      >
        {visibleItems.map(renderSuggestionItem)}
      </box>
    </box>
  )
}
