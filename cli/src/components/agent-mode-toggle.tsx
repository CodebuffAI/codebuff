import type { ChatTheme } from '../utils/theme-system'

export const AgentModeToggle = ({
  mode,
  theme,
  onToggle,
}: {
  mode: 'FAST' | 'MAX'
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
        alignSelf: 'flex-end',
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
