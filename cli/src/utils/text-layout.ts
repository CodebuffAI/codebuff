import stringWidth from 'string-width'

// Keep measurement logic centralised so components can share consistent wrap behavior.
function measureLines(text: string, cols: number): number {
  if (text.length === 0) return 1

  let lines = 1
  let current = 0
  const tokens = text.split(/(\s+)/)

  const emitHardWrap = () => {
    lines += 1
    current = 0
  }

  const appendSegment = (
    segment: string,
    { flushBeforeOversize = true }: { flushBeforeOversize?: boolean } = {},
  ) => {
    if (!segment) return

    const segmentWidth = stringWidth(segment)
    if (segmentWidth > cols) {
      if (flushBeforeOversize && current > 0) emitHardWrap()
      let acc = 0
      for (const ch of Array.from(segment)) {
        const w = stringWidth(ch)
        if (acc + w > cols) {
          emitHardWrap()
          acc = 0
        }
        acc += w
      }
      current = acc
      return
    }

    if (current + segmentWidth > cols) emitHardWrap()
    current += segmentWidth
  }

  for (const token of tokens) {
    if (!token) continue

    if (token.includes('\n')) {
      const parts = token.split('\n')
      for (let i = 0; i < parts.length; i++) {
        appendSegment(parts[i], { flushBeforeOversize: false })
        if (i < parts.length - 1) emitHardWrap()
      }
      continue
    }

    appendSegment(token)
  }

  return lines
}

export function computeInputLayoutMetrics({
  layoutContent,
  cursorProbe,
  cols,
  maxHeight,
}: {
  layoutContent: string
  cursorProbe: string
  cols: number
  maxHeight: number
}): { heightLines: number; gutterEnabled: boolean } {
  const totalLines = measureLines(layoutContent, cols)
  const cursorLines = measureLines(cursorProbe, cols)

  // Add bottom gutter when cursor is on line 2 of exactly 2 lines
  const gutterEnabled =
    totalLines === 2 && cursorLines === 2 && totalLines + 1 <= maxHeight

  const heightLines = Math.max(
    1,
    Math.min(totalLines + (gutterEnabled ? 1 : 0), maxHeight),
  )

  return {
    heightLines,
    gutterEnabled,
  }
}
