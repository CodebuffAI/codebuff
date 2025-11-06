import { TextAttributes } from '@opentui/core'

import { useTheme } from '../../hooks/use-theme'

interface DiffViewerProps {
  diffText: string
}

const DIFF_LINE_COLORS = {
  added: '#B6BD73',
  removed: '#BF6C69',
}

const lineColor = (line: string): { fg: string; attrs?: number } => {
  if (line.startsWith('@@')) {
    return { fg: 'cyan', attrs: TextAttributes.BOLD }
  }
  if (line.startsWith('+++') || line.startsWith('---')) {
    return { fg: 'gray', attrs: TextAttributes.BOLD }
  }
  if (
    line.startsWith('diff ') ||
    line.startsWith('index ') ||
    line.startsWith('rename ') ||
    line.startsWith('similarity ')
  ) {
    return { fg: 'gray' }
  }
  if (line.startsWith('+')) {
    return { fg: DIFF_LINE_COLORS.added }
  }
  if (line.startsWith('-')) {
    return { fg: DIFF_LINE_COLORS.removed }
  }
  if (line.startsWith('\\')) {
    return { fg: 'gray' }
  }
  return { fg: '' }
}

export const DiffViewer = ({ diffText }: DiffViewerProps) => {
  const theme = useTheme()
  const lines = diffText.split('\n')

  return (
    <box
      style={{ flexDirection: 'column', gap: 0, width: '100%', flexGrow: 1 }}
    >
      {lines
        .filter((rawLine) => !rawLine.startsWith('@@'))
        .map((rawLine, idx) => {
          const line = rawLine.length === 0 ? ' ' : rawLine
          const { fg, attrs } = lineColor(line)
          const resolvedFg = fg || theme.foreground
          return (
            <text key={`diff-line-${idx}`} style={{ wrapMode: 'none' }}>
              <span fg={resolvedFg} attributes={attrs}>
                {line}
              </span>
            </text>
          )
        })}
    </box>
  )
}
