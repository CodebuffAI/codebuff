/**
 * CommandPaletteScreen - Full-screen command palette overlay (Ctrl+P)
 *
 * Features:
 * - Unified searchable list of slash commands + project files
 * - Fuzzy subsequence matching with scoring (reuses fuzzyMatch logic)
 * - Enter executes the selected command (`/<id>`) or opens the selected file
 * - Escape closes the palette
 * - Empty query shows all commands + a capped set of files
 */

import { TextAttributes } from '@opentui/core'
import React, { useCallback, useMemo, useState } from 'react'

import { Button } from './button'
import { MultilineInput } from './multiline-input'
import { SelectableList } from './selectable-list'
import { useTerminalLayout } from '../hooks/use-terminal-layout'
import { useTheme } from '../hooks/use-theme'
import { createTextPasteHandler } from '../utils/strings'
import { isPlainEnterKey } from '../utils/terminal-enter-detection'
import { fuzzyMatch } from '../utils/fuzzy-match'

import { getAllPathsWithDirectories } from '@codebuff/common/project-file-tree'

import type { SelectableListItem } from './selectable-list'
import type { SlashCommand } from '../data/slash-commands'
import type { FileTreeNode } from '@codebuff/common/util/file'

const LAYOUT = {
  CONTENT_PADDING: 4,
  MAX_CONTENT_WIDTH: 100,
  PREFERRED_CONTENT_WIDTH: 80,
  INPUT_HEIGHT: 1,
  HEADER_HEIGHT: 1,
  MAX_LIST_HEIGHT: 20,
  /** Cap on files shown when the query is empty (commands are always all shown). */
  MAX_EMPTY_FILE_ITEMS: 50,
  /** Cap on total items rendered for performance. */
  MAX_RENDERED_ITEMS: 200,
} as const

/** Discriminated palette entry: a slash command or a file path. */
export type PaletteEntry =
  | { kind: 'command'; command: SlashCommand }
  | { kind: 'file'; filePath: string; isDirectory: boolean }

interface CommandPaletteScreenProps {
  /** Slash commands (already merged with skills by the caller). */
  slashCommands: SlashCommand[]
  /** Project file tree (may be empty if not yet loaded). */
  fileTree: FileTreeNode[]
  /** Called when the user closes the palette without selecting. */
  onClose: () => void
  /** Called when the user selects a slash command; receives `/<id>`. */
  onExecuteCommand: (commandString: string) => void
  /** Called when the user selects a file path. */
  onSelectFile: (filePath: string, isDirectory: boolean) => void
}

/**
 * Build palette entries from commands + flattened file tree.
 * Commands always come first; files follow.
 */
export function buildEntries(
  slashCommands: SlashCommand[],
  fileTree: FileTreeNode[],
  maxFileItems: number,
): PaletteEntry[] {
  const commandEntries: PaletteEntry[] = slashCommands.map((command) => ({
    kind: 'command',
    command,
  }))

  const allFiles = getAllPathsWithDirectories(fileTree)
  const fileEntries: PaletteEntry[] = allFiles
    .slice(0, maxFileItems)
    .map((info) => ({
      kind: 'file',
      filePath: info.path,
      isDirectory: info.isDirectory,
    }))

  return [...commandEntries, ...fileEntries]
}

/**
 * Score an entry against a query. Lower is better. Returns null if no match.
 */
