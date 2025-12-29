import os from 'os'

import React, { useCallback, useMemo, useState } from 'react'

import { Button } from './button'
import { MultilineInput } from './multiline-input'
import { SelectableList } from './selectable-list'
import { TerminalLink } from './terminal-link'
import { useDirectoryBrowser } from '../hooks/use-directory-browser'
import { cleanupRenderer } from '../utils/renderer-cleanup'
import { useLogo } from '../hooks/use-logo'
import { usePathTabCompletion } from '../hooks/use-path-tab-completion'
import { useSearchableList } from '../hooks/use-searchable-list'
import { useSheenAnimation } from '../hooks/use-sheen-animation'
import { useTerminalLayout } from '../hooks/use-terminal-layout'
import { useTheme } from '../hooks/use-theme'
import { formatCwd } from '../utils/path-helpers'
import { loadRecentProjects } from '../utils/recent-projects'
import { getLogoBlockColor, getLogoAccentColor } from '../utils/theme-system'

import type { SelectableListItem } from './selectable-list'

// Layout constants for responsive breakpoints
const LAYOUT = {
  // Content width constraints
  MAX_CONTENT_WIDTH: 80,
  PREFERRED_CONTENT_WIDTH: 60,
  CONTENT_PADDING: 4,

  // Height thresholds for showing UI elements
  MIN_HEIGHT_FOR_LOGO: 14,
  MIN_HEIGHT_FOR_HELP_TEXT: 18,
  MIN_HEIGHT_FOR_RECENTS: 10,

  // Thresholds for number of recent projects to show
  HEIGHT_FOR_3_RECENTS: 16,
  HEIGHT_FOR_2_RECENTS: 12,

  // Approximate heights of UI elements (in rows)
  BASE_HEIGHT: 10, // input (~3) + bottom bar (~3) + padding (~4)
  LOGO_HEIGHT: 8,
  HELP_TEXT_HEIGHT: 2,

  // Directory list constraints
  MIN_LIST_HEIGHT: 4,
  MAX_LIST_HEIGHT: 12,

  // Bottom bar height (border + content)
  BOTTOM_BAR_HEIGHT: 2,

  // Spacing constants
  MAIN_CONTENT_PADDING: 2,
  LOGO_MARGIN_TOP: 1,
  LOGO_MARGIN_BOTTOM: 1,
  HELP_TEXT_MARGIN_BOTTOM: 1,
  RECENTS_MARGIN_TOP: 1,
  RECENTS_PADDING_LEFT: 1,
} as const

interface ProjectPickerScreenProps {
  /** Called when user selects a directory to open as project */
  onSelectProject: (projectPath: string) => void
  /** Initial path to browse from */
  initialPath?: string
}

