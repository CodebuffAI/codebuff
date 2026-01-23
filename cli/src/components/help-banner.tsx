import React from 'react'

import { BottomBanner } from './bottom-banner'
import { useChatStore } from '../state/chat-store'
import { useTheme } from '../hooks/use-theme'

const HELP_TIMEOUT = 60 * 1000 // 60 seconds

/** Section header component for consistent styling */
const SectionHeader = ({ children }: { children: React.ReactNode }) => {
  const theme = useTheme()
  return <text style={{ fg: theme.muted }}>{children}</text>
}

/** Keyboard shortcut item */
const Shortcut = ({
  keys,
  action,
}: {
  keys: string
  action: string
}) => {
  const theme = useTheme()
  return (
    <box style={{ flexDirection: 'row', gap: 1 }}>
      <text style={{ fg: theme.foreground }}>{keys}</text>
      <text style={{ fg: theme.muted }}>{action}</text>
    </box>
  )
}

/** Help banner showing keyboard shortcuts and tips in an organized layout. */
export const HelpBanner = () => {
  const setInputMode = useChatStore((state) => state.setInputMode)
  const theme = useTheme()

  // Auto-hide after timeout
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setInputMode('default')
    }, HELP_TIMEOUT)
    return () => clearTimeout(timer)
  }, [setInputMode])

  return (
    <BottomBanner
      borderColorKey="info"
      onClose={() => setInputMode('default')}
    >
      <box style={{ flexDirection: 'column', gap: 1, flexGrow: 1 }}>
        {/* Shortcuts Section */}
        <box style={{ flexDirection: 'column', gap: 0 }}>
          <SectionHeader>Shortcuts</SectionHeader>
          <box style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 2, paddingLeft: 2 }}>
            <Shortcut keys="Ctrl+C / Esc" action="stop" />
            <Shortcut keys="Ctrl+J / Opt+Enter" action="newline" />
            <Shortcut keys="↑↓" action="history" />
            <Shortcut keys="Ctrl+T" action="collapse/expand agents" />
          </box>
        </box>

        {/* Features Section */}
        <box style={{ flexDirection: 'column', gap: 0 }}>
          <SectionHeader>Features</SectionHeader>
          <box style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 2, paddingLeft: 2 }}>
            <Shortcut keys="/" action="commands" />
            <Shortcut keys="@files" action="mention" />
            <Shortcut keys="@agents" action="use agent" />
            <Shortcut keys="!bash" action="run command" />
          </box>
        </box>

        {/* Credits Section */}
        <box style={{ flexDirection: 'column', gap: 0 }}>
          <SectionHeader>Credits</SectionHeader>
          <box style={{ flexDirection: 'column', paddingLeft: 2 }}>
            <box style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 1 }}>
              <text style={{ fg: theme.foreground }}>1 credit = 1 cent</text>
              <text style={{ fg: theme.muted }}>·</text>
              <text style={{ fg: theme.foreground }}>/buy-credits</text>
              <text style={{ fg: theme.muted }}>·</text>
              <text style={{ fg: theme.foreground }}>/usage</text>
              <text style={{ fg: theme.muted }}>·</text>
              <text style={{ fg: theme.foreground }}>/ads:enable</text>
            </box>
            <text style={{ fg: theme.muted }}>
              Connect your Claude subscription for Default & Max modes
            </text>
          </box>
        </box>
      </box>
    </BottomBanner>
  )
}
