import { AgentMode } from '../utils/constants'
import type { ChatTheme } from '../utils/theme-system'
import { RaisedPill } from './raised-pill'

export const AgentModeToggle = ({
  mode,
  theme,
  onToggle,
}: {
  mode: AgentMode,
  theme: ChatTheme
  onToggle: () => void
}) => {
  const isFast = mode === 'FAST'
  const frameColor = isFast ? theme.modeToggleFastBg : theme.modeToggleMaxBg
  const textColor = isFast ? theme.modeToggleFastText : theme.modeToggleMaxText
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
