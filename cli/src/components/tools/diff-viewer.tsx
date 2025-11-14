import { TextAttributes } from '@opentui/core'
import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'

import { useTheme } from '../../hooks/use-theme'
import { logger } from '../../utils/logger'
import {
  highlightCode,
  highlightCodeSync,
} from '../../utils/syntax-highlighter'

interface DiffViewerProps {
  diffText: string
  filePath: string | undefined
}

const DIFF_LINE_COLORS = {
  added: '#B6BD73',
  removed: '#BF6C69',
}

/**
 * Extract language from file path
 */
const getLanguageFromPath = (filePath: string): string | undefined => {
  const ext = filePath.split('.').pop()?.toLowerCase()
  if (!ext) return undefined

  // Map common extensions to cli-highlight language names
  const langMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    py: 'python',
    rb: 'ruby',
    java: 'java',
    c: 'c',
    cpp: 'cpp',
    cc: 'cpp',
    cxx: 'cpp',
    h: 'cpp',
    hpp: 'cpp',
    cs: 'csharp',
    go: 'go',
    rs: 'rust',
    php: 'php',
    swift: 'swift',
    kt: 'kotlin',
    scala: 'scala',
    sh: 'bash',
    bash: 'bash',
    zsh: 'bash',
    json: 'json',
    xml: 'xml',
    html: 'html',
    css: 'css',
    scss: 'scss',
    sass: 'sass',
    md: 'markdown',
    yaml: 'yaml',
    yml: 'yaml',
    sql: 'sql',
  }

  return langMap[ext]
}

/**
 * Parse diff to extract file path from diff headers
 */
const parseCurrentFile = (
  lines: string[],
  currentIndex: number,
): string | undefined => {
  // Look backwards from current line to find the most recent diff header
  for (let i = currentIndex; i >= 0; i--) {
    const line = lines[i]
    if (line.startsWith('diff --git')) {
      // Extract file path from "diff --git a/path/to/file.ts b/path/to/file.ts"
      const match = line.match(/diff --git a\/(.+?) b\/(.+)/)
      if (match) {
        // Use the 'b' path (new file) as it's more relevant for added/modified files
        return match[2]
      }
    }
    if (line.startsWith('+++')) {
      // Extract from "+++ b/path/to/file.ts"
      const match = line.match(/^\+\+\+ b\/(.+)/)
      if (match) {
        return match[1]
      }
    }
  }
  return undefined
}

interface LineColorResult {
  fg: string
  attrs?: number
  isDiffMarker: boolean
}

const lineColor = (line: string): LineColorResult => {
  if (line.startsWith('@@')) {
    return { fg: 'cyan', attrs: TextAttributes.BOLD, isDiffMarker: true }
  }
  if (line.startsWith('+++') || line.startsWith('---')) {
    return { fg: 'gray', attrs: TextAttributes.BOLD, isDiffMarker: true }
  }
  if (
    line.startsWith('diff ') ||
    line.startsWith('index ') ||
    line.startsWith('rename ') ||
    line.startsWith('similarity ')
  ) {
    return { fg: 'gray', isDiffMarker: true }
  }
  if (line.startsWith('+')) {
    return { fg: DIFF_LINE_COLORS.added, isDiffMarker: false }
  }
  if (line.startsWith('-')) {
    return { fg: DIFF_LINE_COLORS.removed, isDiffMarker: false }
  }
  if (line.startsWith('\\')) {
    return { fg: 'gray', isDiffMarker: true }
  }
  return { fg: '', isDiffMarker: true }
}

/**
 * Render a diff line with syntax highlighting
 */
const renderDiffLine = (
  line: string,
  language: string | undefined,
  colorInfo: LineColorResult,
  theme: { foreground: string },
  highlightedCode?: ReactNode,
): ReactNode => {
  const { fg, attrs, isDiffMarker } = colorInfo
  const resolvedFg = fg || theme.foreground

  // For diff markers and context lines, just use plain coloring
  if (!language) {
    return (
      <span fg={resolvedFg} attributes={attrs}>
        {line}
      </span>
    )
  }

  // For code lines, extract the code content (after the +/- marker)
  const prefix = line[0] === '+' ? '+' : line[0] === '-' ? '-' : ''
  const codeContent = line.slice(prefix.length) // Remove the +/- prefix

  // Use pre-highlighted code if available, otherwise fallback to sync version
  const code = highlightedCode ?? highlightCodeSync(codeContent, language, {})

  // Wrap the highlighted code with diff color overlay
  return (
    <span fg={resolvedFg}>
      {prefix}
      {code}
    </span>
  )
}

export const DiffViewer = ({ diffText, filePath }: DiffViewerProps) => {
  const theme = useTheme()
  const lines = diffText.split('\n')
  const [highlightedLines, setHighlightedLines] = useState<
    Map<number, ReactNode>
  >(new Map())

  const language = filePath ? getLanguageFromPath(filePath) : undefined
  // Async highlight code lines progressively
  useEffect(() => {
    let ignore = false
    const newHighlights = new Map<number, ReactNode>()

    const highlightAllLines = async () => {
      logger.debug(
        { linesLength: lines.length, lines },
        '[DiffViewer] Starting async highlighting',
      )

      const promises = lines.map(async (rawLine, idx) => {
        const line = rawLine.length === 0 ? ' ' : rawLine

        logger.debug(
          { idx, line, file: filePath, language },
          '[DiffViewer] Line',
        )

        if (!language) return

        // Extract code content (after +/- marker)
        const codeContent = line.slice(1)

        logger.debug(
          { idx, line, language, content: codeContent.substring(0, 50) },
          '[DiffViewer] Highlighting line',
        )

        try {
          const highlighted = await highlightCode(codeContent, language, {})
          logger.debug(
            { idx, line, highlighted },
            '[DiffViewer] Successfully highlighted line',
          )
          if (!ignore) {
            newHighlights.set(idx, highlighted)
          }
        } catch (error) {
          logger.error(
            { idx, line, error },
            '[DiffViewer] Error highlighting line',
          )
          // Silently fall back to sync highlighting on error
        }
      })

      await Promise.all(promises)

      logger.debug(
        { highlights: newHighlights.size },
        '[DiffViewer] All highlighting complete',
      )

      if (!ignore) {
        setHighlightedLines(newHighlights)
      }
    }

    highlightAllLines()

    return () => {
      ignore = true
    }
  }, [diffText])

  return (
    <box
      style={{ flexDirection: 'column', gap: 0, width: '100%', flexGrow: 1 }}
    >
      {lines
        .filter((rawLine) => !rawLine.startsWith('@@'))
        .map((rawLine, idx) => {
          const line = rawLine.length === 0 ? ' ' : rawLine
          const colorInfo = lineColor(line)

          return (
            <text key={`diff-line-${idx}`} style={{ wrapMode: 'none' }}>
              {renderDiffLine(
                line,
                language,
                colorInfo,
                theme,
                highlightedLines.get(idx),
              )}
            </text>
          )
        })}
    </box>
  )
}
