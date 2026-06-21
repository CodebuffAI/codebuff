import { memo } from 'react'

import { useTheme } from '../../hooks/use-theme'
import { BORDER_CHARS } from '../../utils/ui-constants'

import type {
  GateStateContentBlock,
  GateStateStatus,
} from '../../types/chat'
import type { ChatTheme } from '../../types/theme-system'

interface GateStateBoxProps {
  block: GateStateContentBlock
}

const STATUS_LABEL: Record<GateStateStatus, string> = {
  pending: 'PENDING',
  passed: 'PASSED',
  failed: 'FAILED',
  skipped: 'SKIPPED',
}

const STATUS_ICON: Record<GateStateStatus, string> = {
  pending: '…',
  passed: '✓',
  failed: '✗',
  skipped: '–',
}

const statusColor = (status: GateStateStatus, theme: ChatTheme): string => {
  switch (status) {
    case 'passed':
      return theme.success
    case 'failed':
      return theme.error
    case 'pending':
      return theme.warning
    case 'skipped':
      return theme.secondary
  }
}

export const GateStateBox = memo(
  ({ block }: GateStateBoxProps) => {
    const theme = useTheme()
    const color = statusColor(block.gateStatus, theme)
    const heading = `${STATUS_ICON[block.gateStatus]} ${block.origin ?? 'Gate'} · ${block.gate} · ${STATUS_LABEL[block.gateStatus]}`

    return (
      <box
        style={{
          flexDirection: 'column',
          gap: 0,
          width: '100%',
          borderStyle: 'single',
          borderColor: color,
          customBorderChars: BORDER_CHARS,
          paddingLeft: 1,
          paddingRight: 1,
          paddingTop: 0,
          paddingBottom: 0,
        }}
      >
        <text style={{ fg: color }}>{heading}</text>
        {block.details ? (
          <text
            style={{
              wrapMode: 'word',
              fg: theme.foreground,
            }}
          >
            {block.details}
          </text>
        ) : null}
      </box>
    )
  },
)
