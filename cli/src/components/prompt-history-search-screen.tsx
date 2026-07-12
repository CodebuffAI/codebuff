/**
 * PromptHistorySearchScreen - Full-screen fuzzy search over past user prompts
 * (Ctrl+R or `/prompts`).
 *
 * Features:
 * - Loads ALL prompts via `loadMessageHistory()` (most-recent-last on disk),
 *   reverses to most-recent-first for display, and filters in-memory.
 * - Fuzzy subsequence matching with scoring (reuses `fuzzyMatch`).
 * - Enter selects the focused prompt and hands it back to the input bar.
 * - Escape / Ctrl-C closes without selecting.
 * - Empty query shows the most recent ~200 prompts; typing filters them.
 *
 * Note: Ctrl+R is the standard reverse-i-search binding in shells. Because
 * Openbuff runs in its own TUI (not a raw shell), this binding is safe to
 * repurpose here for global prompt history search.
 */

import { TextAttributes } from '@opentui/core'
import React, { useCallback, useMemo, useState } from 'react'

import { MultilineInput } from './multiline-input'
import { SelectableList } from './selectable-list'
import { useTerminalLayout } from '../hooks/use-terminal-layout'
import { useTheme } from '../hooks/use-theme'
import { loadMessageHistory } from '../utils/message-history'
import { createTextPasteHandler } from '../utils/strings'
import { isPlainEnterKey } from '../utils/terminal-enter-detection'
import { fuzzyMatch } from '../utils/fuzzy-match'

import type { SelectableListItem } from './selectable-list'

const LAYOUT = {
  CONTENT_PADDING: 4,
  MAX_CONTENT_WIDTH: 100,
  PREFERRED_CONTENT_WIDTH: 80,
  INPUT_HEIGHT: 1,
  HEADER_HEIGHT: 1,
  MAX_LIST_HEIGHT: 20,
  /** Cap on total items rendered for performance. */
  MAX_RENDERED_ITEMS: 200,
} as const

interface PromptHistorySearchScreenProps {
  /** Called when the user closes the overlay without selecting. */
  onClose: () => void
  /** Called when the user selects a prompt; receives the prompt text. */
  onSelectPrompt: (text: string) => void
}

/**
 * Pure helper that filters and scores prompts against a query.
 * - Empty query returns the prompts as-is, capped at `limit` (most-recent-first
 *   is expected from the caller).
 * - Non-empty query runs `fuzzyMatch` (subsequence scoring) on each prompt,
 *   keeps matches, sorts by score ascending (best/best-scored first, matching
 *   the command-palette-screen convention where lower fuzzyMatch scores are
 *   better), and caps at `limit`.
 *
 * Exported so tests can exercise the scoring logic without rendering React.
 */
export function filterAndScorePrompts(
  prompts: string[],
  query: string,
  limit: number,
): string[] {
  const trimmed = query.trim()
  if (!trimmed) {
    return prompts.slice(0, limit)
  }

  const scored: { prompt: string; score: number }[] = []
  for (const prompt of prompts) {
    const result = fuzzyMatch(prompt, trimmed)
    if (result) {
      scored.push({ prompt, score: result.score })
    }
  }
  // Lower fuzzyMatch score = better match; sort ascending so best matches first.
  scored.sort((a, b) => a.score - b.score)
  return scored.slice(0, limit).map((s) => s.prompt)
}

export const PromptHistorySearchScreen: React.FC<
  PromptHistorySearchScreenProps
