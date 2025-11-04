import type { ChatTheme } from '../types/theme-system'
import type { AgentMode } from '../utils/constants'

export const AgentModeToggle = ({
  mode,
  theme,
  onToggle,
}: {
  mode: AgentMode
  theme: ChatTheme
  onToggle: () => void
}) => {
  const isFast = mode === 'FAST'
  const isMax = mode === 'MAX'
  const isPlan = mode === 'PLAN'

  const bgColor = isFast ? '#0a6515' : isMax ? '#ac1626' : '#1e40af'
  const textColor = '#ffffff'
  const label = isFast ? 'FAST' : isMax ? '💪 MAX' : 'PLAN'

  const needsPadding = isFast || isPlan

  return (
    <box
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: bgColor,
        paddingLeft: needsPadding ? 2 : 1,
        paddingRight: needsPadding ? 2 : 1,
      }}
      onMouseDown={onToggle}
    >
      <text wrap={false}>
        <span fg={textColor}>{label}</span>
      </text>
    </box>
  )
}
