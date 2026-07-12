import React from 'react'

import { detectEngineProfiles } from '@codebuff/common/util/engine-profiles'
import { getGameDevSlashCommands } from '@codebuff/common/util/game-dev-presets'
import type { FileTreeNode } from '@codebuff/common/util/file'

import { BottomBanner } from './bottom-banner'
import { useTheme } from '../hooks/use-theme'
import { useChatStore } from '../state/chat-store'

const HELP_TIMEOUT = 60 * 1000 // 60 seconds

/** Section header component for consistent styling */
const SectionHeader = ({ children }: { children: React.ReactNode }) => {
  const theme = useTheme()
  return <text style={{ fg: theme.muted }}>{children}</text>
}

/** Keyboard shortcut item */
const Shortcut = ({ keys, action }: { keys: string; action: string }) => {
  const theme = useTheme()
  return (
    <box style={{ flexDirection: 'row', gap: 1 }}>
      <text style={{ fg: theme.foreground }}>{keys}</text>
      <text style={{ fg: theme.muted }}>{action}</text>
    </box>
  )
}

/** Help banner showing keyboard shortcuts and tips in an organized layout. */
export const HelpBanner = ({ fileTree }: { fileTree?: FileTreeNode[] }) => {
  const setInputMode = useChatStore((state) => state.setInputMode)
  const theme = useTheme()

  // Auto-hide after timeout
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setInputMode('default')
    }, HELP_TIMEOUT)
    return () => clearTimeout(timer)
  }, [setInputMode])

  // Detect game engines from the project file tree (optional).
  const engineProfiles = React.useMemo(
    () => (fileTree ? detectEngineProfiles(fileTree) : []),
    [fileTree],
  )
  const gameDevCommands = React.useMemo(
    () =>
      engineProfiles.length > 0
        ? getGameDevSlashCommands(engineProfiles.map((p) => p.id))
        : [],
    [engineProfiles],
  )

  return (
    <BottomBanner borderColorKey="info" onClose={() => setInputMode('default')}>
      <box style={{ flexDirection: 'column', gap: 1, flexGrow: 1 }}>
        {/* Shortcuts Section */}
        <box style={{ flexDirection: 'column', gap: 0 }}>
          <SectionHeader>Shortcuts</SectionHeader>
          <box
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              columnGap: 2,
              paddingLeft: 2,
            }}
          >
            <Shortcut keys="Ctrl+C / Esc" action="stop" />
            <Shortcut
              keys="Ctrl+J / Shift+Enter / Opt+Enter"
              action="newline"
            />
            <Shortcut keys="↑↓" action="history" />
            <Shortcut keys="PgUp / PgDn" action="scroll output" />
            <Shortcut keys="Ctrl+P" action="command palette" />
            <Shortcut keys="Ctrl+R" action="search prompt history" />
            <Shortcut keys="Ctrl+V" action="paste text/image" />
            <Shortcut keys="Tab / Shift+Tab" action="navigate suggestions" />
            <Shortcut keys="Ctrl+T" action="collapse/expand agents" />
          </box>
        </box>

        {/* Features Section */}
        <box style={{ flexDirection: 'column', gap: 0 }}>
          <SectionHeader>Features</SectionHeader>
          <box
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              columnGap: 2,
              paddingLeft: 2,
            }}
          >
            <Shortcut keys="/" action="commands" />
            <Shortcut keys="@files" action="mention" />
            <Shortcut keys="@agents" action="use agent" />
            <Shortcut keys="!bash" action="run command" />
          </box>
        </box>

        {/* Tips Section */}
        <box style={{ flexDirection: 'column', gap: 0 }}>
          <SectionHeader>Tips</SectionHeader>
          <box style={{ flexDirection: 'column', paddingLeft: 2 }}>
            <text style={{ fg: theme.muted }}>
              Use @ to reference agents to spawn or files to read
            </text>
            <text style={{ fg: theme.muted }}>
              Esc to cancel the current response
            </text>
          </box>
        </box>

        {/* Game Dev Section (only when a game engine is detected) */}
        {engineProfiles.length > 0 && (
          <box style={{ flexDirection: 'column', gap: 0 }}>
            <SectionHeader>Game Dev</SectionHeader>
            <box style={{ flexDirection: 'column', paddingLeft: 2, gap: 0 }}>
              <text style={{ fg: theme.muted }}>
                {engineProfiles.map((p) => p.displayName).join(', ')} detected
              </text>
              <box
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  columnGap: 2,
                  paddingTop: 0,
                  paddingBottom: 0,
                }}
              >
                {gameDevCommands.map((cmd) => (
                  <box key={cmd.id} style={{ flexDirection: 'row', gap: 1 }}>
                    <text style={{ fg: theme.foreground }}>{`/${cmd.id}`}</text>
                    <text style={{ fg: theme.muted }}>{cmd.description}</text>
                  </box>
                ))}
              </box>
            </box>
          </box>
        )}
      </box>
    </BottomBanner>
  )
}
