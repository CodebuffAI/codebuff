import { RaisedPill } from './raised-pill'
import { useTheme } from '../hooks/use-theme'

import type { AgentMode } from '../utils/constants'
import type { ChatTheme } from '../types/theme-system'

const getModeConfig = (theme: ChatTheme) =>
  ({
    FAST: {
      frameColor: theme.modeFastBg,
      textColor: theme.modeFastText,
      label: 'FAST',
    },
    MAX: {
      frameColor: theme.modeMaxBg,
      textColor: theme.modeMaxText,
      label: '💪 MAX',
    },
    PLAN: {
      frameColor: theme.modePlanBg,
      textColor: theme.modePlanText,
      label: '📋 PLAN',
    },
  }) as const

export const AgentModeToggle = ({
  mode,
  onToggle,
}: {
  mode: AgentMode
  onToggle: () => void
}) => {
  const theme = useTheme()
  const config = getModeConfig(theme)
  const { frameColor, textColor, label } = config[mode]

  return (
    <RaisedPill
      segments={[{ text: label, fg: textColor }]}
      frameColor={frameColor}
      textColor={textColor}
      onPress={onToggle}
    />
  )
}
