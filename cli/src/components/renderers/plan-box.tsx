import { memo } from 'react'

import { useTheme } from '../../hooks/use-theme'
import { renderMarkdown, type MarkdownPalette } from '../../utils/markdown-renderer'
import { BORDER_CHARS } from '../../utils/ui-constants'
import { BuildModeButtons } from '../build-mode-buttons'

interface PlanBoxProps {
  planContent: string
  availableWidth: number
  markdownPalette: MarkdownPalette
  onBuildFast: () => void
  onBuildMax: () => void
  onBuildFree: () => void
}

export const PlanBox = memo(
  ({
    planContent,
    availableWidth,
    markdownPalette,
    onBuildFast,
    onBuildMax,
    onBuildFree,
  }: PlanBoxProps) => {
    const theme = useTheme()

    return (
      <box
        style={{
          flexDirection: 'column',
          gap: 1,
          width: '100%',
          borderStyle: 'single',
          borderColor: theme.secondary,
          customBorderChars: BORDER_CHARS,
          paddingLeft: 1,
          paddingRight: 1,
          paddingTop: 0,
          paddingBottom: 1,
        }}
      >
        <text style={{ wrapMode: 'word', fg: theme.foreground }}>
          {renderMarkdown(planContent, {
            codeBlockWidth: Math.max(10, availableWidth - 8),
            palette: markdownPalette,
          })}
        </text>
        <BuildModeButtons
          theme={theme}
          onBuildFast={onBuildFast}
          onBuildMax={onBuildMax}
          onBuildFree={onBuildFree}
        />
      </box>
    )
  },
)

