import { TextAttributes } from '@opentui/core'

import { useTheme } from '../../hooks/use-theme'
import { wrapTextToVisualLines } from '../../utils/text-layout'

interface DiffViewerProps {
  diffText: string
  availableWidth?: number
}

const DIFF_LINE_COLORS = {
  dark: {
    added: '#7ACC35',
    removed: '#BF6C69',
  },
  light: {
    added: '#4A9E1C',
    removed: '#C53030',
  },
}

const lineColor = (
  line: string,
  themeName: 'dark' | 'light',
  mutedColor: string,
): { fg: string; attrs?: number } => {
  if (line.startsWith('@@')) {
    return { fg: 'cyan', attrs: TextAttributes.BOLD }
  }
  if (line.startsWith('+++') || line.startsWith('---')) {
    return { fg: mutedColor, attrs: TextAttributes.BOLD }
  }
  if (
    line.startsWith('diff ') ||
    line.startsWith('index ') ||
    line.startsWith('rename ') ||
    line.startsWith('similarity ')
  ) {
    return { fg: mutedColor }
  }
  if (line.startsWith('+')) {
    return { fg: DIFF_LINE_COLORS[themeName].added }
  }
  if (line.startsWith('-')) {
    return { fg: DIFF_LINE_COLORS[themeName].removed }
  }
  if (line.startsWith('\\')) {
    return { fg: mutedColor }
  }
  return { fg: '' }
}

export const DiffViewer = ({ diffText, availableWidth }: DiffViewerProps) => {
  const theme = useTheme()
  const width = Math.max(10, availableWidth ?? 80)

  const lines = diffText.trim().split('\n')

  return (
    <box
      style={{ flexDirection: 'column', gap: 0, width: '100%', flexGrow: 1 }}
    >
      {lines
        .filter((rawLine) => !rawLine.startsWith('@@'))
        .flatMap((rawLine, idx) => {
          const line = rawLine.length === 0 ? ' ' : rawLine
          const { fg, attrs } = lineColor(line, theme.name, theme.muted)
          const resolvedFg = fg || theme.foreground
          return wrapTextToVisualLines(line, width).map((wrappedLine, wrapIdx) => (
            <text
              key={`diff-line-${idx}-${wrapIdx}`}
              style={{ wrapMode: 'none' }}
            >
              <span fg={resolvedFg} attributes={attrs}>
                {wrappedLine}
              </span>
            </text>
          ))
        })}
    </box>
  )
}