> = ({ onClose, onSelectPrompt }) => {
  const theme = useTheme()
  const { terminalWidth, terminalHeight } = useTerminalLayout()

  const [searchQuery, setSearchQuery] = useState('')
  const [searchCursor, setSearchCursor] = useState(0)
  const [focusedIndex, setFocusedIndex] = useState(0)

  // Load the full prompt history once on mount. `loadMessageHistory()` returns
  // most-recent-last; reverse so the most recent prompt is first for display.
  const allPrompts = useMemo(() => {
    const history = loadMessageHistory()
    return [...history].reverse()
  }, [])

  const filteredPrompts = useMemo(
    () =>
      filterAndScorePrompts(allPrompts, searchQuery, LAYOUT.MAX_RENDERED_ITEMS),
    [allPrompts, searchQuery],
  )

  const items = useMemo<SelectableListItem[]>(
    () =>
      filteredPrompts.map((prompt, index) => ({
        id: `prompt:${index}:${prompt}`,
        label: prompt.replace(/\n/g, ' '),
        icon: '▸',
      })),
    [filteredPrompts],
  )

  // Clamp focused index when the filtered list shrinks
  const clampedFocusedIndex = Math.min(
    focusedIndex,
    Math.max(0, items.length - 1),
  )

  const handleSelect = useCallback(
    (item: SelectableListItem) => {
      const idx = items.findIndex((i) => i.id === item.id)
      if (idx === -1) return
      const prompt = filteredPrompts[idx]
      if (!prompt) return
      // Close the overlay BEFORE updating the input so the keyboard hook does
      // not re-interpret the keypress while the overlay is unmounting.
      onClose()
      onSelectPrompt(prompt)
    },
    [items, filteredPrompts, onClose, onSelectPrompt],
  )

  const handleKeyIntercept = useCallback(
    (key: {
      name?: string
      sequence?: string
      shift?: boolean
      ctrl?: boolean
      meta?: boolean
      option?: boolean
    }) => {
      if (key.name === 'escape') {
        onClose()
        return true
      }
      if (key.name === 'up') {
        setFocusedIndex((prev) => Math.max(0, prev - 1))
        return true
      }
      if (key.name === 'down') {
        setFocusedIndex((prev) => Math.min(items.length - 1, prev + 1))
        return true
      }
      if (isPlainEnterKey(key)) {
        const focused = items[clampedFocusedIndex]
        if (focused) {
          handleSelect(focused)
        }
        return true
      }
      if (key.name === 'c' && key.ctrl) {
        onClose()
        return true
      }
      // Let printable keys through to the input
      return false
    },
    [items, clampedFocusedIndex, handleSelect, onClose],
  )

  const contentMaxWidth = Math.min(
    terminalWidth - LAYOUT.CONTENT_PADDING,
    LAYOUT.MAX_CONTENT_WIDTH,
  )
  const contentWidth = Math.min(LAYOUT.PREFERRED_CONTENT_WIDTH, contentMaxWidth)
  const availableListHeight = Math.max(
    3,
    terminalHeight - LAYOUT.HEADER_HEIGHT - LAYOUT.INPUT_HEIGHT - 2,
  )
  const listHeight = Math.min(
    LAYOUT.MAX_LIST_HEIGHT,
    availableListHeight,
    Math.max(items.length, 1),
  )

  return (
    <box
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: theme.surface,
        padding: 0,
        flexDirection: 'column',
      }}
    >
      <box
        style={{
          flexDirection: 'column',
          width: contentWidth,
          paddingLeft: LAYOUT.CONTENT_PADDING,
          paddingRight: LAYOUT.CONTENT_PADDING,
          paddingTop: 1,
          paddingBottom: 1,
          flexGrow: 1,
          flexShrink: 1,
        }}
      >
        {/* Header */}
        <box style={{ height: LAYOUT.HEADER_HEIGHT, flexShrink: 0 }}>
          <text
            style={{
              fg: theme.primary,
              attributes: TextAttributes.BOLD,
            }}
          >
            Prompt History Search
          </text>
          <text style={{ fg: theme.muted }}>
            {'  '}Type to fuzzy-search past prompts · Enter to use · Esc to
            close · Ctrl+R toggles
          </text>
        </box>

        {/* Search input */}
        <box style={{ flexShrink: 0, marginBottom: 0, marginTop: 0 }}>
          <MultilineInput
            value={searchQuery}
            onChange={({ text, cursorPosition }) => {
              setSearchQuery(text)
              setSearchCursor(cursorPosition)
              setFocusedIndex(0)
            }}
            onSubmit={() => {}}
            onPaste={createTextPasteHandler(
              searchQuery,
              Math.min(searchCursor, searchQuery.length),
              ({ text, cursorPosition }) => {
                setSearchQuery(text)
                setSearchCursor(cursorPosition)
                setFocusedIndex(0)
              },
            )}
            onKeyIntercept={handleKeyIntercept}
            placeholder="Search past prompts..."
            focused={true}
            maxHeight={1}
            minHeight={1}
            cursorPosition={Math.min(searchCursor, searchQuery.length)}
          />
        </box>

        {/* Results list */}
        <box
          style={{
            flexDirection: 'column',
            width: contentWidth,
            borderStyle: 'single',
            borderColor: theme.muted,
            flexGrow: 1,
            flexShrink: 1,
            overflow: 'hidden',
          }}
          border={['top', 'bottom', 'left', 'right']}
        >
          <SelectableList
            items={items}
            focusedIndex={clampedFocusedIndex}
            onFocusChange={setFocusedIndex}
            onSelect={handleSelect}
            maxHeight={listHeight}
            emptyMessage={
              searchQuery.trim()
                ? `No prompts matching "${searchQuery.trim()}"`
                : 'No prompt history yet'
            }
          />
        </box>
      </box>
    </box>
  )
}
