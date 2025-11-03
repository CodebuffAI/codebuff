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

  const bgColor = isFast ? '#0a6515' : '#ac1626'
  const textColor = '#ffffff'
  const label = isFast ? 'FAST' : '💪 MAX'

  return (
    <box
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: bgColor,
        paddingLeft: isFast ? 2 : 1,
        paddingRight: isFast ? 2 : 1,
      }}
      onMouseDown={onToggle}
    >
      <text wrap={false}>
        <span fg={textColor}>{label}</span>
      </text>
    </box>
  )
}