export const ProjectPickerScreen: React.FC<ProjectPickerScreenProps> = ({
  onSelectProject,
  initialPath,
}) => {
  const theme = useTheme()
  const [sheenPosition, setSheenPosition] = useState(0)

  // Directory browsing state and navigation
  const {
    currentPath,
    setCurrentPath,
    directories,
    isGitRepo,
    expandPath,
    tryNavigateToPath,
    navigateToDirectory,
  } = useDirectoryBrowser({ initialPath })

  // Convert directories to SelectableListItem format
  const directoryItems: SelectableListItem[] = useMemo(
    () =>
      directories.map((entry) => ({
        id: entry.path,
        label: entry.name,
        icon: entry.isParent ? '📂' : '📁',
        accent: entry.isGitRepo,
      })),
    [directories],
  )

  // Search filtering and focus management
  const {
    searchQuery,
    setSearchQuery,
    focusedIndex,
    setFocusedIndex,
    filteredItems: filteredDirectoryItems,
    handleFocusChange,
  } = useSearchableList({
    items: directoryItems,
    resetKey: currentPath,
  })

  // Load recent projects, excluding the home directory
  const recentProjects = useMemo(() => {
    const homeDir = os.homedir()
    return loadRecentProjects().filter((project) => project.path !== homeDir)
  }, [])

  // Use the terminal layout hook for responsive breakpoints
  const { width, terminalWidth, terminalHeight } = useTerminalLayout()
  const isNarrow = width.is('xs')
  const contentMaxWidth = Math.min(terminalWidth - LAYOUT.CONTENT_PADDING, LAYOUT.MAX_CONTENT_WIDTH)
  const contentWidth = Math.min(LAYOUT.PREFERRED_CONTENT_WIDTH, contentMaxWidth)

  // Granular responsive breakpoints for showing UI elements
  const canShowLogo = terminalHeight >= LAYOUT.MIN_HEIGHT_FOR_LOGO
  const canShowHelpText = terminalHeight >= LAYOUT.MIN_HEIGHT_FOR_HELP_TEXT
  const canShowRecents = terminalHeight >= LAYOUT.MIN_HEIGHT_FOR_RECENTS && recentProjects.length > 0
  
  // Limit number of recent projects based on available height
  const maxRecentsToShow = terminalHeight >= LAYOUT.HEIGHT_FOR_3_RECENTS ? 3 
    : terminalHeight >= LAYOUT.HEIGHT_FOR_2_RECENTS ? 2 
    : 1

  // Calculate available height for directory list dynamically
  const logoHeight = canShowLogo ? LAYOUT.LOGO_HEIGHT : 0
  const helpTextHeight = canShowHelpText ? LAYOUT.HELP_TEXT_HEIGHT : 0
  const recentsHeight = canShowRecents ? Math.min(recentProjects.length, maxRecentsToShow) + 1 : 0 // +1 for header
  const fixedElementsHeight = LAYOUT.BASE_HEIGHT + logoHeight + helpTextHeight + recentsHeight
  const availableListHeight = terminalHeight - fixedElementsHeight
  
  // Only show file picker if we have at least MIN_LIST_HEIGHT rows available
  const canShowFilePicker = availableListHeight >= LAYOUT.MIN_LIST_HEIGHT
  // Clamp the height between min and max
  const maxListHeight = canShowFilePicker 
    ? Math.min(availableListHeight, LAYOUT.MAX_LIST_HEIGHT) 
    : 0

  // Calculate actual content height to determine if we should center vertically
  const actualListHeight = canShowFilePicker ? Math.min(filteredDirectoryItems.length + 2, maxListHeight + 2) : 0 // +2 for border
  const inputHeight = 3 // input box with border
  const totalContentHeight = 
    LAYOUT.MAIN_CONTENT_PADDING * 2 + // top and bottom padding
    logoHeight + 
    (canShowLogo ? LAYOUT.LOGO_MARGIN_TOP + LAYOUT.LOGO_MARGIN_BOTTOM : 0) +
    helpTextHeight +
    (canShowHelpText ? LAYOUT.HELP_TEXT_MARGIN_BOTTOM : 0) +
    inputHeight +
    actualListHeight +
    recentsHeight +
    (canShowRecents ? LAYOUT.RECENTS_MARGIN_TOP : 0)
  
  // Available space for content (total height minus bottom bar)
  const availableContentHeight = terminalHeight - LAYOUT.BOTTOM_BAR_HEIGHT
  
  // Center content when it doesn't fill the available space
  const shouldCenterContent = totalContentHeight < availableContentHeight

  // Logo setup
  const blockColor = getLogoBlockColor(theme.name)
  const accentColor = getLogoAccentColor(theme.name)
  const { applySheenToChar } = useSheenAnimation({
    logoColor: theme.foreground,
    accentColor,
    blockColor,
    terminalWidth,
    sheenPosition,
    setSheenPosition,
  })

  const { component: logoComponent } = useLogo({
    availableWidth: contentMaxWidth,
    applySheenToChar,
    textColor: theme.foreground,
  })

  // Handle directory selection from SelectableList
  const handleDirectorySelect = useCallback(
    (item: SelectableListItem) => {
      const entry = directories.find((d) => d.path === item.id)
      if (entry) {
        navigateToDirectory(entry)
      }
    },
    [directories, navigateToDirectory],
  )

  // Select current directory as project
  const selectCurrentDirectory = useCallback(() => {
    onSelectProject(currentPath)
  }, [currentPath, onSelectProject])

  // Tab completion for path input
  const { handleTabCompletion } = usePathTabCompletion({
    searchQuery,
    setSearchQuery,
    currentPath,
    setCurrentPath,
    expandPath,
  })

  // Handle search input keyboard intercept
  const handleSearchKeyIntercept = useCallback(
    (key: { name?: string; shift?: boolean; ctrl?: boolean }) => {
      if (key.name === 'escape') {
        if (searchQuery.length > 0) {
          setSearchQuery('')
        }
        return true
      }
      if (key.name === 'tab') {
        return handleTabCompletion()
      }
      if (key.name === 'up') {
        setFocusedIndex((prev) => Math.max(0, prev - 1))
        return true
      }
      if (key.name === 'down') {
        setFocusedIndex((prev) =>
          Math.min(filteredDirectoryItems.length - 1, prev + 1),
        )
        return true
      }
      if (key.name === 'return' || key.name === 'enter') {
        // If search looks like a path, try to navigate there directly
        if (searchQuery.startsWith('/') || searchQuery.startsWith('~')) {
          if (tryNavigateToPath(searchQuery)) {
            return true
          }
        }
        // Otherwise, navigate to the focused directory
        const focused = filteredDirectoryItems[focusedIndex]
        if (focused) {
          const entry = directories.find((d) => d.path === focused.id)
          if (entry) {
            navigateToDirectory(entry)
          }
        }
        return true
      }
      // Ctrl+C always quits
      if (key.name === 'c' && key.ctrl) {
        cleanupRenderer()
        process.exit(0)
        return true
      }
      // All other single-character keys should go to the input for typing
      return false
    },
    [
      searchQuery,
      setSearchQuery,
      handleTabCompletion,
      setFocusedIndex,
      filteredDirectoryItems,
      focusedIndex,
      tryNavigateToPath,
      directories,
      navigateToDirectory,
    ],
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
      {/* Main content area - fills available space */}
      <box
        style={{
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: shouldCenterContent ? 'center' : 'flex-start',
          width: '100%',
          padding: LAYOUT.MAIN_CONTENT_PADDING,
          gap: 1,
          flexGrow: 1,
          flexShrink: 1,
        }}
      >
        {/* Logo - show when terminal height >= 14 */}
        {canShowLogo && (
          <box
            style={{
              flexDirection: 'column',
              alignItems: 'center',
              width: '100%',
              marginTop: LAYOUT.LOGO_MARGIN_TOP,
              marginBottom: LAYOUT.LOGO_MARGIN_BOTTOM,
              flexShrink: 0,
            }}
          >
            <box style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
              {logoComponent}
            </box>
          </box>
        )}

        {/* Help text - show when terminal height >= 18 */}
        {canShowHelpText && (
          <box
            style={{
              flexDirection: 'column',
              alignItems: 'center',
              maxWidth: contentMaxWidth,
              marginBottom: LAYOUT.HELP_TEXT_MARGIN_BOTTOM,
              flexShrink: 0,
            }}
          >
            <text style={{ fg: theme.muted, wrapMode: 'word' }}>
              Navigate to your project folder and press Open.
            </text>
          </box>
        )}

        {/* Search/filter input - always visible, high priority */}
        <box
          style={{
            width: contentWidth,
            flexShrink: 0,
            marginBottom: 0,
          }}
        >
          <MultilineInput
            value={searchQuery}
            onChange={({ text }) => setSearchQuery(text)}
            onSubmit={() => {}} // Enter key handled by onKeyIntercept
            onPaste={() => {}} // Paste not needed for path input
            onKeyIntercept={handleSearchKeyIntercept}
            placeholder="Type path or filter (Tab to complete)..."
            focused={true}
            maxHeight={1}
            minHeight={1}
            cursorPosition={searchQuery.length}
          />
        </box>

        {/* Directory list - only show if we have enough space */}
        {canShowFilePicker && (
          <box
            style={{
              flexDirection: 'column',
              width: contentWidth,
              borderStyle: 'single',
              borderColor: theme.muted,
              flexShrink: 0,
            }}
            border={['top', 'bottom', 'left', 'right']}
          >
            <SelectableList
              items={filteredDirectoryItems}
              focusedIndex={focusedIndex}
              maxHeight={maxListHeight}
              onSelect={handleDirectorySelect}
              onFocusChange={handleFocusChange}
              emptyMessage={
                searchQuery ? 'No matching directories' : 'No subdirectories'
              }
            />
          </box>
        )}

        {/* Recent Projects - show when terminal height >= 10 */}
        {canShowRecents && (
          <box
            style={{
              flexDirection: 'column',
              width: contentWidth,
              marginTop: LAYOUT.RECENTS_MARGIN_TOP,
              flexShrink: 0,
              gap: 0,
            }}
          >
            <text style={{ fg: theme.muted, height: 1 }}>Recent:</text>
            {recentProjects.slice(0, maxRecentsToShow).map((project, idx) => (
              <box
                key={project.path}
                style={{
                  flexDirection: 'row',
                  gap: 1,
                  paddingLeft: LAYOUT.RECENTS_PADDING_LEFT,
                  height: 1,
                }}
              >
                <text style={{ fg: theme.secondary }}>[{idx + 1}]</text>
                <TerminalLink
                  text={formatCwd(project.path)}
                  onActivate={() => onSelectProject(project.path)}
                  underlineOnHover={true}
                  containerStyle={{ width: 'auto' }}
                />
              </box>
            ))}
          </box>
        )}

      </box>

      {/* Bottom bar - fixed at bottom with Open button */}
      <box
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          paddingTop: 0,
          paddingBottom: 0,
          borderStyle: 'single',
          borderColor: theme.border,
          flexShrink: 0,
          backgroundColor: theme.surface,
        }}
        border={['top']}
      >
        <box
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: contentWidth,
          }}
        >
          {/* Current directory path */}
          <box style={{ flexGrow: 1, flexShrink: 1, overflow: 'hidden' }}>
            <text style={{ fg: theme.muted }}>
              {formatCwd(currentPath)}
            </text>
          </box>

          {/* Open button */}
          <Button
            onClick={selectCurrentDirectory}
            style={{
              paddingLeft: 2,
              paddingRight: 2,
              paddingTop: 0,
              paddingBottom: 0,
              borderStyle: 'single',
              borderColor: theme.primary,
              backgroundColor: theme.primary,
            }}
            border={['top', 'bottom', 'left', 'right']}
          >
            <text style={{ fg: '#1a1a1a' }}>Open</text>
          </Button>
        </box>
      </box>
    </box>
  )
}
