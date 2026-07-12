import { useState } from 'react'
import { TextAttributes } from '@opentui/core'

import { Button } from '../button'
import { useTheme } from '../../hooks/use-theme'
import { wrapTextToVisualLines } from '../../utils/text-layout'

import type { ReactNode } from 'react'
import type { ThemeName } from '../../types/theme-system'

interface DiffViewerProps {
  diffText: string
  availableWidth?: number
  /** Opt-in side-by-side render mode (degrades to unified when width < 40). */
  sideBySide?: boolean
  /** Render old/new line-number gutters. Defaults to true. */
  showLineNumbers?: boolean
  /** Allow per-hunk expand/collapse toggles. Defaults to true. */
  collapsible?: boolean
  /** Hunk indices (0-based) that start collapsed. Defaults to none. */
  initiallyCollapsedHunks?: number[]
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

type BodyLineType = 'add' | 'del' | 'context'

interface BodyLine {
  type: BodyLineType
  text: string
  oldNum: number | null
  newNum: number | null
}

interface Hunk {
  index: number
  header: string
  bodyLines: BodyLine[]
  oldStart: number
  newStart: number
  oldLen: number
  newLen: number
}

interface ParsedDiff {
  fileHeaders: string[]
  hunks: Hunk[]
}

export const DIFF_INITIAL_MAX_LINES = 80
export const DIFF_INITIAL_MAX_HUNKS = 8
export const DIFF_MAX_RENDER_NODES = 400

export function getInitiallyCollapsedDiffHunks(parsed: ParsedDiff): number[] {
  let visibleLines = 0
  return parsed.hunks
    .filter((hunk, index) => {
      if (index >= DIFF_INITIAL_MAX_HUNKS) return true
      if (visibleLines + hunk.bodyLines.length > DIFF_INITIAL_MAX_LINES) {
        return true
      }
      visibleLines += hunk.bodyLines.length
      return false
    })
    .map((hunk) => hunk.index)
}

interface SideBySideRow {
  oldSide: BodyLine | null
  newSide: BodyLine | null
}

const lineColor = (
  line: string,
  themeName: ThemeName,
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

const isFileHeaderLine = (line: string): boolean =>
  line.startsWith('diff ') ||
  line.startsWith('index ') ||
  // Only treat `--- a/...` / `+++ b/...` (git file-header form) as headers.
  // A bare `--- some text` is a deletion of a line starting with `--`
  // (common in SQL/Lua/Haskell comments), not a header, so it must stay in
  // the hunk body as a deletion.
  /^---\s+a\//.test(line) ||
  /^\+\+\+\s+b\//.test(line) ||
  line.startsWith('rename ') ||
  line.startsWith('similarity ')
// Note: lines starting with `\` ("No newline at end of file") are skipped
// earlier in parseDiffIntoHunks before isFileHeaderLine is consulted, so no
// `\` branch is needed here.

const HUNK_RE = /^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@?(.*)$/

function parseHunkHeader(
  line: string,
): Pick<Hunk, 'oldStart' | 'newStart' | 'oldLen' | 'newLen'> {
  const m = line.match(HUNK_RE)
  if (m) {
    return {
      oldStart: parseInt(m[1], 10),
      newStart: parseInt(m[3], 10),
      // git diff convention: an omitted count means 1, not 0.
      oldLen: m[2] ? parseInt(m[2], 10) : 1,
      newLen: m[4] ? parseInt(m[4], 10) : 1,
    }
  }
  // Degenerate `@@` (no ranges) or any tolerant fallback: default to line 1.
  return { oldStart: 1, newStart: 1, oldLen: 0, newLen: 0 }
}

/**
 * Split a unified diff into leading file-header lines and a list of hunks.
 * Each hunk body line carries its (possibly null) old/new line number, with
 * running counters tracked the way `git diff` does:
 * - context: increments both old and new
 * - del: increments old only
 * - add: increments new only
 * `\\ No newline at end of file` markers are skipped (not rendered as rows).
 */
export function parseDiffIntoHunks(diffText: string): ParsedDiff {
  const rawLines = diffText.length
    ? diffText.replace(/\n+$/, '').split('\n')
    : []
  const fileHeaders: string[] = []
  const hunks: Hunk[] = []
  let currentHunk: Hunk | null = null
  let oldLine = 0
  let newLine = 0

  const pushHunk = () => {
    if (currentHunk) {
      hunks.push(currentHunk)
      currentHunk = null
    }
  }

  for (const raw of rawLines) {
    // No-newline marker: attach to prior line, never render as a body row.
    if (raw.startsWith('\\')) {
      if (!currentHunk) {
        fileHeaders.push(raw)
      }
      continue
    }

    if (raw.startsWith('@@')) {
      pushHunk()
      const { oldStart, newStart, oldLen, newLen } = parseHunkHeader(raw)
      currentHunk = {
        index: hunks.length,
        header: raw,
        bodyLines: [],
        oldStart,
        newStart,
        oldLen,
        newLen,
      }
      oldLine = oldStart
      newLine = newStart
      continue
    }

    if (!currentHunk) {
      // Leading file-header section before the first hunk.
      fileHeaders.push(raw)
      continue
    }

    // A new file section appearing after a hunk: close the hunk and treat as header.
    if (isFileHeaderLine(raw)) {
      pushHunk()
      fileHeaders.push(raw)
      continue
    }

    if (raw.startsWith('+')) {
      currentHunk.bodyLines.push({
        type: 'add',
        text: raw.slice(1),
        oldNum: null,
        newNum: newLine,
      })
      newLine += 1
    } else if (raw.startsWith('-')) {
      currentHunk.bodyLines.push({
        type: 'del',
        text: raw.slice(1),
        oldNum: oldLine,
        newNum: null,
      })
      oldLine += 1
    } else if (raw.startsWith(' ')) {
      currentHunk.bodyLines.push({
        type: 'context',
        text: raw.slice(1),
        oldNum: oldLine,
        newNum: newLine,
      })
      oldLine += 1
      newLine += 1
    } else if (raw === '') {
      // Blank line within a hunk: treat as empty context.
      currentHunk.bodyLines.push({
        type: 'context',
        text: '',
        oldNum: oldLine,
        newNum: newLine,
      })
      oldLine += 1
      newLine += 1
    } else {
      // Unknown content line: preserve as context.
      currentHunk.bodyLines.push({
        type: 'context',
        text: raw,
        oldNum: oldLine,
        newNum: newLine,
      })
      oldLine += 1
      newLine += 1
    }
  }

  pushHunk()
  return { fileHeaders, hunks }
}

/** Right-align a line number into `width` columns; null -> blank gutter. */
export function formatLineNumber(num: number | null, width = 4): string {
  if (num === null || num === undefined) return ' '.repeat(width)
  const s = String(num)
  if (s.length >= width) return s
  return ' '.repeat(width - s.length) + s
}

/** Pair consecutive del<->add lines into side-by-side rows; context spans both. */
function pairSideBySideRows(bodyLines: BodyLine[]): SideBySideRow[] {
  const rows: SideBySideRow[] = []
  let i = 0
  while (i < bodyLines.length) {
    const line = bodyLines[i]
    if (line.type === 'context') {
      rows.push({ oldSide: line, newSide: line })
      i += 1
      continue
    }
    if (line.type === 'del') {
      const dels: BodyLine[] = []
      while (i < bodyLines.length && bodyLines[i].type === 'del') {
        dels.push(bodyLines[i])
        i += 1
      }
      const adds: BodyLine[] = []
      while (i < bodyLines.length && bodyLines[i].type === 'add') {
        adds.push(bodyLines[i])
        i += 1
      }
      const max = Math.max(dels.length, adds.length)
      for (let k = 0; k < max; k++) {
        rows.push({ oldSide: dels[k] ?? null, newSide: adds[k] ?? null })
      }
      continue
    }
    // Pure additions with no preceding deletion.
    const adds: BodyLine[] = []
    while (i < bodyLines.length && bodyLines[i].type === 'add') {
      adds.push(bodyLines[i])
      i += 1
    }
    for (const a of adds) rows.push({ oldSide: null, newSide: a })
  }
  return rows
}

export const DiffViewer = ({
  diffText,
  availableWidth,
  sideBySide = false,
  showLineNumbers = true,
  collapsible = true,
  initiallyCollapsedHunks = [],
}: DiffViewerProps) => {
  const theme = useTheme()
  const parsedDiff = parseDiffIntoHunks(diffText)
  const [collapsedHunks, setCollapsedHunks] = useState<Set<number>>(
    () =>
      new Set([
        ...getInitiallyCollapsedDiffHunks(parsedDiff),
        ...initiallyCollapsedHunks,
      ]),
  )
  const width = Math.max(10, availableWidth ?? 80)
  const effectiveShowLineNumbers = showLineNumbers && width >= 24
  let renderNodeCount = 0

  const toggleHunk = (index: number) => {
    setCollapsedHunks((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  const colorForType = (type: BodyLineType): string =>
    type === 'add'
      ? DIFF_LINE_COLORS[theme.name].added
      : type === 'del'
        ? DIFF_LINE_COLORS[theme.name].removed
        : theme.foreground

  // Unified-mode geometry: gutter = ' ' + old(4) + ' ' + new(4) + '│'
  const gutterWidth = effectiveShowLineNumbers ? 1 + 4 + 1 + 4 + 1 : 0
  const signWidth = 1
  const textWrapWidth = Math.max(1, width - gutterWidth - signWidth)

  // Side-by-side geometry (only when width is comfortable).
  const useSideBySide = sideBySide && width >= 40
  const sxsSeparator = ' │ '
  const sxsColumnWidth = useSideBySide
    ? Math.max(1, Math.floor((width - sxsSeparator.length) / 2))
    : 0
  const sxsNumWidth = 5 // 4-wide number + trailing space
  const sxsTextWidth = Math.max(1, sxsColumnWidth - sxsNumWidth)

  if (diffText.trim() === '') {
    return (
      <box
        style={{ flexDirection: 'column', gap: 0, width: '100%', flexGrow: 1 }}
      >
        <text style={{ wrapMode: 'none' }}>
          <span fg={theme.muted}>(no changes)</span>
        </text>
      </box>
    )
  }

  const { fileHeaders, hunks } = parsedDiff

  const renderFileHeader = (line: string, idx: number): ReactNode => {
    const safeLine = line.length === 0 ? ' ' : line
    const { fg, attrs } = lineColor(line, theme.name, theme.muted)
    const resolvedFg = fg || theme.foreground
    return wrapTextToVisualLines(safeLine, width).map((wrappedLine, wrapIdx) =>
      renderNodeCount++ < DIFF_MAX_RENDER_NODES ? (
        <text key={`fh-${idx}-${wrapIdx}`} style={{ wrapMode: 'none' }}>
          <span fg={resolvedFg} attributes={attrs}>
            {wrappedLine}
          </span>
        </text>
      ) : null,
    )
  }

  const renderHunkHeader = (hunk: Hunk): ReactNode => {
    const collapsed = collapsedHunks.has(hunk.index)
    const hasBody = hunk.bodyLines.length > 0
    const marker = collapsed ? '▸' : '▾'
    const label =
      collapsed && hasBody
        ? `${marker} ${hunk.header} (${hunk.bodyLines.length} lines hidden)`
        : `${marker} ${hunk.header}`

    if (collapsible && hasBody) {
      return (
        <box style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Button
            onClick={() => toggleHunk(hunk.index)}
            style={{ flexDirection: 'row' }}
          >
            <text style={{ wrapMode: 'none' }}>
              <span fg="cyan" attributes={TextAttributes.BOLD}>
                {label}
              </span>
            </text>
          </Button>
        </box>
      )
    }

    const headerText =
      hasBody && collapsible ? `${marker} ${hunk.header}` : hunk.header
    return (
      <box style={{ flexDirection: 'row', alignItems: 'center' }}>
        <text style={{ wrapMode: 'none' }}>
          <span fg="cyan" attributes={TextAttributes.BOLD}>
            {headerText}
          </span>
        </text>
      </box>
    )
  }

  const renderUnifiedBody = (hunk: Hunk): ReactNode =>
    hunk.bodyLines.flatMap((bodyLine, lineIdx) => {
      const sign =
        bodyLine.type === 'add' ? '+' : bodyLine.type === 'del' ? '-' : ' '
      const color = colorForType(bodyLine.type)
      const wrapped = wrapTextToVisualLines(bodyLine.text, textWrapWidth)
      return wrapped.map((seg, wrapIdx) => {
        const isFirst = wrapIdx === 0
        const oldStr = formatLineNumber(isFirst ? bodyLine.oldNum : null)
        const newStr = formatLineNumber(isFirst ? bodyLine.newNum : null)
        const gutter = effectiveShowLineNumbers ? ` ${oldStr} ${newStr}│` : ''
        const signChar = isFirst ? sign : ' '
        if (renderNodeCount++ >= DIFF_MAX_RENDER_NODES) return null
        return (
          <text
            key={`b-${hunk.index}-${lineIdx}-${wrapIdx}`}
            style={{ wrapMode: 'none' }}
          >
            {effectiveShowLineNumbers ? (
              <span fg={theme.muted}>{gutter}</span>
            ) : null}
            <span fg={color}>
              {signChar}
              {seg}
            </span>
          </text>
        )
      })
    })

  const renderSideBySideBody = (hunk: Hunk): ReactNode => {
    const rows = pairSideBySideRows(hunk.bodyLines)
    return rows.flatMap((row, rowIdx) => {
      const leftColor = row.oldSide
        ? colorForType(row.oldSide.type)
        : theme.muted
      const rightColor = row.newSide
        ? colorForType(row.newSide.type)
        : theme.muted
      const leftWrapped = row.oldSide
        ? wrapTextToVisualLines(row.oldSide.text, Math.max(1, sxsTextWidth - 1))
        : ['']
      const rightWrapped = row.newSide
        ? wrapTextToVisualLines(row.newSide.text, Math.max(1, sxsTextWidth - 1))
        : ['']
      const maxLines = Math.max(leftWrapped.length, rightWrapped.length, 1)
      const out: ReactNode[] = []
      for (let w = 0; w < maxLines; w++) {
        if (renderNodeCount++ >= DIFF_MAX_RENDER_NODES) break
        const leftSeg = leftWrapped[w] ?? ''
        const rightSeg = rightWrapped[w] ?? ''
        const leftNum =
          w === 0 && row.oldSide ? formatLineNumber(row.oldSide.oldNum) : null
        const rightNum =
          w === 0 && row.newSide ? formatLineNumber(row.newSide.newNum) : null
        const leftMarker = w === 0 && row.oldSide?.type === 'del' ? '-' : ' '
        const rightMarker = w === 0 && row.newSide?.type === 'add' ? '+' : ' '
        out.push(
          <text
            key={`sxs-${hunk.index}-${rowIdx}-${w}`}
            style={{ wrapMode: 'none' }}
          >
            {effectiveShowLineNumbers ? (
              <span fg={theme.muted}>
                {leftNum !== null ? `${leftNum} ` : ''.padEnd(sxsNumWidth)}
              </span>
            ) : null}
            <span fg={leftColor}>
              {leftMarker}
              {leftSeg.padEnd(Math.max(1, sxsTextWidth - 1))}
            </span>
            <span fg={theme.muted}>{sxsSeparator}</span>
            {effectiveShowLineNumbers ? (
              <span fg={theme.muted}>
                {rightNum !== null ? `${rightNum} ` : ''.padEnd(sxsNumWidth)}
              </span>
            ) : null}
            <span fg={rightColor}>
              {rightMarker}
              {rightSeg}
            </span>
          </text>,
        )
      }
      return out
    })
  }

  return (
    <box
      style={{ flexDirection: 'column', gap: 0, width: '100%', flexGrow: 1 }}
    >
      {fileHeaders.flatMap((line, idx) => renderFileHeader(line, idx))}
      {hunks.map((hunk) => {
        const collapsed = collapsedHunks.has(hunk.index)
        return (
          <box
            key={`hunk-${hunk.index}`}
            style={{ flexDirection: 'column', gap: 0, width: '100%' }}
          >
            {renderHunkHeader(hunk)}
            {!collapsed
              ? useSideBySide
                ? renderSideBySideBody(hunk)
                : renderUnifiedBody(hunk)
              : null}
          </box>
        )
      })}
      {renderNodeCount >= DIFF_MAX_RENDER_NODES ? (
        <text
          fg={theme.muted}
        >{`… render capped at ${DIFF_MAX_RENDER_NODES} nodes; collapse hunks or narrow the diff`}</text>
      ) : null}
    </box>
  )
}