export function scoreEntry(entry: PaletteEntry, query: string): number | null {
  if (!query) return 0
  const normalized = query.toLowerCase()

  if (entry.kind === 'command') {
    const idLower = entry.command.id.toLowerCase()
    const labelLower = entry.command.label.toLowerCase()
    const descLower = entry.command.description.toLowerCase()

    // Exact / prefix matches rank highest
    if (idLower === normalized) return -1000
    if (labelLower === normalized) return -990
    if (idLower.startsWith(normalized)) return -900
    if (labelLower.startsWith(normalized)) return -890

    // Substring in id/label
    if (idLower.includes(normalized)) return -800 + idLower.indexOf(normalized)
    if (labelLower.includes(normalized))
      return -790 + labelLower.indexOf(normalized)
    if (descLower.includes(normalized))
      return -700 + descLower.indexOf(normalized)

    // Fuzzy fallback on the label
    const fuzzy = fuzzyMatch(entry.command.label, normalized)
    return fuzzy ? fuzzy.score - 500 : null
  }

  // File entry
  const pathLower = entry.filePath.toLowerCase()
  const fileName = entry.filePath.slice(entry.filePath.lastIndexOf('/') + 1)
  const fileNameLower = fileName.toLowerCase()

  if (pathLower === normalized) return -1000
  if (fileNameLower === normalized) return -990
  if (fileNameLower.startsWith(normalized)) return -950
  if (pathLower.startsWith(normalized)) return -900
  if (fileNameLower.includes(normalized))
    return -800 + fileNameLower.indexOf(normalized)
  if (pathLower.includes(normalized))
    return -700 + pathLower.indexOf(normalized)

  const fuzzy = fuzzyMatch(entry.filePath, normalized)
  return fuzzy ? fuzzy.score - 500 : null
}

/**
 * Convert a palette entry to a SelectableListItem for rendering.
 */
export function entryToListItem(entry: PaletteEntry): SelectableListItem {
  if (entry.kind === 'command') {
    return {
      id: `cmd:${entry.command.id}`,
      label: entry.command.id,
      icon: '▸',
      secondary: entry.command.description,
      accent: true,
    }
  }
  return {
    id: `file:${entry.filePath}`,
    label: entry.filePath,
    icon: entry.isDirectory ? '📁' : '📄',
    secondary: entry.isDirectory ? 'dir' : undefined,
  }
}

export const CommandPaletteScreen: React.FC<CommandPaletteScreenProps> = ({
  slashCommands,
  fileTree,
  onClose,
  onExecuteCommand,
  onSelectFile,
}) => {
  const theme = useTheme()
  const { terminalWidth, terminalHeight } = useTerminalLayout()

  const [searchQuery, setSearchQuery] = useState('')
  const [searchCursor, setSearchCursor] = useState(0)
  const [focusedIndex, setFocusedIndex] = useState(0)

  // Keep the complete searchable corpus. Only the empty-query presentation is
  // capped; otherwise files after the first 50 could never be discovered.
  const allEntries = useMemo(
    () => buildEntries(slashCommands, fileTree, Number.MAX_SAFE_INTEGER),
    [slashCommands, fileTree],
  )

  // Filter + sort entries by fuzzy score
  const filteredEntries = useMemo(() => {
    const trimmed = searchQuery.trim()
    if (!trimmed) {
      const commandEntries = allEntries.filter(
        (entry) => entry.kind === 'command',
      )
      const fileEntries = allEntries
        .filter((entry) => entry.kind === 'file')
        .slice(0, LAYOUT.MAX_EMPTY_FILE_ITEMS)
      return [...commandEntries, ...fileEntries]
    }

    const scored: { entry: PaletteEntry; score: number }[] = []
    for (const entry of allEntries) {
      const score = scoreEntry(entry, trimmed)
      if (score !== null) {
        scored.push({ entry, score })
      }
    }
    scored.sort((a, b) => a.score - b.score)
    return scored.slice(0, LAYOUT.MAX_RENDERED_ITEMS).map((s) => s.entry)
  }, [allEntries, searchQuery])

  const items = useMemo(
    () => filteredEntries.map(entryToListItem),
    [filteredEntries],
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
      const entry = filteredEntries[idx]
      if (!entry) return
      if (entry.kind === 'command') {
        onExecuteCommand(`/${entry.command.id}`)
      } else {
        onSelectFile(entry.filePath, entry.isDirectory)
      }
    },
    [items, filteredEntries, onExecuteCommand, onSelectFile],
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
            Command Palette
          </text>
          <text style={{ fg: theme.muted }}>
            {'  '}Type to search commands and files · Enter to run · Esc to
            close
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
            placeholder="Search commands or files..."
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
                ? `No matches for "${searchQuery.trim()}"`
                : 'No commands or files available'
            }
          />
        </box>
      </box>
    </box>
  )
}
