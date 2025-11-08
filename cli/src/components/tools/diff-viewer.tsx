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
  const filteredLines = lines.filter((rawLine) => !rawLine.startsWith('@@'))

  return (
    <text style={{ wrapMode: 'none', marginTop: 0, marginBottom: 0 }}>
      {filteredLines.map((rawLine, idx) => {
        const line = rawLine.length === 0 ? ' ' : rawLine
        const { fg, attrs } = lineColor(line)
        const resolvedFg = fg || theme.foreground
        return (
          <span key={`diff-line-${idx}`} fg={resolvedFg} attributes={attrs}>
            {line}
            {idx < filteredLines.length - 1 ? '\n' : ''}
          </span>
        )
      })}
    </text>
  )
}
