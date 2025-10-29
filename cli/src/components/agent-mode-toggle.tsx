import type { ChatTheme } from '../utils/theme-system'
import { RaisedPill } from './raised-pill'

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
  const frameColor = isFast
    ? theme.agentToggleHeaderBg
    : theme.agentToggleExpandedBg
  const textColor = frameColor
  const label = isFast ? 'FAST' : '💪 MAX'

  return (
    <RaisedPill
      segments={[{ text: label, fg: textColor }]}
      frameColor={frameColor}
      textColor={textColor}
      onPress={onToggle}
    />
  )
}
